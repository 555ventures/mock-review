// walkthrough prototype, seam C: the plugin API under `/v1`, bearer `WALKTHROUGH_API_TOKEN`.
// Every refusal is `{error:'<kebab-code>', detail, apiVersion:1}`.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { beatHash } from '../../analysis/beats.js'
import type { Note } from '../../schemas/index.js'
import { getPool, inTransaction } from '../db/pool.js'
import { approvalRows, DEFAULT_WIREFRAME_VIEWPORTS, loadNotes, roundRow } from './data.js'
import { emit } from './events.js'
import { API_VERSION, apiAuthorized, readBody, sendApiError, sendJson, tryParseJson } from './http.js'
import { checkSpec, type PropSchemas, type SpecIssueOut } from './validate.js'
import { writeNotes } from './writes.js'

/** A name that is safe in a URL segment and in `<name>--<state>--<width>`. */
const Segment = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.-]+$/, 'letters, digits, "_", "." and "-" only')
  .refine((s) => !s.includes('--'), 'may not contain "--"')

export const ACTOR_MAX = 60

const PushSchema = z
  .object({
    round: z.number().int().min(1),
    kind: z.enum(['wireframe', 'screenshots']),
    name: z.string().optional(),
    journeys: z
      .array(
        z
          .object({
            id: Segment,
            title: z.string().optional(),
            persona: z.string().optional(),
            beats: z.string().nullable().optional(),
            // docs/design/client-view.md §5: who the story is about ("Mika, clinic owner"), and
            // the id of the main story this one is an alternate path of.
            actor: z.string().trim().min(1).max(ACTOR_MAX).optional(),
            variantOf: Segment.optional(),
            steps: z.array(z.object({ beat: z.string().optional(), screen: Segment, state: Segment.optional() }).strict()),
          })
          .strict(),
      )
      .default([]),
    screens: z
      .array(
        z
          .object({
            name: Segment,
            state: Segment.default('default'),
            spec: z.unknown().optional(),
            width: z.number().int().positive().max(10_000).optional(),
          })
          .strict(),
      )
      .min(1),
    viewports: z.array(z.string().regex(/^\d+x\d+$/)).min(1).optional(),
  })
  .strict()

type Push = z.infer<typeof PushSchema>

export type ApiDeps = { loadPropSchemas: () => Promise<PropSchemas | null> }

function uploadPath(project: string, round: number, name: string, state: string, width: number): string {
  return `/v1/projects/${project}/rounds/${round}/images/${name}--${state}--${width}`
}

/** Shape rules the zod schema cannot say: per-kind screen fields, duplicates, journey references,
 * the beats hash. Returns the refusal or null. */
function checkPushShape(push: Push): { error: string; detail: unknown } | null {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const s of push.screens) {
    const id = push.kind === 'wireframe' ? `${s.name}@${s.state}` : `${s.name}@${s.state}@${s.width}`
    if (seen.has(id)) problems.push(`duplicate screen ${id}`)
    seen.add(id)
    if (push.kind === 'wireframe') {
      if (s.spec === undefined) problems.push(`${s.name}@${s.state}: a wireframe screen needs "spec"`)
      if (s.width !== undefined) problems.push(`${s.name}@${s.state}: a wireframe screen takes no "width"`)
    } else {
      if (s.width === undefined) problems.push(`${s.name}@${s.state}: a screenshots screen needs "width"`)
      if (s.spec !== undefined) problems.push(`${s.name}@${s.state}: a screenshots screen takes no "spec"`)
    }
  }
  if (problems.length > 0) return { error: 'bad-request', detail: problems }

  const journeyProblems: string[] = []
  const ids = new Set<string>()
  for (const j of push.journeys) {
    if (ids.has(j.id)) journeyProblems.push(`duplicate journey ${j.id}`)
    ids.add(j.id)
    j.steps.forEach((step, i) => {
      const ok = push.screens.some((s) => s.name === step.screen && (step.state === undefined || s.state === step.state))
      if (!ok) journeyProblems.push(`journey ${j.id} step ${i + 1}: no screen ${step.screen}${step.state ? `@${step.state}` : ''} in this round`)
    })
  }
  if (journeyProblems.length > 0) return { error: 'bad-journey', detail: journeyProblems }

  // A variant sits under its main story, one level deep: `variantOf` names another journey of
  // this push, and that journey is not itself a variant (nor is a journey its own variant).
  const dangling: string[] = []
  const chained: string[] = []
  for (const j of push.journeys) {
    if (j.variantOf === undefined) continue
    const main = push.journeys.find((m) => m.id === j.variantOf)
    if (!main) dangling.push(`journey ${j.id}: variantOf "${j.variantOf}" is not a journey of this round`)
    else if (main.variantOf !== undefined || main.id === j.id) {
      chained.push(`journey ${j.id}: variantOf "${j.variantOf}", which is itself a variant — a variant must name a main story`)
    }
  }
  if (dangling.length > 0) return { error: 'unknown-variant-of', detail: dangling }
  if (chained.length > 0) return { error: 'chained-variant', detail: chained }

  const beatProblems: string[] = []
  for (const j of push.journeys) {
    const expected = beatHash(j.steps)
    if (j.beats !== undefined && j.beats !== expected) {
      beatProblems.push(`journey ${j.id}: beats ${JSON.stringify(j.beats)} but the steps hash to ${JSON.stringify(expected)}`)
    }
  }
  if (beatProblems.length > 0) return { error: 'beats-mismatch', detail: beatProblems }
  return null
}

