// walkthrough prototype: the two write paths, in TODAY's order of checks (src/server/plugin.ts
// handlePostNotes / handlePostApproval), over Postgres instead of design/*.json. The status
// transitions themselves come from the unchanged pure reducers in src/server/patches.ts.
import { EMPTY_APPROVAL } from '../../schemas/version.js'
import type { Approval, Note, Notes } from '../../schemas/index.js'
import { scopeViolation } from '../../schemas/patches.js'
import type { AppliedNotesPatch, ApprovalPatch } from '../../schemas/patches.js'
import { applyApprovalPatch, applyNotesPatch, type ApprovalPatchCtx } from '../patches.js'
import { getPool, inTransaction } from '../db/pool.js'
import {
  AnchorSchema,
  approvalDoc,
  approvalRows,
  deleteNote,
  insertNote,
  journeyExists,
  loadNotes,
  servedJourneys,
  updateNote,
  upsertApproval,
  upsertJourneyThread,
  type RoundRow,
} from './data.js'
import { emit } from './events.js'

/** A refusal in both vocabularies: `code` (seam C's kebab) and `sentence` (today's page text). */
export type Refusal = { ok: false; status: number; code: string; sentence: string; detail?: unknown }
export type Done<T> = { ok: true; value: T }

function refuse(status: number, code: string, sentence: string, detail?: unknown): Refusal {
  return { ok: false, status, code, sentence, ...(detail !== undefined ? { detail } : {}) }
}

/** One in-process write queue per project (today's `withWriteLock`, now keyed by project). */
const locks = new Map<string, Promise<unknown>>()

