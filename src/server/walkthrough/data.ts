// walkthrough prototype: every Postgres read/write the routes need, and the mapping between table
// rows and TODAY's document shapes (`Notes`, `Approval`, `ServerState`) so the existing pure
// reducers in src/server/patches.ts run unchanged over them.
import { isDeepStrictEqual } from 'node:util'
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
export const PICTURE_ANCHOR = '__picture'

// ---------------------------------------------------------------- anchors (seam A)

// docs/design/client-view.md "What the server must add": the anchor is `{node, index}` on a
// wireframe, `{x, y, width}` on a picture, or null. There is no drawn area any more (`rect`, `w`,
// `h`, `viewport` are gone); a note is placed by picking one element or one point.
export const WireframeAnchorSchema = z
  .object({
    node: z.string().min(1),
    index: z.number().int().min(0).nullable(),
  })
  .strict()

export const ScreenshotAnchorSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().int().positive(),
  })
  .strict()

export const AnchorSchema = z.union([WireframeAnchorSchema, ScreenshotAnchorSchema]).nullable()
export type Anchor = z.infer<typeof AnchorSchema>

/** Reads a stored anchor of any age into today's shape. Rows written before the drag gesture was
 * removed carry `rect`/`viewport` (wireframe) or `w`/`h` (picture); those fields are dropped, and a
 * wireframe anchor with no node (an area drawn on the bare screen) reads as a whole-screen note. */
export function normalizeAnchor(value: unknown): Anchor {
  if (!isRecord(value)) return null
  if ('node' in value) {
    const node = value['node']
    if (typeof node !== 'string' || node === '') return null
    const index = value['index']
    return { node, index: typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : null }
  }
  const { x, y, width } = value
  if (typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && width > 0) {
    const c = (n: number) => Math.min(1, Math.max(0, n))
    return { x: c(x), y: c(y), width: Math.round(width) }
  }
  return null
}

/** A note sent without `anchor` (component/key only) → the seam A anchor. `null` for a project
 * note or a whole-screen note. */
export function deriveAnchor(note: Record<string, unknown>): Anchor {
  if (note['project'] === true) return null
  const component = typeof note['component'] === 'string' ? note['component'] : null
  if (component === null || component === SCREEN_ANCHOR || component === PICTURE_ANCHOR) return null
  const key = typeof note['key'] === 'string' && /^\d+$/.test(note['key']) ? Number(note['key']) : null
  return { node: component, index: key }
}

export const PICKED_TEXT_MAX = 40

/** The picked element's visible text as the reader sees it in "About “…”": whitespace collapsed,
 * at most 40 characters (the 40th an ellipsis when it was cut). */