async function pushRound(res: ServerResponse, project: string, raw: unknown, deps: ApiDeps): Promise<void> {
  const parsed = PushSchema.safeParse(raw)
  if (!parsed.success) {
    sendApiError(res, 400, 'bad-request', parsed.error.issues)
    return
  }
  const push = parsed.data
  const shape = checkPushShape(push)
  if (shape) {
    sendApiError(res, 400, shape.error, shape.detail)
    return
  }

  const db = getPool()
  if (await roundRow(db, project, push.round)) {
    sendApiError(res, 409, 'round-exists', `round ${push.round} of ${project} already exists`)
    return
  }

  if (push.kind === 'wireframe') {
    const propSchemas = await deps.loadPropSchemas()
    const names = new Set(push.screens.map((s) => s.name))
    const issues: SpecIssueOut[] = []
    for (const s of push.screens) issues.push(...checkSpec(s.spec, { screen: s.name, state: s.state, propSchemas, screenNames: names }))
    const errors = issues.filter((i) => i.severity === 'error')
    if (errors.length > 0) {
      sendApiError(res, 400, 'bad-spec', { propCheck: propSchemas ? 'gray-catalog' : 'structure-only', issues })
      return
    }
  }

  const status = push.kind === 'screenshots' ? 'uploading' : 'open'
  const viewports =
    push.viewports ??
    (push.kind === 'wireframe'
      ? DEFAULT_WIREFRAME_VIEWPORTS
      : [...new Set(push.screens.map((s) => s.width ?? 0))].sort((a, b) => b - a).map((w) => `${w}x0`))

  const created = await inTransaction(async (tx) => {
    await tx.query('insert into projects (id, name) values ($1, $2) on conflict (id) do update set name = coalesce($2, projects.name)', [
      project,
      push.name ?? null,
    ])
    const ins = await tx.query(
      'insert into rounds (project, n, kind, status, viewports) values ($1, $2, $3, $4, $5::jsonb) on conflict (project, n) do nothing returning n',
      [project, push.round, push.kind, status, JSON.stringify(viewports)],
    )
    if (ins.rowCount === 0) return false
    let ord = 0
    const screenKeys = new Set<string>()
    for (const s of push.screens) {
      const key = `${s.name}@${s.state}`
      if (!screenKeys.has(key)) {
        screenKeys.add(key)
        await tx.query('insert into screens (project, round, name, state, spec, ord) values ($1, $2, $3, $4, $5::jsonb, $6)', [
          project,
          push.round,
          s.name,
          s.state,
          push.kind === 'wireframe' ? JSON.stringify(s.spec) : null,
          ord++,
        ])
      }
      if (push.kind === 'screenshots' && s.width !== undefined) {
        await tx.query('insert into images (project, round, name, state, width, bytes) values ($1, $2, $3, $4, $5, null)', [
          project,
          push.round,
          s.name,
          s.state,
          s.width,
        ])
      }
    }
    let jord = 0
    for (const j of push.journeys) {
      await tx.query(
        'insert into journeys (project, round, id, title, persona, steps, beats, ord, actor, variant_of) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)',
        [project, push.round, j.id, j.title ?? null, j.persona ?? null, JSON.stringify(j.steps), beatHash(j.steps), jord++, j.actor ?? null, j.variantOf ?? null],
      )
    }
    return true
  })
  if (!created) {
    sendApiError(res, 409, 'round-exists', `round ${push.round} of ${project} already exists`)
    return
  }
  if (status === 'open') emit(project, 'files')

  sendJson(res, 201, {
    apiVersion: API_VERSION,
    round: push.round,
    kind: push.kind,
    status,
    viewports,
    screens: push.screens.map((s) =>
      push.kind === 'wireframe'
        ? { name: s.name, state: s.state }
        : { name: s.name, state: s.state, width: s.width, upload: uploadPath(project, push.round, s.name, s.state, s.width ?? 0) },
    ),
    journeys: push.journeys.map((j) => ({ id: j.id, beats: beatHash(j.steps) })),
  })
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

async function putImage(req: IncomingMessage, res: ServerResponse, project: string, n: number, picture: string): Promise<void> {
  const m = /^([^/]+?)--([^/]+?)--(\d+)(?:\.png)?$/.exec(decodeURIComponent(picture))
  if (!m) {
    sendApiError(res, 400, 'bad-request', 'picture path is <name>--<state>--<width>')
    return
  }
  const [, name = '', state = '', widthRaw = ''] = m
  const width = Number(widthRaw)
  const db = getPool()
  const round = await roundRow(db, project, n)
  if (!round) {
    sendApiError(res, 404, 'unknown-round', `round ${n} of ${project} does not exist`)
    return
  }
  if (round.kind !== 'screenshots') {
    sendApiError(res, 409, 'not-screenshots', `round ${n} is a ${round.kind} round`)
    return
  }
  const bytes = await readBody(req)
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    sendApiError(res, 400, 'not-png', 'the body must be the raw bytes of a PNG')
    return
  }
  const upd = await db.query('update images set bytes = $6 where project = $1 and round = $2 and name = $3 and state = $4 and width = $5', [
    project,
    n,
    name,
    state,
    width,
    bytes,
  ])
  if (upd.rowCount === 0) {
    sendApiError(res, 404, 'unknown-picture', `round ${n} did not declare ${name}--${state}--${width}`)
    return
  }
  const pending = await db.query<{ remaining: string }>(
    'select count(*) as remaining from images where project = $1 and round = $2 and bytes is null',
    [project, n],
  )
  const remaining = Number(pending.rows[0]?.remaining ?? 0)
  let status = round.status
  if (remaining === 0 && round.status === 'uploading') {
    await db.query("update rounds set status = 'open' where project = $1 and n = $2 and status = 'uploading'", [project, n])
    status = 'open'
    emit(project, 'files')
  } else if (round.status !== 'uploading') {
    emit(project, 'files')
  }
  sendJson(res, 200, { apiVersion: API_VERSION, round: n, name, state, width, bytes: bytes.length, remaining, status })
}