function withProjectLock<T>(project: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(project) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  locks.set(
    project,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

const GEOMETRY_FIELDS = ['component', 'key', 'screen', 'state']

/**
 * Applies one notes patch for `project`. `role` is already decided and `patch` already admitted
 * (op-level client gate + `by:'client'` rewrite, done by the route exactly as today). `roundForAdd`
 * is the round a new note belongs to when the note itself does not name one.
 */
export function writeNotes(
  project: string,
  role: 'owner' | 'client',
  patch: AppliedNotesPatch,
  roundForAdd: number | null,
): Promise<Done<Notes> | Refusal> {
  return withProjectLock(project, async () => {
    const db = getPool()
    let notes = await loadNotes(db, project)

    // today: update/remove of an unknown id → 404, nothing changes.
    if ((patch.op === 'update' || patch.op === 'remove') && !notes.notes.some((n) => n.id === patch.id)) {
      return refuse(404, 'unknown-note', `note ${patch.id} does not exist`)
    }

    // seam A: an explicit anchor must be one of the two anchor shapes (or null).
    const sentAnchor =
      patch.op === 'add' ? (patch.note as Record<string, unknown>)['anchor'] : patch.op === 'update' ? (patch.fields as Record<string, unknown>)['anchor'] : undefined
    if (sentAnchor !== undefined && !AnchorSchema.safeParse(sentAnchor).success) {
      return refuse(400, 'bad-anchor', 'invalid notes patch', AnchorSchema.safeParse(sentAnchor).error?.issues)
    }

    // today D6: update's scope invariant, checked on the MERGED note.
    if (patch.op === 'update') {
      const existing = notes.notes.find((n) => n.id === patch.id)
      if (existing) {
        const screen = patch.fields.screen !== undefined ? patch.fields.screen : existing.screen
        const project_ = patch.fields.project !== undefined ? patch.fields.project : existing.project
        if (scopeViolation({ screen, project: project_ })) return refuse(400, 'bad-scope', 'invalid notes patch')
      }
    }

    // today D1/D10/D11: close/reply may target a note or a journey conversation; unknown
    // everywhere → 404; a real journey with no conversation yet is seeded.
    if (patch.op === 'close' || patch.op === 'reply') {
      const isNote = notes.notes.some((n) => n.id === patch.id)
      if (!isNote && !(patch.id in notes.journeys)) {
        if (!(await journeyExists(db, project, patch.id))) return refuse(404, 'unknown-note', `${patch.id} is neither a note nor a journey`)
        notes = { ...notes, journeys: { ...notes.journeys, [patch.id]: { status: 'open', thread: [] } } }
      }
      if (patch.op === 'close' && role === 'client') {
        const note = notes.notes.find((n) => n.id === patch.id)
        const thread = note ? note.thread : notes.journeys[patch.id]?.thread
        if (thread?.[0]?.by !== 'client') return refuse(403, 'forbidden', 'This review link cannot make that change.')
      }
    }

    // A new note belongs to a round: its own `round` when the page sent one, else the round the
    // request was made against.
    let applied: AppliedNotesPatch = patch
    if (patch.op === 'add') {
      const own = (patch.note as Record<string, unknown>)['round']
      const round = typeof own === 'number' && Number.isInteger(own) ? own : roundForAdd
      if (round === null) return refuse(409, 'no-round', 'there is no round to leave a note on yet')
      applied = { ...patch, note: { ...patch.note, round } }
    }

    const result = applyNotesPatch(notes, applied, EMPTY_APPROVAL)

    await inTransaction(async (tx) => {
      switch (applied.op) {
        case 'add': {
          const added = result.notes.notes[result.notes.notes.length - 1]
          if (added) await insertNote(tx, project, added)
          break
        }
        case 'remove':
          await deleteNote(tx, project, applied.id)
          break
        case 'update': {
          const updated = result.notes.notes.find((n) => n.id === applied.id)
          if (!updated) break
          const fields = applied.fields as Record<string, unknown>
          // re-anchoring by component/key without an `anchor`:
          // drop the stored anchor so it is re-derived from the new geometry.
          const touched = GEOMETRY_FIELDS.some((f) => f in fields)
          const toWrite: Note = touched && !('anchor' in fields) ? withoutAnchor(updated) : updated
          await updateNote(tx, project, toWrite)
          break
        }
        case 'reply':
        case 'close': {
          const note = result.notes.notes.find((n) => n.id === applied.id)
          if (note) await updateNote(tx, project, note)
          else {
            const conv = result.notes.journeys[applied.id]
            if (conv) await upsertJourneyThread(tx, project, applied.id, conv)
          }
          break
        }
      }
    })

    emit(project, 'notes')
    return { ok: true as const, value: await loadNotes(db, project) }
  })
}

function withoutAnchor(note: Note): Note {
  const copy: Record<string, unknown> = { ...note }
  delete copy['anchor']
  return copy as Note
}

/**
 * Applies one approval patch against the round the request was made for. Today's three clientOk
 * refusals, in today's order: unknown journey 400, no beats 400, beats mismatch 409.
 */
export function writeApproval(project: string, patch: ApprovalPatch, round: RoundRow | null): Promise<Done<Approval> | Refusal> {
  return withProjectLock(project, async () => {
    const db = getPool()
    if (patch.op === 'approveScreen') {
      return refuse(400, 'unsupported-op', 'screen approval is not part of walkthrough')
    }
    const journeys = round ? await servedJourneys(db, project, round) : []
    const journey = journeys.find((j) => j.id === patch.id)
    if (patch.op === 'clientOk') {
      if (!journey || !round) return refuse(400, 'unknown-journey', `unknown journey ${patch.id}`)
      if (journey.beats === null) {
        return refuse(400, 'no-beats', `journey ${patch.id} has no beats — every step needs a sentence before a client can confirm it`)
      }
      if (patch.beats !== journey.beats) return refuse(409, 'beats-mismatch', 'story changed since it was shown — reload')
    }
    if (!round) return refuse(400, 'unknown-journey', `unknown journey ${patch.id}`)

    const ctx: ApprovalPatchCtx = {
      hash: () => '',
      config: { name: null, port: null, targets: null, theme: null, client: null },
      statesOf: () => [],
      screenshotsFor: () => [],
      beatsHash: (id) => journeys.find((j) => j.id === id)?.beats ?? null,
    }
    const next = applyApprovalPatch(approvalDoc(await approvalRows(db, project)), patch, ctx)
    const entry = next.journeys[patch.id]
    await upsertApproval(db, project, {
      journey: patch.id,
      by: patch.op === 'clientOk' ? 'client' : 'owner',
      round: round.n,
      beats: entry?.beats ?? '',
      at: entry?.at ?? new Date().toISOString(),
      reason: patch.op === 'waive' ? patch.reason : null,
    })
    emit(project, 'approval')
    return { ok: true as const, value: approvalDoc(await approvalRows(db, project)) }
  })
}
