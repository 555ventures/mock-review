// walkthrough prototype: every Postgres read/write the routes need, and the mapping between table
// rows and TODAY's document shapes (`Notes`, `Approval`, `ServerState`) so the existing pure
// reducers in src/server/patches.ts run unchanged over them.
import { z } from 'zod'
import { CONTRACT_VERSION } from '../../schemas/version.js'
import type { Approval, Journey, Note, Notes, ThreadEntry } from '../../schemas/index.js'
import type { ServerJourney, ServerScreen, ServerState } from '../../schemas/patches.js'
import type { Db } from '../db/pool.js'
import { isRecord } from './http.js'
import { navigateTargets } from './validate.js'

export type RoundKind = 'wireframe' | 'screenshots'
export type RoundStatus = 'uploading' | 'open' | 'answered' | 'closed'
export type RoundRow = { n: number; kind: RoundKind; status: RoundStatus; viewports: string[] | null }

export const DEFAULT_WIREFRAME_VIEWPORTS = ['1280x800', '390x844']
export const SCREEN_ANCHOR = '__screen'

// ---------------------------------------------------------------- anchors (seam A)

const FractionRect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict()

export const WireframeAnchorSchema = z
  .object({
    node: z.string().nullable(),
    index: z.number().int().nullable(),
    rect: FractionRect.nullable(),
    viewport: z.enum(['desktop', 'mobile']),
  })
  .strict()

export const ScreenshotAnchorSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1).nullable(),
    h: z.number().min(0).max(1).nullable(),
    width: z.number().int().positive(),
  })
  .strict()

export const AnchorSchema = z.union([WireframeAnchorSchema, ScreenshotAnchorSchema]).nullable()
export type Anchor = z.infer<typeof AnchorSchema>

type Rect = { x: number; y: number; w: number; h: number }

