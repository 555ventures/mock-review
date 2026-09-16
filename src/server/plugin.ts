import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRunnableDevEnvironment, type Connect, type Plugin, type ViteDevServer } from 'vite'
import { ensureDesignFiles, readJson, writeJsonAtomic } from '../files/json.js'
import type { Runner } from '../analysis/vite-runner.js'
import { loadConfig, NULL_CONFIG } from '../analysis/config.js'
import { discoverHost } from '../analysis/discover.js'
import { ApprovalSchema, NotesSchema } from '../schemas/index.js'
import type { Approval, Config, NullConfig, Notes, ThreadEntry } from '../schemas/index.js'
import { ApprovalPatchSchema, NotesPatchSchema } from '../schemas/patches.js'
import type { ApprovalPatch, NotesPatch, ServerState } from '../schemas/patches.js'
import { applyApprovalPatch, applyNotesPatch, type ApprovalPatchCtx } from './patches.js'
import { buildState } from './state.js'
import { buildRegistry } from './registry.js'
import { watchDesignFiles } from './watch.js'

/** D15: the plain fallback served at `GET /` while the ui wave's prebuilt page doesn't exist yet
 * (or in a host that never ran `npm run build`'s page step) — never a crash. */
const FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>mock-review</title>
  </head>
  <body>
    <p>mock-review: reviewer page not built yet (run \`npm run build\` in the package)</p>
  </body>
</html>
`

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream'
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(text)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8')
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const CLIENT_COOKIE = 'mock-review-client'
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** D24: headers an HTTP tunnel agent (ssh -L, cloudflared, ngrok, etc.) adds even though the
 * agent itself connects to this process from loopback — their presence means the *real* client is
 * remote, so a loopback-looking socket carrying one of these is never trusted as `owner`. */
const TUNNEL_HEADERS = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip'] as const

/** D24: `owner` requires both a loopback socket address and none of the tunnel-agent headers — a
 * raw TCP forward (`ssh -R`) presents as loopback with no such header and is accepted (D24's
 * documented gap: only HTTP tunnels are the supported remote-sharing path). */
function isLoopbackOwner(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress
  if (remote === undefined || !LOOPBACK_ADDRESSES.has(remote)) return false
  return !TUNNEL_HEADERS.some((header) => req.headers[header] !== undefined)
}

/** Reads one cookie by name out of the raw `Cookie` request header (no third-party cookie
 * parser — this is the only cookie the server ever reads). */
function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/** D24: `role` is three-valued, decided in this precedence: (1) a `?client=` matching
 * `config.client.token` is `client`, and issues the session cookie other requests will carry;
 * (2) a `?client=` that's present but doesn't match (including empty) clears that cookie and
 * falls through to (3)/(4) — this is how the owner leaves client mode after opening their own
 * share link; (3) a `mock-review-client` cookie equal to the token is `client`; (4) otherwise
 * `owner` only when the socket is loopback with no tunnel header (`isLoopbackOwner`); (5)
 * otherwise `refused`. The cookie is validated against the config on every request — nothing is
 * stored server-side, so it survives a `serve` restart and dies the moment the token changes.
 * `Referer` is never consulted: everything the frame itself loads (`/@vite/client`, `/@fs/`
 * entry, `/@react-refresh`) sends the frame's own URL as Referer with no token, so a Referer
 * check would blank a real remote client's mock instead of admitting it. */
function roleOf(req: IncomingMessage, res: ServerResponse, config: Config | NullConfig): 'owner' | 'client' | 'refused' {
  if (config.client) {
    const token = config.client.token
    const url = new URL(req.url ?? '/', 'http://mock-review.local')
    const ownToken = url.searchParams.get('client')

    if (ownToken !== null) {
      if (ownToken === token) {
        res.setHeader('set-cookie', `${CLIENT_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`)
        return 'client'
      }
      res.setHeader('set-cookie', `${CLIENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    }

    const cookieToken = readCookie(req, CLIENT_COOKIE)
    if (cookieToken !== undefined && cookieToken === token) return 'client'
  }

  return isLoopbackOwner(req) ? 'owner' : 'refused'
}

/** D20: `serve` never creates a Vite server per request — `runner` is the persistent server's own
 * `server.environments.ssr` runner (see `getRunner` below), narrowed once per request rather than
 * via a fresh `createServer` (which would compute a different `optimizeDeps` config hash and
 * delete the shared `node_modules/.vite/deps` out from under `serve`'s own optimizer). */
async function configFor(cwd: string, runner: Runner): Promise<Config | NullConfig> {
  try {
    return (await loadConfig(cwd, runner)).config
  } catch {
    return NULL_CONFIG
  }
}

/** D20: narrows the persistent `serve` server's own SSR environment into the `Runner` shape
 * `analysis/*` already expects (mirrors `analysis/vite-runner.ts`'s `withRunner`, minus the
 * `createServer`/`close` lifecycle — this environment lives for the whole `serve` process). */
function getRunner(server: ViteDevServer): Runner {
  const ssrEnv = server.environments.ssr
  if (!isRunnableDevEnvironment(ssrEnv)) {
    throw new Error('the ssr environment is not runnable (no module runner)')
  }
  return { import: (absPath: string) => ssrEnv.runner.import(absPath) }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** D23: matches `^<name>-<state>-<WxH>-<scheme>\.png$` exactly — a plain `startsWith(name + '-')`
 * also matched a sibling screen whose name shares `name` as a prefix (e.g. `home` matching
 * `home-detail-...png`). */
function screenshotsFor(cwd: string, name: string): string[] {
  const dir = path.join(cwd, 'design', 'screenshots')
  if (!existsSync(dir)) return []
  const pattern = new RegExp(`^${escapeRegExp(name)}-[^-]+-\\d+x\\d+-[^-]+\\.png$`)
  return readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort()
    .map((f) => path.posix.join('design', 'screenshots', f))
}

function ctxFromState(cwd: string, state: ServerState): ApprovalPatchCtx {
  return {
    hash: (name) => state.screens.find((s) => s.name === name)?.hash ?? '',
    config: state.config,
    statesOf: (name) => state.screens.find((s) => s.name === name)?.states ?? [],
    screenshotsFor: (name) => screenshotsFor(cwd, name),
  }
}

function forceClientThread(thread: ThreadEntry[]): ThreadEntry[] {
  return thread.map((entry) => ({ ...entry, by: 'client' }))
}

/** D6: a client-role request may `POST notes` only with `op: 'add'` (thread entries forced to
 * `by: 'client'`) or `op: 'journey'` with an `entry` (also forced to `by: 'client'`) — everything
 * else is 403. Returns `null` when the patch is not one a client may send. */
function clientNotesPatch(patch: NotesPatch): NotesPatch | null {
  if (patch.op === 'add') {
    return { ...patch, note: { ...patch.note, thread: forceClientThread(patch.note.thread) } }
  }
  if (patch.op === 'journey' && patch.entry) {
    return { ...patch, entry: { ...patch.entry, by: 'client' } }
  }
  return null
}

/** D6: a client-role request may `POST approval` only with `op: 'clientOk'`. */
function clientApprovalPatch(patch: ApprovalPatch): ApprovalPatch | null {
  return patch.op === 'clientOk' ? patch : null
}

/** A design file exists but doesn't parse (bad JSON, or JSON that fails its schema) — thrown by
 * the `*OrThrow` readers below so a write handler can refuse instead of silently treating a
 * corrupt file as empty and overwriting it. `relPath` is the design-relative path named in the
 * refusal body. */
class UnparseableDesignFileError extends Error {
  constructor(public readonly relPath: string) {
    super(`${relPath} exists but does not parse — refusing to write until it's fixed by hand`)
  }
}

/** The write path's own strict reader — `ensureDesignFiles` (called by both write handlers)
 * guarantees the file exists, so a `readJson` failure here means its content doesn't parse, not
 * that it's absent; the canonical doc says `notes.json` is never overwritten when present (mirrors
 * spec 01's `answer --decision`, which refuses an invalid `decisions.json` with exit 2 rather than
 * rewriting it), so this throws instead of falling back to an empty document the caller would
 * then persist over the real (corrupt) content. */
function readNotesDocOrThrow(cwd: string): Notes {
  try {
    return readJson(path.join(cwd, 'design', 'notes.json'), NotesSchema)
  } catch {
    throw new UnparseableDesignFileError(path.join('design', 'notes.json'))
  }
}

/** See `readNotesDocOrThrow` — the same strictness for `approval.json`. */
function readApprovalDocOrThrow(cwd: string): Approval {
  try {
    return readJson(path.join(cwd, 'design', 'approval.json'), ApprovalSchema)
  } catch {
    throw new UnparseableDesignFileError(path.join('design', 'approval.json'))
  }
}

/** D23/review-2: both write handlers answer 409 (not 400) for an unparseable design file — the
 * request body itself is fine, the conflict is with the target resource's current on-disk state
 * (the textbook use of 409), and 400 would wrongly suggest the client sent something bad. */
function sendUnparseable(res: ServerResponse, err: UnparseableDesignFileError): void {
  sendJson(res, 409, { error: err.message })
}

/** D24: the standard refusal body for every gated route but `GET /` (which answers plain text). */
function sendRefused(res: ServerResponse): void {
  sendJson(res, 403, { error: 'client token required' })
}

async function handleGetState(req: IncomingMessage, res: ServerResponse, cwd: string, runner: Runner): Promise<void> {
  const config = await configFor(cwd, runner)
  const role = roleOf(req, res, config)
  if (role === 'refused') {
    sendRefused(res)
    return
  }
  const state = await buildState(cwd, role, runner)
  sendJson(res, 200, state)
}

/** D23: a body that is not valid JSON at all (`SyntaxError` from `JSON.parse`) answers the same
 * documented 400 a schema-invalid-but-parseable body gets, instead of throwing out to the
 * middleware chain's default 500. Returns `undefined` on any parse failure. */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/** D23: both write handlers serialize through this one in-process lock, so a `notes.json`/
 * `approval.json` read-modify-write pair from one request can never interleave with another's. */
let writeLock: Promise<unknown> = Promise.resolve()

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn)
  writeLock = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function handlePostNotes(req: IncomingMessage, res: ServerResponse, cwd: string, runner: Runner): Promise<void> {
  ensureDesignFiles(cwd)
  const config = await configFor(cwd, runner)
  const role = roleOf(req, res, config)
  if (role === 'refused') {
    sendRefused(res)
    return
  }

  const raw = await readBody(req)
  const body = tryParseJson(raw)
  if (body === undefined) {
    sendJson(res, 400, { error: 'invalid notes patch' })
    return
  }
  const parsed = NotesPatchSchema.safeParse(body)
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid notes patch' })
    return
  }

  let patch: NotesPatch | null = parsed.data
  if (role === 'client') {
    patch = clientNotesPatch(parsed.data)
    if (!patch) {
      res.statusCode = 403
      res.end()
      return
    }
  }
  const appliedPatch = patch

  await withWriteLock(async () => {
    let notes: Notes
    let approval: Approval
    try {
      notes = readNotesDocOrThrow(cwd)
      // review-2: `applyNotesPatch`'s rule-6 un-approve reads `approval` too and the patch may
      // write it back (see below) — an unparsable `approval.json` is just as much a reason to
      // refuse this write as an unparsable `notes.json`, or rule 6 would silently run against an
      // empty approval document and the real (corrupt) file would never surface to anyone.
      approval = readApprovalDocOrThrow(cwd)
    } catch (err) {
      if (err instanceof UnparseableDesignFileError) {
        sendUnparseable(res, err)
        return
      }
      throw err
    }

    // D23: `update`/`remove` for an id with no row in the current document answer 404 and change
    // nothing — never a silent no-op 200.
    if (
      (appliedPatch.op === 'update' || appliedPatch.op === 'remove') &&
      !notes.notes.some((n) => n.id === appliedPatch.id)
    ) {
      res.statusCode = 404
      res.end()
      return
    }

    const result = applyNotesPatch(notes, appliedPatch, approval)

    writeJsonAtomic(path.join(cwd, 'design', 'notes.json'), result.notes)
    if (result.approval !== approval) {
      writeJsonAtomic(path.join(cwd, 'design', 'approval.json'), result.approval)
    }

    sendJson(res, 200, result.notes)
  })
}

async function handlePostApproval(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string,
  runner: Runner,
): Promise<void> {
  ensureDesignFiles(cwd)
  const config = await configFor(cwd, runner)
  const role = roleOf(req, res, config)
  if (role === 'refused') {
    sendRefused(res)
    return
  }

  const raw = await readBody(req)
  const body = tryParseJson(raw)
  if (body === undefined) {
    sendJson(res, 400, { error: 'invalid approval patch' })
    return
  }
  const parsed = ApprovalPatchSchema.safeParse(body)
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid approval patch' })
    return
  }

  let patch: ApprovalPatch | null = parsed.data
  if (role === 'client') {
    patch = clientApprovalPatch(parsed.data)
    if (!patch) {
      res.statusCode = 403
      res.end()
      return
    }
  }
  const appliedPatch = patch

  await withWriteLock(async () => {
    const state = await buildState(cwd, role, runner)

    // D23: `approveScreen` for a name with no row in the current state answers 400 and writes
    // nothing — never a written entry with an empty `hash`, which would make the plugin read the
    // screen as permanently drifted (its hash could never match `check`'s real one).
    if (appliedPatch.op === 'approveScreen' && !state.screens.some((s) => s.name === appliedPatch.name)) {
      sendJson(res, 400, { error: `unknown screen ${appliedPatch.name}` })
      return
    }

    let approval: Approval
    try {
      approval = readApprovalDocOrThrow(cwd)
    } catch (err) {
      if (err instanceof UnparseableDesignFileError) {
        sendUnparseable(res, err)
        return
      }
      throw err
    }
    const next = applyApprovalPatch(approval, appliedPatch, ctxFromState(cwd, state))

    writeJsonAtomic(path.join(cwd, 'design', 'approval.json'), next)

    sendJson(res, 200, next)
  })
}

async function handleEvents(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  cwd: string,
  runner: Runner,
): Promise<void> {
  const config = await configFor(cwd, runner)
  if (roleOf(req, res, config) === 'refused') {
    sendRefused(res)
    return
  }

  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('connection', 'keep-alive')
  res.write('\n')

  const dispose = watchDesignFiles(server, cwd, (event) => {
    // D23: never write after the response has ended — a `close`/`error` dispose can race an
    // in-flight `emit` from the watcher.
    if (res.writableEnded) return
    res.write(`event: ${event}\ndata: {}\n\n`)
  })

  // D23: dispose on `error` too, not only the client-initiated `close` — a connection reset
  // (or any other stream error) must still stop the watcher listeners and clear the debounce
  // timer, or they leak for the rest of the `serve` process's life.
  req.on('close', dispose)
  res.on('error', dispose)
}

function serveStaticAsset(pageDir: string, relUrlPath: string, res: ServerResponse, next: Connect.NextFunction): void {
  const decoded = decodeURIComponent(relUrlPath)
  const filePath = path.normalize(path.join(pageDir, decoded))
  // D23: compare against `pageDir + path.sep` — a bare `startsWith(pageDir)` also accepts a
  // sibling directory that merely shares `pageDir` as a string prefix (e.g. `pageDir` `.../page`
  // wrongly containing `.../page-secret`).
  if (!filePath.startsWith(path.normalize(pageDir) + path.sep)) {
    res.statusCode = 403
    res.end()
    return
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    next()
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', contentTypeFor(filePath))
  res.end(readFileSync(filePath))
}

/** D25: the fallback (page not built) answers 503, never a blank 200 — a host that installed the
 * package without its `page/` build step gets a diagnosable response, not a silently broken one. */
function serveIndex(pageDir: string, res: ServerResponse): void {
  const indexPath = path.join(pageDir, 'index.html')
  const built = existsSync(indexPath)
  res.statusCode = built ? 200 : 503
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(built ? readFileSync(indexPath) : FALLBACK_HTML)
}

/** D8/D18(d): the frame HTML — its entry is `src/frame/entry.tsx`, served through the host's own
 * Vite pipeline via `/@fs/<abs path>` (D15 resolves that path relative to the compiled server
 * module, never hard-coded), so it runs through the host's real aliases/Tailwind/React plugin
 * exactly like a host module would. No reviewer chrome is ever emitted onto this document.
 *
 * Run through `server.transformIndexHtml(url, html)` so `@vitejs/plugin-react`'s own
 * `transformIndexHtml` hook injects its dev-refresh preamble ahead of the entry `<script>` —
 * without it, the react plugin's runtime throws "can't detect preamble" the moment any
 * JSX-transformed module (the frame entry itself, or any screen/component it imports) evaluates
 * in this document, and `#root` never renders (D18(d), reproduced directly by the ui wave). */
async function frameHtml(server: ViteDevServer, requestUrl: string, frameEntryAbsPath: string): Promise<string> {
  const src = `/@fs${frameEntryAbsPath}`
  // D19/D23 residual safety net: a `<script type="module">` whose *own* static import fails
  // (e.g. a transient dependency-optimizer 504) never runs a line of its own code, so entry.tsx
  // cannot recover from this itself. `document.currentScript.nextElementSibling` never attaches
  // here — at parse time, when this classic script executes, the HTML parser has not yet reached
  // (and so not yet inserted) the module `<script>` tag that follows it in source, so
  // `nextElementSibling` is null and the listener is attached to nothing. Real resource-load
  // failures (script/img/etc.) don't bubble, but *do* still reach a capture-phase listener on
  // `window` during the capturing pass, so this listens on `window` in capture phase and matches
  // the failing element by tag/type instead of by DOM position. Reloads exactly once, guarded by
  // a `?mrRetried=1` query param on the *outer* frame URL, which entry.tsx never reads — it only
  // looks at `location.hash` — so this never disturbs routing.
  const selfHeal = `<script>
    (function () {
      window.addEventListener('error', function (event) {
        var target = event.target
        if (!target || target.tagName !== 'SCRIPT' || target.getAttribute('type') !== 'module') return
        var url = new URL(location.href)
        if (url.searchParams.get('mrRetried') === '1') return
        url.searchParams.set('mrRetried', '1')
        location.replace(url.toString())
      }, true)
    })()
  </script>`
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>mock-review frame</title>
  </head>
  <body>
    <div id="root"></div>
    ${selfHeal}
    <script type="module" src="${src}"></script>
  </body>
</html>
`
  return server.transformIndexHtml(requestUrl, html)
}

/**
 * The reviewer's Vite plugin. Mounts the server API under `/__mock-review/` (D6), the frame
 * document at `GET /?frame=1` (D8), the prebuilt reviewer page at `GET /` (D8/D15), and the
 * in-memory component registry at `GET /r/registry.json` (reference §10) ahead of Vite's own
 * middlewares.
 */
export function mockReview(): Plugin {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const pageDir = path.join(here, '..', 'page')
  const frameEntryPath = path.join(here, '..', 'frame', 'entry.tsx')
  const frameDir = path.dirname(frameEntryPath)

  return {
    name: 'mock-review',
    // D19 (revised — gate round 3): a `config()` hook forcing `optimizeDeps.entries`/`.include`
    // (the frame entry + screens/components/shells globs, plus react/react-dom/jsx-dev-runtime)
    // was tried to pre-bundle the frame's dependencies before the first request, on the theory
    // that the host's missing `index.html` left Vite's startup scan with nothing to crawl.
    // Diagnosed directly (gate repair round 3, scratch Playwright scripts against fresh scratch
    // hosts, comparing response/console/frame-navigation timelines with the hook present vs
    // removed): with the hook, the REVIEWER PAGE embedding the frame in an iframe (the real
    // browser-test path, `tests/browser/**`) reproducibly 504'd `react-dom_client.js` on the
    // very first load — 6/6 runs — while the SAME hook loading the bare frame directly
    // (`/?frame=1` with no reviewer page around it, the `tests/server/api.test.ts` path) never
    // 504'd once across 12+ runs, including under concurrent load and a concurrently-running
    // one-shot `check`/`GET state` Vite server on the same root (ruling out a shared
    // `node_modules/.vite` cache race between the persistent and one-shot servers). Isolating
    // `entries` alone and `include` alone each reproduced the same embedded-only 504. Removing
    // the hook entirely rendered cleanly in every scenario tried (bare, embedded, concurrent,
    // fast-navigation) — 20+/20+ runs, 0 failures, 0 `.vite/deps/*` 504s. The mechanism is not
    // fully explained (the two colliding responses shared the same `?v=` hash, so it is not a
    // simple stale-hash-after-re-optimize race), but the evidence that forcing this particular
    // pre-bundle is the trigger, and that leaving Vite's own lazy per-request dependency
    // discovery alone is reliable, is conclusive enough to drop it rather than carry a
    // reproducible regression. `frameHtml` below adds a same-origin, no-op-when-unneeded
    // self-heal reload as the residual safety net for whatever transient 504 still occurs (the
    // original motivation for D19) instead of pre-bundling.
    configureServer(server) {
      const cwd = server.config.root

      // D25/review-2: log once at startup when either build step never ran (a host installing
      // this package straight from a `dist/` missing `page/` and/or `frame/entry.tsx`) — the
      // fallback responses (`serveIndex`'s 503 below, and the frame route's 503 further down)
      // are now diagnosable instead of a blank 200/404, and this is the one place that explains
      // why for each file independently (a package can ship one without the other).
      if (!existsSync(path.join(pageDir, 'index.html'))) {
        console.error('mock-review: dist/page/index.html missing — package built without the page step')
      }
      if (!existsSync(frameEntryPath)) {
        console.error('mock-review: dist/frame/entry.tsx missing — package built without the frame step')
      }

      // D15: the frame entry lives outside the host's project root (it ships inside this
      // package), so it needs an explicit allow-list entry for Vite to serve it via `/@fs/`.
      server.config.server.fs.allow.push(frameDir)

      server.middlewares.use((req, res, next) => {
        void (async () => {
          if (!req.method) {
            next()
            return
          }

          const url = new URL(req.url ?? '/', 'http://mock-review.local')
          const pathname = url.pathname

          if (req.method === 'GET' && pathname === '/__mock-review/ping') {
            sendJson(res, 200, { ok: true, pid: process.pid })
            return
          }

          if (req.method === 'GET' && pathname === '/__mock-review/state') {
            await handleGetState(req, res, cwd, getRunner(server))
            return
          }

          if (req.method === 'POST' && pathname === '/__mock-review/notes') {
            await handlePostNotes(req, res, cwd, getRunner(server))
            return
          }

          if (req.method === 'POST' && pathname === '/__mock-review/approval') {
            await handlePostApproval(req, res, cwd, getRunner(server))
            return
          }

          if (req.method === 'GET' && pathname === '/__mock-review/events') {
            await handleEvents(req, res, server, cwd, getRunner(server))
            return
          }

          // D24: `ping` and every static asset under the prebuilt page stay open — neither leaks
          // anything the client role's gate is meant to hide (a build artifact, or a liveness
          // check with no host data in it). Vite's own module routes (`/@vite/client`, `/@fs/*`,
          // `/src/*`, `/node_modules/*`) are never intercepted by this middleware at all — they
          // fall through to `next()` below untouched, so gating never turns one into a blank
          // frame or a Vite error overlay.
          if (req.method === 'GET' && pathname.startsWith('/__mock-review/page/')) {
            serveStaticAsset(pageDir, pathname.slice('/__mock-review/page/'.length), res, next)
            return
          }

          if (req.method === 'GET' && pathname === '/r/registry.json') {
            const config = await configFor(cwd, getRunner(server))
            if (roleOf(req, res, config) === 'refused') {
              sendRefused(res)
              return
            }
            const discovered = discoverHost(cwd)
            sendJson(res, 200, buildRegistry(config.name ?? 'app', discovered.components))
            return
          }

          if (req.method === 'GET' && pathname === '/') {
            const config = await configFor(cwd, getRunner(server))
            const isFrame = url.searchParams.get('frame') === '1'
            if (roleOf(req, res, config) === 'refused') {
              // D24: `GET /` (the plain reviewer link a browser opens directly) answers plain
              // text — the shared-link failure a person actually reads; the embedded frame
              // document (`?frame=1`) answers the standard JSON refusal like every other gated
              // route.
              if (isFrame) {
                sendRefused(res)
              } else {
                res.statusCode = 403
                res.setHeader('content-type', 'text/plain; charset=utf-8')
                res.end('mock-review: this link needs its client token')
              }
              return
            }

            if (isFrame) {
              // D25/review-2: without the frame entry file, `frameHtml` would still emit a
              // `<script src="/@fs/...">` pointing at nothing — Vite's own file server then
              // answers a bare 404 for that request with no explanation, and the mock is just
              // blank. Answer the same diagnosable 503 `serveIndex` uses for the missing page,
              // instead of ever building that broken document.
              if (!existsSync(frameEntryPath)) {
                res.statusCode = 503
                res.setHeader('content-type', 'text/html; charset=utf-8')
                res.end(FALLBACK_HTML)
                return
              }
              const html = await frameHtml(server, req.url ?? '/', frameEntryPath)
              res.statusCode = 200
              res.setHeader('content-type', 'text/html; charset=utf-8')
              res.end(html)
              return
            }
            serveIndex(pageDir, res)
            return
          }

          next()
        })().catch(next)
      })
    },
  }
}

export default mockReview