export function shortenPicked(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length <= PICKED_TEXT_MAX ? text : `${text.slice(0, PICKED_TEXT_MAX - 1).trimEnd()}…`
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
type JourneyRow = {
  id: string
  title: string | null
  persona: string | null
  steps: StepIn[]
  beats: string | null
  actor: string | null
  variant_of: string | null
}

/** A served journey plus the stories page's two optional fields (docs/design/client-view.md §5),
 * present only when the push carried them — the frozen `ServerJourney` schema is not widened. */
export type WalkJourney = ServerJourney & { actor?: string; variantOf?: string }

export async function journeyRows(db: Db, project: string, round: number): Promise<JourneyRow[]> {
  const { rows } = await db.query<JourneyRow>(
    'select id, title, persona, steps, beats, actor, variant_of from journeys where project = $1 and round = $2 order by ord, id',
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
function toServerJourney(row: JourneyRow, screens: ReturnType<typeof groupScreens>, kind: RoundKind): WalkJourney {
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
    ...(row.actor !== null ? { actor: row.actor } : {}),
    ...(row.variant_of !== null ? { variantOf: row.variant_of } : {}),
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

/** The drag-area passthrough fields older rows carry in `extra`; never served any more. */
const RETIRED_EXTRAS = ['rect', 'viewport', 'whole', 'component', 'key']

/** Row → today's Note (plus `anchor`, `pickedText`, `round`, `at`). Seam B mapping: `component =
 * anchor.node ?? '__screen'` ('__picture' for a picture point), `key = String(anchor.index ?? 0)`.
 * The anchor is served in today's shape whatever age the row is (`normalizeAnchor`); `pickedText`
 * falls back to the old `snippet` so a note written before it existed still reads "About “Ren”". */
export function rowToNote(r: NoteDbRow): Note {
  const extra: Record<string, unknown> = { ...r.extra }
  for (const k of RETIRED_EXTRAS) delete extra[k]
  const anchor = r.project_note ? null : normalizeAnchor(r.anchor)
  let component: string | null = r.project_note ? null : SCREEN_ANCHOR
  let key: string | null = r.project_note ? null : '0'
  if (anchor && 'node' in anchor) {
    component = anchor.node
    key = String(anchor.index ?? 0)
  } else if (anchor) {
    component = PICTURE_ANCHOR
  }
  const snippet = typeof extra['snippet'] === 'string' ? extra['snippet'] : null
  const pickedText = anchor && 'node' in anchor ? (shortenPicked(extra['pickedText']) ?? shortenPicked(snippet)) : null
  delete extra['pickedText']
  return {
    ...extra,
    id: r.id,
    screen: r.screen,
    state: r.state,
    component,
    key,
    snippet,
    status: r.status,
    thread: r.thread,
    ...(r.project_note ? { project: true as const } : {}),
    anchor,
    pickedText,
    round: r.round,
    at: r.created_at.toISOString(),
  }
}

const NOTE_COLUMNS = new Set(['id', 'screen', 'state', 'status', 'thread', 'project', 'anchor', 'round', 'at', 'component', 'key'])

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
  for (const [k, v] of Object.entries(note)) if (!NOTE_COLUMNS.has(k) && !RETIRED_EXTRAS.includes(k) && v !== undefined) extra[k] = v
  const picked = shortenPicked(extra['pickedText'])
  if (picked === null) delete extra['pickedText']
  else extra['pickedText'] = picked
  const rawAnchor = (note as Record<string, unknown>)['anchor']
  const anchor = rawAnchor === undefined ? deriveAnchor(note) : normalizeAnchor(rawAnchor)
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
  const [notes, threads] = await Promise.all([
    db.query<NoteDbRow>(
      'select id, round, screen, state, anchor, status, thread, project_note, extra, created_at from notes where project = $1 order by created_at, id',
      [project],
    ),
    db.query<{ journey: string; status: Note['status']; thread: ThreadEntry[] }>(
      'select journey, status, thread from journey_threads where project = $1 order by journey',
      [project],
    ),
  ])
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

export type Change = 'new' | 'changed' | 'same'

/** docs/design/client-view.md: what the shown round changed against the previous visible round.
 * `since` = that previous round's number (`null` for a project's first round, where every screen
 * is `new` and no sentence is marked). `journeys[].steps` = the 0-based steps whose sentence is
 * not the sentence the same step had in the previous round (a step the previous round did not
 * have counts). */
export type Changes = {
  since: number | null
  screens: { screen: string; state: string; change: Change }[]
  journeys: { id: string; change: Change; steps: number[] }[]
}

export type WalkthroughState = ServerState & { round: RoundInfo | null; changes: Changes | null; projectName: string | null }

async function previousRound(db: Db, project: string, n: number): Promise<RoundRow | null> {
  const { rows } = await db.query<RoundDbRow>(
    "select n, kind, status, viewports from rounds where project = $1 and n < $2 and status <> 'uploading' order by n desc limit 1",
    [project, n],
  )
  return rows[0] ?? null
}

/** Per screen+state, a comparable fingerprint: the stored spec (wireframe) or every picture's
 * width and bytes hash (screenshots). */
async function fingerprints(db: Db, project: string, round: RoundRow): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>()
  if (round.kind === 'wireframe') {
    for (const s of await screenRows(db, project, round.n)) out.set(`${s.name}\u0000${s.state}`, s.spec)
    return out
  }
  const { rows } = await db.query<{ name: string; state: string; width: number; h: string | null }>(
    'select name, state, width, md5(bytes) as h from images where project = $1 and round = $2 order by name, state, width',
    [project, round.n],
  )
  for (const r of rows) {
    const key = `${r.name}\u0000${r.state}`
    const list = (out.get(key) as string[] | undefined) ?? []
    list.push(`${r.width}:${r.h ?? ''}`)
    out.set(key, list)
  }
  return out
}

export async function computeChanges(db: Db, project: string, round: RoundRow): Promise<Changes> {
  const [prev, now, nowJourneys] = await Promise.all([previousRound(db, project, round.n), fingerprints(db, project, round), journeyRows(db, project, round.n)])
  const [before, prevJourneys] = prev
    ? await Promise.all([fingerprints(db, project, prev), journeyRows(db, project, prev.n)])
    : [new Map<string, unknown>(), []]
  const screens: Changes['screens'] = []
  for (const [key, value] of now) {
    const [screen = '', state = ''] = key.split('\u0000')
    const change: Change = !before.has(key) ? 'new' : prev?.kind === round.kind && isDeepStrictEqual(before.get(key), value) ? 'same' : 'changed'
    screens.push({ screen, state, change })
  }
  const journeys: Changes['journeys'] = nowJourneys.map((j) => {
    const old = prevJourneys.find((p) => p.id === j.id)
    if (!old) return { id: j.id, change: 'new' as const, steps: prev ? j.steps.map((_, i) => i) : [] }
    const steps = j.steps.flatMap((s, i) => ((old.steps[i]?.beat ?? null) === (s.beat ?? null) ? [] : [i]))
    const same = steps.length === 0 && old.steps.length === j.steps.length
    return { id: j.id, change: same ? ('same' as const) : ('changed' as const), steps }
  })
  return { since: prev?.n ?? null, screens, journeys }
}

async function projectName(db: Db, project: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string | null }>('select name from projects where id = $1', [project])
  return rows[0]?.name ?? null
}

export async function servedJourneys(db: Db, project: string, round: RoundRow): Promise<WalkJourney[]> {
  const screens = groupScreens(await screenRows(db, project, round.n))
  return (await journeyRows(db, project, round.n)).map((j) => toServerJourney(j, screens, round.kind))
}

export async function buildState(db: Db, project: string, role: 'owner' | 'client', round: RoundRow | null): Promise<WalkthroughState> {
  // Every read is independent of the others: run them together (the database is a network
  // round-trip away, so sequential reads add up to seconds).
  const [screenData, journeyData, notes, approvals, changes, name] = await Promise.all([
    round ? screenRows(db, project, round.n) : Promise.resolve([]),
    round ? journeyRows(db, project, round.n) : Promise.resolve([]),
    loadNotes(db, project),
    approvalRows(db, project),
    round ? computeChanges(db, project, round) : Promise.resolve(null),
    projectName(db, project),
  ])
  let screens: ServerScreen[] = []
  let journeys: WalkJourney[] = []
  if (round) {
    const grouped = groupScreens(screenData)
    screens = grouped.map((s) => ({ name: s.name, file: '', states: s.states, shell: null, hash: '', lines: 0, examples: s.states }))
    journeys = journeyData.map((j) => toServerJourney(j, grouped, round.kind))
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
    notes,
    approval: approvalDoc(approvals),
    role,
    documents: { notes: { ok: true }, approval: { ok: true } },
    round: round ? { n: round.n, kind: round.kind, status: round.status } : null,
    changes,
    projectName: name,
  }
}