function asRect(value: unknown): Rect | null {
  const parsed = FractionRect.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** A note sent the way today's page sends it (component/key/rect/viewport, no `anchor`) → the seam
 * A anchor. `null` for a project note or a whole-screen note with no drawn area. */
export function deriveAnchor(note: Record<string, unknown>): Anchor {
  if (note['project'] === true) return null
  const component = typeof note['component'] === 'string' ? note['component'] : null
  const rect = asRect(note['rect'])
  const node = component === null || component === SCREEN_ANCHOR ? null : component
  if (node === null && rect === null) return null
  const key = typeof note['key'] === 'string' && /^\d+$/.test(note['key']) ? Number(note['key']) : null
  const viewport = note['viewport'] === 'mobile' ? 'mobile' : 'desktop'
  return { node, index: node === null ? null : key, rect, viewport }
}

// ---------------------------------------------------------------- rounds

type RoundDbRow = { n: number; kind: RoundKind; status: RoundStatus; viewports: string[] | null }

export async function roundRow(db: Db, project: string, n: number): Promise<RoundRow | null> {
  const { rows } = await db.query<RoundDbRow>('select n, kind, status, viewports from rounds where project = $1 and n = $2', [project, n])
  return rows[0] ?? null
}

/** The round the reviewer sees: `requested` when given and visible, else the newest visible one.
 * A round still `uploading` is invisible either way. */
export async function visibleRound(db: Db, project: string, requested: number | null): Promise<RoundRow | null> {
  if (requested !== null) {
    const row = await roundRow(db, project, requested)
    return row && row.status !== 'uploading' ? row : null
  }
  const { rows } = await db.query<RoundDbRow>(
    "select n, kind, status, viewports from rounds where project = $1 and status <> 'uploading' order by n desc limit 1",
    [project],
  )
  return rows[0] ?? null
}

// ---------------------------------------------------------------- screens & journeys

export type ScreenRow = { name: string; state: string; spec: unknown }

export async function screenRows(db: Db, project: string, round: number): Promise<ScreenRow[]> {
  const { rows } = await db.query<ScreenRow>(
    'select name, state, spec from screens where project = $1 and round = $2 order by ord, name, state',
    [project, round],
  )
  return rows
}

export type StepIn = { screen: string; beat?: string; state?: string }
type JourneyRow = { id: string; title: string | null; persona: string | null; steps: StepIn[]; beats: string | null }

export async function journeyRows(db: Db, project: string, round: number): Promise<JourneyRow[]> {
  const { rows } = await db.query<JourneyRow>(
    'select id, title, persona, steps, beats from journeys where project = $1 and round = $2 order by ord, id',
    [project, round],
  )
  return rows
}

/** Screens grouped by name (push order), states in push order. */
function groupScreens(rows: ScreenRow[]): { name: string; states: string[]; specs: Map<string, unknown> }[] {
  const byName = new Map<string, { name: string; states: string[]; specs: Map<string, unknown> }>()
  for (const row of rows) {
    let entry = byName.get(row.name)
    if (!entry) {
      entry = { name: row.name, states: [], specs: new Map() }
      byName.set(row.name, entry)
    }
    entry.states.push(row.state)
    entry.specs.set(row.state, row.spec)
  }
  return [...byName.values()]
}

/** Seam B: edges = consecutive steps whose screens differ, labelled with the destination screen's
 * name; an edge resolves when the from-step's spec (its own state, else the screen's first) has an
 * element whose `navigate` target is that label. Reason strings copy src/analysis/journeys.ts. */
function toServerJourney(row: JourneyRow, screens: ReturnType<typeof groupScreens>, kind: RoundKind): ServerJourney {
  const steps: Journey['steps'] = row.steps.map((s) => ({
    screen: s.screen,
    ...(s.beat !== undefined ? { beat: s.beat } : {}),
    ...(s.state !== undefined ? { state: s.state } : {}),
  }))
  const edges: Journey['edges'] = []
  const unresolved: Journey['unresolved'] = []
  for (let i = 0; i + 1 < steps.length; i++) {
    const from = steps[i]
    const to = steps[i + 1]
    if (!from || !to || from.screen === to.screen) continue
    const label = to.screen
    edges.push({ from: i, to: i + 1, label })
    const screen = screens.find((s) => s.name === from.screen)
    if (!screen) {
      unresolved.push({ from: i, to: i + 1, reason: `step ${i} names unknown screen ${from.screen}` })
      continue
    }
    if (kind === 'screenshots') {
      unresolved.push({ from: i, to: i + 1, reason: `no control with data-to="${label}" on ${from.screen}` })
      continue
    }
    const state = from.state ?? screen.states[0] ?? ''
    const spec = screen.specs.get(state) ?? screen.specs.get(screen.states[0] ?? '')
    if (!navigateTargets(spec).some((t) => t.to === label)) {
      unresolved.push({ from: i, to: i + 1, reason: `no control with data-to="${label}" on ${from.screen}` })
    }
  }
  return {
    id: row.id,
    title: row.title ?? row.id,
    ...(row.persona !== null ? { persona: row.persona } : {}),
    steps,
    edges,
    resolved: unresolved.length === 0,
    unresolved,
    beats: row.beats,
  }
}

// ---------------------------------------------------------------- notes

type NoteDbRow = {
  id: string
  round: number
  screen: string | null
  state: string | null
  anchor: Anchor
  status: Note['status']
  thread: ThreadEntry[]
  project_note: boolean
  extra: Record<string, unknown>
  created_at: Date
}

/** Row → today's Note (plus `anchor`, `round`, `at`). Seam B mapping: `component = anchor.node ??
 * '__screen'`, `key = String(anchor.index ?? 0)`; a wireframe anchor also supplies `rect`/`viewport`. */
export function rowToNote(r: NoteDbRow): Note {
  const extra: Record<string, unknown> = { ...r.extra }
  let component: string | null = typeof extra['component'] === 'string' ? extra['component'] : r.project_note ? null : SCREEN_ANCHOR
  let key: string | null = typeof extra['key'] === 'string' ? extra['key'] : r.project_note ? null : '0'
  const a = r.anchor
  if (a && 'node' in a) {
    component = a.node ?? SCREEN_ANCHOR
    key = String(a.index ?? 0)
    if (a.rect) extra['rect'] = a.rect
    else delete extra['rect']
    extra['viewport'] = a.viewport
  } else if (a) {
    component = SCREEN_ANCHOR
    key = '0'
    if (!isRecord(extra['rect'])) extra['rect'] = { x: a.x, y: a.y, w: a.w ?? 0, h: a.h ?? 0 }
  }
  delete extra['component']
  delete extra['key']
  return {
    ...extra,
    id: r.id,
    screen: r.screen,
    state: r.state,
    component,
    key,
    snippet: typeof extra['snippet'] === 'string' ? extra['snippet'] : null,
    status: r.status,
    thread: r.thread,
    ...(r.project_note ? { project: true as const } : {}),
    anchor: r.anchor,
    round: r.round,
    at: r.created_at.toISOString(),
  }
}

const NOTE_COLUMNS = new Set(['id', 'screen', 'state', 'status', 'thread', 'project', 'anchor', 'round', 'at'])

/** Today's Note (as the reducer returns it) → the column values. Everything not a column is the
 * page-owned passthrough (`extra`). */
export function noteToRow(note: Note): {
  id: string
  round: number
  screen: string | null
  state: string | null
  anchor: Anchor
  status: string
  thread: ThreadEntry[]
  projectNote: boolean
  extra: Record<string, unknown>
} {
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(note)) if (!NOTE_COLUMNS.has(k) && v !== undefined) extra[k] = v
  const rawAnchor = (note as Record<string, unknown>)['anchor']
  const anchor = rawAnchor === undefined ? deriveAnchor(note) : (rawAnchor as Anchor)
  const round = (note as Record<string, unknown>)['round']
  return {
    id: note.id,
    round: typeof round === 'number' ? round : 0,
    screen: note.screen,
    state: note.state,
    anchor,
    status: note.status,
    thread: note.thread,
    projectNote: note.project === true,
    extra,
  }
}

