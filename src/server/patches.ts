// D6/D7/D16: pure, zod-validated appliers over `design/notes.json` and `design/approval.json`.
// The server (plugin.ts) is the only writer while `serve` runs — every mutation goes through one
// of these two functions so the CLI's `answer` and the page's controls can never disagree about
// rule 6 (un-approve on a new/reopened note, D7).
import type { Approval, Config, NullConfig, Note, Notes } from '../schemas/index.js'
import { EMPTY_APPROVAL } from '../schemas/index.js'
import type { ApprovalPatch, NotesPatch } from '../schemas/patches.js'

/** D5: `N` + zero-padded (3 digits) max existing numeric id + 1. */
function nextNoteId(existing: readonly Note[]): string {
  let max = 0
  for (const n of existing) {
    const match = /^N(\d+)$/.exec(n.id)
    if (match) {
      const num = Number(match[1])
      if (num > max) max = num
    }
  }
  return `N${String(max + 1).padStart(3, '0')}`
}

/** A plain `{ ...base, ...fields }` spread types every optional `fields` property as
 * `T[K] | undefined` (a TS quirk with `exactOptionalPropertyTypes`), which `Note`'s explicit
 * `string | null` fields reject. Only a key whose patch value is not `undefined` is applied, so
 * an explicit `null` (a real value for `screen`/`component`/etc.) still overwrites. */
function mergeDefined<T extends Record<string, unknown>>(base: T, fields: Record<string, unknown>): T {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) merged[key] = value
  }
  return merged as T
}

/** D7 rule 6: a new note (or a note turning `open`) on `name` deletes `approval.screens[name]`
 * when present; a no-op otherwise (never allocates a new object needlessly). */
function unapproveScreen(approval: Approval, name: string): Approval {
  if (!(name in approval.screens)) return approval
  const nextScreens = { ...approval.screens }
  delete nextScreens[name]
  return { ...approval, screens: nextScreens }
}

/**
 * D6/D16: `applyNotesPatch(notes, patch, approval = EMPTY_APPROVAL)` -> `{ notes, approval }`.
 * `approval` is read (never required) so rule 6 can un-approve a screen in the same call; a
 * caller with no approval document yet (e.g. a pure unit test) may omit it.
 */
export function applyNotesPatch(
  notes: Notes,
  patch: NotesPatch,
  approval: Approval = EMPTY_APPROVAL,
): { notes: Notes; approval: Approval } {
  switch (patch.op) {
    case 'add': {
      // D23: `op:'add'` never accepts a caller-supplied id — `NotesPatchSchema`'s `add.note` is
      // `NoteSchema.omit({id:true})`, so `patch.note` carries no `id` field at all; the server
      // always assigns the next sequential one.
      const id = nextNoteId(notes.notes)
      const note: Note = { ...patch.note, id }
      const nextNotes: Notes = { ...notes, notes: [...notes.notes, note] }
      const nextApproval = note.screen !== null ? unapproveScreen(approval, note.screen) : approval
      return { notes: nextNotes, approval: nextApproval }
    }

    case 'update': {
      // D23: an unknown id is a no-op here (the route layer answers 404 and never calls this
      // function for an id it hasn't already confirmed exists — see plugin.ts's `handlePostNotes`
      // — this fallback just keeps the function total for a direct/test caller).
      const idx = notes.notes.findIndex((n) => n.id === patch.id)
      if (idx === -1) return { notes, approval }
      const existing = notes.notes[idx]
      if (!existing) return { notes, approval }
      const updated: Note = mergeDefined(existing, patch.fields)
      const nextArr = notes.notes.slice()
      nextArr[idx] = updated
      const nextNotes: Notes = { ...notes, notes: nextArr }

      // D7 rule 6: a note turning `open` un-approves its (resulting) screen.
      const turnedOpen = patch.fields.status === 'open'
      let nextApproval = turnedOpen && updated.screen !== null ? unapproveScreen(approval, updated.screen) : approval

      // D23: an update that also moves the note to another screen un-approves *both* the old and
      // the new screen, when the result is `open` (whether it was already open or just turned
      // open by this same patch) — the note's presence on either screen is now stale otherwise.
      const screenMoved = patch.fields.screen !== undefined && patch.fields.screen !== existing.screen
      if (screenMoved && updated.status === 'open') {
        if (existing.screen !== null) nextApproval = unapproveScreen(nextApproval, existing.screen)
        if (updated.screen !== null) nextApproval = unapproveScreen(nextApproval, updated.screen)
      }

      return { notes: nextNotes, approval: nextApproval }
    }

    case 'remove': {
      // D23: an unknown id is a no-op here too — see the `update` case's note above.
      const nextNotes: Notes = { ...notes, notes: notes.notes.filter((n) => n.id !== patch.id) }
      return { notes: nextNotes, approval }
    }

    case 'journey': {
      const existing = notes.journeys[patch.id] ?? { status: 'open' as const, thread: [] }
      let status = patch.status ?? existing.status
      let thread = existing.thread
      // D7 rule 7: any reply (an `entry`) reopens the journey's conversation regardless of any
      // `status` the caller also passed.
      if (patch.entry) {
        thread = [...thread, patch.entry]
        status = 'open'
      }
      const nextNotes: Notes = { ...notes, journeys: { ...notes.journeys, [patch.id]: { status, thread } } }
      return { notes: nextNotes, approval }
    }
  }
}

/** D16: the context `applyApprovalPatch` needs beyond the patch itself — the current screen
 * hash/states/screenshots come from the caller (the server's live `ServerState`, or a test's
 * stub) rather than being recomputed here, so this stays a pure function. */
export type ApprovalPatchCtx = {
  hash: (name: string) => string
  config: Config | NullConfig
  statesOf: (name: string) => string[]
  screenshotsFor: (name: string) => string[]
}

/** D6/D7/D16: `applyApprovalPatch(approval, patch, ctx)` -> the new `Approval` document. */
export function applyApprovalPatch(approval: Approval, patch: ApprovalPatch, ctx: ApprovalPatchCtx): Approval {
  switch (patch.op) {
    case 'approveScreen': {
      const targets = ctx.config.targets
      const entry = {
        hash: ctx.hash(patch.name),
        approvedAt: new Date().toISOString(),
        states: ctx.statesOf(patch.name),
        viewports: targets ? targets.viewports : [],
        schemes: targets ? targets.schemes : [],
        screenshots: ctx.screenshotsFor(patch.name),
      }
      return { ...approval, screens: { ...approval.screens, [patch.name]: entry } }
    }

    case 'unapproveScreen': {
      if (!(patch.name in approval.screens)) return approval
      const nextScreens = { ...approval.screens }
      delete nextScreens[patch.name]
      return { ...approval, screens: nextScreens }
    }

    case 'approveJourney': {
      const existing = approval.journeys[patch.id] ?? { approvedAt: null, client: null }
      return { ...approval, journeys: { ...approval.journeys, [patch.id]: { ...existing, approvedAt: new Date().toISOString() } } }
    }

    case 'clientOk': {
      const existing = approval.journeys[patch.id] ?? { approvedAt: null, client: null }
      return { ...approval, journeys: { ...approval.journeys, [patch.id]: { ...existing, client: 'ok' } } }
    }

    case 'theme': {
      return { ...approval, theme: patch.key }
    }
  }
}
