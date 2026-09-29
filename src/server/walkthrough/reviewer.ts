// walkthrough prototype, seam B: the reviewer page's endpoints under `/p/<project>/`. Same paths
// (after the prefix) and bodies as today's src/server/plugin.ts; role rules and op admission copied.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AppliedNotesPatch, ApprovalPatch, NotesPatch } from '../../schemas/patches.js'
import { ApprovalPatchSchema, NotesPatchSchema } from '../../schemas/patches.js'
import type { ThreadEntry } from '../../schemas/index.js'
import { getPool } from '../db/pool.js'
import { buildState, roundRow, visibleRound } from './data.js'
import { listen } from './events.js'
import { readBody, roleOf, roundParam, sendJson, sendReviewerError, tryParseJson } from './http.js'
import { writeApproval, writeNotes } from './writes.js'

type Ctx = { req: IncomingMessage; res: ServerResponse; url: URL; project: string }

function refused(res: ServerResponse): void {
  sendReviewerError(res, 403, 'client-token-required', 'client token required')
}

/** `?round=` on the request, validated; `false` means a 400 was already sent. */
function requestedRound(ctx: Ctx): number | null | false {
  const r = roundParam(ctx.url)
  if (r === undefined) {
    sendReviewerError(ctx.res, 400, 'bad-round', 'round must be a positive integer')
    return false
  }
  return r
}

export async function handleState(ctx: Ctx): Promise<void> {
  const role = roleOf(ctx.req, ctx.res, ctx.project)
  if (role === 'refused') return refused(ctx.res)
  const requested = requestedRound(ctx)
  if (requested === false) return
  const db = getPool()
  const round = await visibleRound(db, ctx.project, requested)
  if (requested !== null && !round) {
    sendReviewerError(ctx.res, 404, 'unknown-round', `round ${requested} is not available`)
    return
  }
  sendJson(ctx.res, 200, await buildState(db, ctx.project, role, round))
}

function forceClientThread(thread: ThreadEntry[]): ThreadEntry[] {
  return thread.map((entry) => ({ ...entry, by: 'client' }))
}

/** today's clientNotesOpPatch: add/reply rewritten to `by:'client'`, close admitted (ownership is
 * checked later), update/remove never. */
function clientNotesOpPatch(patch: NotesPatch): AppliedNotesPatch | null {
  if (patch.op === 'add') return { ...patch, note: { ...patch.note, thread: forceClientThread(patch.note.thread) } }
  if (patch.op === 'reply') return { ...patch, entry: { ...patch.entry, by: 'client' } }
  if (patch.op === 'close') return patch
  return null
}

export async function handleNotes(ctx: Ctx): Promise<void> {
  const role = roleOf(ctx.req, ctx.res, ctx.project)
  if (role === 'refused') return refused(ctx.res)
  const body = tryParseJson(await readBody(ctx.req))
  const parsed = body === undefined ? undefined : NotesPatchSchema.safeParse(body)
  if (!parsed || !parsed.success) {
    sendReviewerError(ctx.res, 400, 'bad-request', 'invalid notes patch', parsed?.error?.issues)
    return
  }
  let patch: AppliedNotesPatch | null = parsed.data
  if (role === 'client') {
    patch = clientNotesOpPatch(parsed.data)
    if (!patch) {
      sendReviewerError(ctx.res, 403, 'forbidden', 'This review link cannot make that change.')
      return
    }
  }
  const requested = requestedRound(ctx)
  if (requested === false) return
  const round = await visibleRound(getPool(), ctx.project, requested)
  const out = await writeNotes(ctx.project, role, patch, round?.n ?? null)
  if (!out.ok) {
    sendReviewerError(ctx.res, out.status, out.code, out.sentence, out.detail)
    return
  }
  sendJson(ctx.res, 200, out.value)
}

export async function handleApproval(ctx: Ctx): Promise<void> {
  const role = roleOf(ctx.req, ctx.res, ctx.project)
  if (role === 'refused') return refused(ctx.res)
  const body = tryParseJson(await readBody(ctx.req))
  const parsed = body === undefined ? undefined : ApprovalPatchSchema.safeParse(body)
  if (!parsed || !parsed.success) {
    sendReviewerError(ctx.res, 400, 'bad-request', 'invalid approval patch', parsed?.error?.issues)
    return
  }
  const patch: ApprovalPatch = parsed.data
  if (role === 'client' && patch.op !== 'clientOk') {
    sendReviewerError(ctx.res, 403, 'forbidden', 'This review link cannot make that change.')
    return
  }
  const requested = requestedRound(ctx)
  if (requested === false) return
  const round = await visibleRound(getPool(), ctx.project, requested)
  const out = await writeApproval(ctx.project, patch, round)
  if (!out.ok) {
    sendReviewerError(ctx.res, out.status, out.code, out.sentence, out.detail)
    return
  }
  sendJson(ctx.res, 200, out.value)
}