export async function loadNotes(db: Db, project: string): Promise<Notes> {
  const notes = await db.query<NoteDbRow>(
    'select id, round, screen, state, anchor, status, thread, project_note, extra, created_at from notes where project = $1 order by created_at, id',
    [project],
  )
  const threads = await db.query<{ journey: string; status: Note['status']; thread: ThreadEntry[] }>(
    'select journey, status, thread from journey_threads where project = $1 order by journey',
    [project],
  )
  const journeys: Notes['journeys'] = {}
  for (const t of threads.rows) journeys[t.journey] = { status: t.status, thread: t.thread }
  return { contractVersion: CONTRACT_VERSION, notes: notes.rows.map(rowToNote), journeys }
}

export async function insertNote(db: Db, project: string, note: Note): Promise<void> {
  const r = noteToRow(note)
  await db.query(
    `insert into notes (project, id, round, screen, state, anchor, status, thread, project_note, extra)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10::jsonb)`,
    [project, r.id, r.round, r.screen, r.state, JSON.stringify(r.anchor), r.status, JSON.stringify(r.thread), r.projectNote, JSON.stringify(r.extra)],
  )
}

export async function updateNote(db: Db, project: string, note: Note): Promise<void> {
  const r = noteToRow(note)
  await db.query(
    `update notes set screen = $3, state = $4, anchor = $5::jsonb, status = $6, thread = $7::jsonb, project_note = $8, extra = $9::jsonb
     where project = $1 and id = $2`,
    [project, r.id, r.screen, r.state, JSON.stringify(r.anchor), r.status, JSON.stringify(r.thread), r.projectNote, JSON.stringify(r.extra)],
  )
}

export async function deleteNote(db: Db, project: string, id: string): Promise<void> {
  await db.query('delete from notes where project = $1 and id = $2', [project, id])
}