function apiNote(note: Note): Record<string, unknown> {
  const rec = note as Record<string, unknown>
  const first = note.thread[0]
  return {
    id: note.id,
    round: rec['round'] ?? null,
    screen: note.screen,
    state: note.state,
    anchor: rec['anchor'] ?? null,
    pickedText: rec['pickedText'] ?? null,
    status: note.status,
    text: first?.text ?? '',
    author: first?.by ?? null,
    thread: note.thread,
    at: rec['at'] ?? null,
    ...(note.project === true ? { project: true } : {}),
  }
}

async function listNotes(res: ServerResponse, project: string, url: URL): Promise<void> {
  const raw = url.searchParams.get('round')
  if (raw !== null && !/^\d+$/.test(raw)) {
    sendApiError(res, 400, 'bad-request', 'round must be a positive integer')
    return
  }
  const doc = await loadNotes(getPool(), project)
  const notes = doc.notes.filter((n) => raw === null || (n as Record<string, unknown>)['round'] === Number(raw))
  sendJson(res, 200, { apiVersion: API_VERSION, notes: notes.map(apiNote), journeys: doc.journeys })
}

async function replyNote(res: ServerResponse, project: string, id: string, raw: unknown): Promise<void> {
  const parsed = z.object({ text: z.string().trim().min(1) }).strict().safeParse(raw)
  if (!parsed.success) {
    sendApiError(res, 400, 'bad-request', parsed.error.issues)
    return
  }
  const out = await writeNotes(project, 'owner', { op: 'reply', id, entry: { by: 'session', text: parsed.data.text } }, null)
  if (!out.ok) {
    sendApiError(res, out.status, out.code, out.detail ?? out.sentence)
    return
  }
  const note = out.value.notes.find((n) => n.id === id)
  const journey = out.value.journeys[id]
  sendJson(res, 200, { apiVersion: API_VERSION, ...(note ? { note: apiNote(note) } : { journey: { id, ...journey } }) })
}