export function handleEvents(ctx: Ctx): void {
  if (roleOf(ctx.req, ctx.res, ctx.project) === 'refused') return refused(ctx.res)
  const { req, res } = ctx
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('connection', 'keep-alive')
  res.write('\n')
  const dispose = listen(ctx.project, (event) => {
    if (res.writableEnded) return
    res.write(`event: ${event}\ndata: {}\n\n`)
  })
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n')
  }, 25_000)
  const stop = () => {
    clearInterval(ping)
    dispose()
  }
  req.on('close', stop)
  res.on('error', stop)
}

export function imageUrl(project: string, round: number, name: string, state: string, width: number): string {
  return `/p/${project}/__walkthrough/image/${round}/${encodeURIComponent(name)}/${encodeURIComponent(state)}/${width}.png`
}

/** `GET /p/<p>/__walkthrough/frame?screen=&state=&round=` → the one screen's source. */
export async function handleFrame(ctx: Ctx): Promise<void> {
  if (roleOf(ctx.req, ctx.res, ctx.project) === 'refused') return refused(ctx.res)
  const requested = requestedRound(ctx)
  if (requested === false) return
  const screen = ctx.url.searchParams.get('screen') ?? ''
  const wantState = ctx.url.searchParams.get('state')
  const db = getPool()
  const round = await visibleRound(db, ctx.project, requested)
  if (!round) {
    sendReviewerError(ctx.res, 404, 'unknown-round', requested === null ? 'no round has been pushed yet' : `round ${requested} is not available`)
    return
  }
  const { rows } = await db.query<{ state: string; spec: unknown }>(
    'select state, spec from screens where project = $1 and round = $2 and name = $3 order by ord, state',
    [ctx.project, round.n, screen],
  )
  const row = (wantState ? rows.find((r) => r.state === wantState) : undefined) ?? rows[0]
  if (!row) {
    sendReviewerError(ctx.res, 404, 'unknown-screen', `round ${round.n} has no screen ${screen}`)
    return
  }
  if (round.kind === 'wireframe') {
    sendJson(ctx.res, 200, { kind: 'wireframe', round: round.n, screen, state: row.state, spec: row.spec })
    return
  }
  const images = await db.query<{ width: number }>(
    'select width from images where project = $1 and round = $2 and name = $3 and state = $4 and bytes is not null order by width desc',
    [ctx.project, round.n, screen, row.state],
  )
  sendJson(ctx.res, 200, {
    kind: 'screenshots',
    round: round.n,
    screen,
    state: row.state,
    images: images.rows.map((r) => ({ width: r.width, url: imageUrl(ctx.project, round.n, screen, row.state, r.width) })),
  })
}

/** `GET /p/<p>/__walkthrough/image/<round>/<name>/<state>/<width>.png` → the bytes. */
export async function handleImage(ctx: Ctx, rest: string): Promise<void> {
  if (roleOf(ctx.req, ctx.res, ctx.project) === 'refused') return refused(ctx.res)
  const m = /^(\d+)\/([^/]+)\/([^/]+)\/(\d+)\.png$/.exec(rest)
  if (!m) {
    sendReviewerError(ctx.res, 404, 'unknown-picture', 'no such picture')
    return
  }
  const [, roundRaw = '', nameRaw = '', stateRaw = '', widthRaw = ''] = m
  const db = getPool()
  const round = await roundRow(db, ctx.project, Number(roundRaw))
  if (!round || round.status === 'uploading') {
    sendReviewerError(ctx.res, 404, 'unknown-round', `round ${roundRaw} is not available`)
    return
  }
  const { rows } = await db.query<{ bytes: Buffer | null }>(
    'select bytes from images where project = $1 and round = $2 and name = $3 and state = $4 and width = $5',
    [ctx.project, round.n, decodeURIComponent(nameRaw), decodeURIComponent(stateRaw), Number(widthRaw)],
  )
  const bytes = rows[0]?.bytes
  if (!bytes) {
    sendReviewerError(ctx.res, 404, 'unknown-picture', 'no such picture')
    return
  }
  ctx.res.statusCode = 200
  ctx.res.setHeader('content-type', 'image/png')
  ctx.res.setHeader('content-length', String(bytes.length))
  ctx.res.setHeader('cache-control', 'no-cache')
  ctx.res.end(bytes)
}