export async function upsertJourneyThread(db: Db, project: string, journey: string, conv: Notes['journeys'][string]): Promise<void> {
  await db.query(
    `insert into journey_threads (project, journey, status, thread) values ($1, $2, $3, $4::jsonb)
     on conflict (project, journey) do update set status = excluded.status, thread = excluded.thread`,
    [project, journey, conv.status, JSON.stringify(conv.thread)],
  )
}

/** Is `id` a journey of any round of this project (today's "close/reply on a journey with no
 * conversation yet" probe)? */
export async function journeyExists(db: Db, project: string, id: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from journeys where project = $1 and id = $2 limit 1', [project, id])
  return rows.length > 0
}

// ---------------------------------------------------------------- approvals

export type ApprovalDbRow = { journey: string; by: string; round: number; beats: string; at: Date; reason: string | null }

export async function approvalRows(db: Db, project: string): Promise<ApprovalDbRow[]> {
  const { rows } = await db.query<ApprovalDbRow>(
    'select journey, by, round, beats, at, reason from approvals where project = $1 order by journey',
    [project],
  )
  return rows
}

/** Seam B: `approval.journeys[id] = {client:'ok'|'waived', beats, at, reason?}` (+ `round`). */
export function approvalDoc(rows: ApprovalDbRow[]): Approval {
  const journeys: Approval['journeys'] = {}
  for (const r of rows) {
    journeys[r.journey] = {
      client: r.by === 'client' ? 'ok' : 'waived',
      beats: r.beats,
      at: r.at.toISOString(),
      ...(r.reason !== null ? { reason: r.reason } : {}),
      round: r.round,
    }
  }
  return { contractVersion: CONTRACT_VERSION, screens: {}, journeys }
}

export async function upsertApproval(
  db: Db,
  project: string,
  row: { journey: string; by: 'client' | 'owner'; round: number; beats: string; at: string; reason: string | null },
): Promise<void> {
  await db.query(
    `insert into approvals (project, journey, by, round, beats, at, reason) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (project, journey) do update set by = excluded.by, round = excluded.round, beats = excluded.beats, at = excluded.at, reason = excluded.reason`,
    [project, row.journey, row.by, row.round, row.beats, row.at, row.reason],
  )
}

// ---------------------------------------------------------------- GET state

export type RoundInfo = { n: number; kind: RoundKind; status: RoundStatus }
export type WalkthroughState = ServerState & { round: RoundInfo | null }

export async function servedJourneys(db: Db, project: string, round: RoundRow): Promise<ServerJourney[]> {
  const screens = groupScreens(await screenRows(db, project, round.n))
  return (await journeyRows(db, project, round.n)).map((j) => toServerJourney(j, screens, round.kind))
}

export async function buildState(db: Db, project: string, role: 'owner' | 'client', round: RoundRow | null): Promise<WalkthroughState> {
  let screens: ServerScreen[] = []
  let journeys: ServerJourney[] = []
  if (round) {
    const grouped = groupScreens(await screenRows(db, project, round.n))
    screens = grouped.map((s) => ({ name: s.name, file: '', states: s.states, shell: null, hash: '', lines: 0, examples: s.states }))
    journeys = (await journeyRows(db, project, round.n)).map((j) => toServerJourney(j, grouped, round.kind))
  }
  const viewports = round?.viewports ?? (round?.kind === 'screenshots' ? [] : DEFAULT_WIREFRAME_VIEWPORTS)
  return {
    screens,
    shells: [],
    journeys,
    themes: [],
    config: { name: project, port: Number(process.env['WALKTHROUGH_PORT'] ?? 0), targets: { viewports, schemes: ['light'] }, theme: null, client: { token: '' } },
    inventory: [],
    violations: [],
    notes: await loadNotes(db, project),
    approval: approvalDoc(await approvalRows(db, project)),
    role,
    documents: { notes: { ok: true }, approval: { ok: true } },
    round: round ? { n: round.n, kind: round.kind, status: round.status } : null,
  }
}