async function listApprovals(res: ServerResponse, project: string): Promise<void> {
  const rows = await approvalRows(getPool(), project)
  sendJson(res, 200, {
    apiVersion: API_VERSION,
    approvals: rows.map((r) => ({ journey: r.journey, by: r.by, round: r.round, beats: r.beats, at: r.at.toISOString(), ...(r.reason !== null ? { reason: r.reason } : {}) })),
  })
}

async function markRound(res: ServerResponse, project: string, n: number, raw: unknown): Promise<void> {
  const parsed = z.object({ status: z.enum(['open', 'answered', 'closed']) }).strict().safeParse(raw)
  if (!parsed.success) {
    sendApiError(res, 400, 'bad-request', parsed.error.issues)
    return
  }
  const db = getPool()
  const round = await roundRow(db, project, n)
  if (!round) {
    sendApiError(res, 404, 'unknown-round', `round ${n} of ${project} does not exist`)
    return
  }
  if (round.status === 'uploading') {
    sendApiError(res, 409, 'round-uploading', `round ${n} is still waiting for its pictures`)
    return
  }
  await db.query('update rounds set status = $3 where project = $1 and n = $2', [project, n, parsed.data.status])
  emit(project, 'files')
  sendJson(res, 200, { apiVersion: API_VERSION, round: n, status: parsed.data.status })
}

const PROJECT = '([A-Za-z0-9_-]+)'

/** Routes one `/v1…` request. Returns false when the path is not an API path at all. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, deps: ApiDeps): Promise<boolean> {
  const p = url.pathname
  if (p !== '/v1' && !p.startsWith('/v1/')) return false
  const method = req.method ?? 'GET'

  if (method === 'GET' && (p === '/v1' || p === '/v1/')) {
    sendJson(res, 200, { apiVersion: API_VERSION })
    return true
  }
  if (!apiAuthorized(req)) {
    sendApiError(res, 401, 'unauthorized', 'Authorization: Bearer <WALKTHROUGH_API_TOKEN> required')
    return true
  }

  let m: RegExpExecArray | null
  const json = async (): Promise<unknown> => tryParseJson(await readBody(req))

  if ((m = new RegExp(`^/v1/projects/${PROJECT}/rounds$`).exec(p)) && method === 'POST') {
    const body = await json()
    if (body === undefined) sendApiError(res, 400, 'bad-request', 'body is not JSON')
    else await pushRound(res, m[1] ?? '', body, deps)
    return true
  }
  if ((m = new RegExp(`^/v1/projects/${PROJECT}/rounds/(\\d+)/images/([^/]+)$`).exec(p)) && method === 'PUT') {
    await putImage(req, res, m[1] ?? '', Number(m[2]), m[3] ?? '')
    return true
  }
  if ((m = new RegExp(`^/v1/projects/${PROJECT}/rounds/(\\d+)/mark$`).exec(p)) && method === 'POST') {
    const body = await json()
    if (body === undefined) sendApiError(res, 400, 'bad-request', 'body is not JSON')
    else await markRound(res, m[1] ?? '', Number(m[2]), body)
    return true
  }
  if ((m = new RegExp(`^/v1/projects/${PROJECT}/notes$`).exec(p)) && method === 'GET') {
    await listNotes(res, m[1] ?? '', url)
    return true
  }
  if ((m = new RegExp(`^/v1/projects/${PROJECT}/notes/([^/]+)/reply$`).exec(p)) && method === 'POST') {
    const body = await json()
    if (body === undefined) sendApiError(res, 400, 'bad-request', 'body is not JSON')
    else await replyNote(res, m[1] ?? '', decodeURIComponent(m[2] ?? ''), body)
    return true
  }
  if ((m = new RegExp(`^/v1/projects/${PROJECT}/approvals$`).exec(p)) && method === 'GET') {
    await listApprovals(res, m[1] ?? '')
    return true
  }
  sendApiError(res, 404, 'not-found', `${method} ${p} is not an API route`)
  return true
}
