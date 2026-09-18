import { existsSync, readdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import {
  DesignLockedError,
  ensureDesignFiles,
  readDesignDocOrThrow,
  UnparseableDesignFileError,
  withDesignLock,
  writeJsonAtomic,
} from '../files/json.js'
import { runnerOf, type Runner } from '../analysis/vite-runner.js'
import { loadConfig, NULL_CONFIG } from '../analysis/config.js'
import { discoverHost } from '../analysis/discover.js'
import { CONTRACT_VERSION } from '../schemas/index.js'
import type { Approval, Config, NullConfig, Notes, ThreadEntry } from '../schemas/index.js'
import { ApprovalPatchSchema, NotesPatchSchema, scopeViolation } from '../schemas/patches.js'
import type { AppliedNotesPatch, ApprovalPatch, NotesPatch, ServerState } from '../schemas/patches.js'
import { applyApprovalPatch, applyNotesPatch, type ApprovalPatchCtx } from './patches.js'
import { buildState } from './state.js'
import { buildRegistry } from './registry.js'
import { watchDesignFiles } from './watch.js'

/** D1: what `resolveId` receives — a host-relative virtual specifier, never a real file — and what
 * it resolves to (Rollup's `\0` convention for "don't let any other plugin try to load this as a
 * file"). The browser-facing URL Vite derives from the resolved id is `/@id/__x00__mock-review:entry`
 * (`__x00__` is Vite's own encoding of the leading `\0` for a URL), identical whether the package
 * is linked or installed under `node_modules` — see D1's rationale. */
const ENTRY_ID = 'mock-review:entry'
const RESOLVED_ENTRY_ID = '\0mock-review:entry'
const ENTRY_URL = '/@id/__x00__mock-review:entry'

/** D1: the one HTML document `GET /` (owner, `?client=`, `?frame=1` alike) answers, byte-specified
 * — passed through `server.transformIndexHtml` so the host's own `@vitejs/plugin-react` injects
 * `/@vite/client` and its refresh preamble. `main.tsx` (loaded by the one script tag) switches on
 * `?frame` at runtime (D2), so this same template serves both the reviewer and the frame. */
const ENTRY_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>mock-review</title></head>' +
  `<body><div id="root"></div><script type="module" src="${ENTRY_URL}"></script></body></html>`

/** D4: the complete first-load dependency graph (spike 3) — without every one of these, the linked
 * layout re-optimizes mid-load (a `504 Outdated Optimize Dep` on `react-resizable-panels`) and the
 * installed layout never mounts (`react-dom/client` served as raw CJS, which Vite's scanner does
 * not crawl under `node_modules`). Load-bearing and exact; never trimmed or extended per-host. */
const OPTIMIZE_DEPS_INCLUDE = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'radix-ui',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'lucide-react',
  'cmdk',
  'react-resizable-panels',
]

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
 * `Referer` is never consulted: everything the frame itself loads (`/@vite/client`, the entry
 * module, `/@react-refresh`) sends the frame's own URL as Referer with no token, so a Referer
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

/** D20/D1 (specs/20260916/02): narrows the persistent `serve` server's own SSR environment into
 * the `Runner` shape `analysis/*` already expects (mirrors `analysis/vite-runner.ts`'s
 * `withRunner`, minus the `createServer`/`close` lifecycle — this environment lives for the whole
 * `serve` process) — by shape (`runnerOf`), never vite's `isRunnableDevEnvironment` `instanceof`
 * guard, which is false whenever the host's Vite is a different physical copy than the
 * package's (D2 of specs/20260916/02). */
function getRunner(server: ViteDevServer, viteVersion: string): Runner {
  return runnerOf(server.environments.ssr, { root: server.config.root, viteVersion })
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
    beatsHash: (journeyId) => state.journeys.find((j) => j.id === journeyId)?.beats ?? null,
  }
}

function forceClientThread(thread: ThreadEntry[]): ThreadEntry[] {
  return thread.map((entry) => ({ ...entry, by: 'client' }))
}

/** D2/D6/D11: op-level admission for a client-role request, decided with no document access — an
 * op a client may never issue (`update`, `remove`) is 403 regardless of whether the target id
 * exists, so a never-permitted op can never be used to probe existence. Checked BEFORE the 404
 * pre-check, restoring the original op-then-404 ordering. `add` and `reply` are transformed here
 * (thread entries forced to `by: 'client'` — the wire enum never admits `'client'` itself, so no
 * request can forge this attribution); `close` is admitted at this stage unconditionally — its
 * per-target ownership gate needs the current document and runs later, inside the write lock,
 * AFTER the 404 pre-check (`clientOwnsCloseTarget` below): D11's 404-before-403 governs THAT gate
 * specifically, not op-level admission. Returns `null` when the op itself is never allowed for a
 * client. Returns `AppliedNotesPatch`, not `NotesPatch` — the widened type `by: 'client'` needs to
 * land in (D2/Contracts). */
function clientNotesOpPatch(patch: NotesPatch): AppliedNotesPatch | null {
  if (patch.op === 'add') {
    return { ...patch, note: { ...patch.note, thread: forceClientThread(patch.note.thread) } }
  }
  if (patch.op === 'reply') {
    return { ...patch, entry: { ...patch.entry, by: 'client' } }
  }
  if (patch.op === 'close') return patch
  return null
}

/** D11: `close`'s ownership gate — a client may close only a note or journey conversation they
 * themselves opened (`thread[0].by === 'client'`). Called only after the 404 pre-check has
 * already confirmed the target exists (note, or a known journey — possibly just seeded with a
 * default `{status:'open', thread:[]}` entry by the caller), so this never leaks existence. */
function clientOwnsCloseTarget(id: string, notes: Notes): boolean {
  const note = notes.notes.find((n) => n.id === id)
  const thread = note ? note.thread : notes.journeys[id]?.thread
  return thread?.[0]?.by === 'client'
}

/** D6: a client-role request may `POST approval` only with `op: 'clientOk'`. */
function clientApprovalPatch(patch: ApprovalPatch): ApprovalPatch | null {
  return patch.op === 'clientOk' ? patch : null
}

/** D1: `UnparseableDesignFileError` and the two `*OrThrow` readers now live in `src/files/json.js`
 * beside `ensureDesignFiles` — this file only consumes them, so the write path and every other
 * reader in the package can never drift on what "unreadable" means. */

/** D23/review-2: both write handlers answer 409 (not 400) for an unparseable design file — the
 * request body itself is fine, the conflict is with the target resource's current on-disk state
 * (the textbook use of 409), and 400 would wrongly suggest the client sent something bad. */
function sendUnparseable(res: ServerResponse, err: UnparseableDesignFileError): void {
  sendJson(res, 409, { error: err.message })
}

/** D4: `withDesignLock` refused to acquire `design/.lock` within its acquire window — a retryable
 * 503, distinct from the 409 `sendUnparseable` answers for a document that read fine but doesn't
 * parse. */
function sendLocked(res: ServerResponse, err: DesignLockedError): void {
  sendJson(res, 503, { error: err.message })
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

  // D6/D11: op-level admission runs BEFORE the 404 pre-check — an op a client may never issue
  // (e.g. `remove`, `update`, a bare `journey`) is 403 regardless of whether the target id
  // exists, so it never leaks existence. `close`'s own per-target ownership gate is the one
  // check that runs AFTER 404 (below, inside the lock), per D11.
  let patch: AppliedNotesPatch | null = parsed.data
  if (role === 'client') {
    patch = clientNotesOpPatch(parsed.data)
    if (!patch) {
      res.statusCode = 403
      res.end()
      return
    }
  }
  const appliedPatch = patch

  await withWriteLock(async () => {
    // D4: the journey-existence probe (`buildState`) must never run while the cross-process file
    // lock is held — it renders through Vite, and holding `design/.lock` across that would make
    // every CLI write in the repo queue behind a page render. So it is hoisted above the lock as
    // an UNLOCKED pre-read: decide here, off an unlocked read of `notes.json`, whether `close`'s
    // (D1: or `reply`'s — it resolves an id note-first exactly as `close` does) target is missing
    // from both `notes.notes` and `notes.journeys` — the only case that ever needs the probe —
    // and if so run `buildState` now. An unreadable pre-read just means "no probe": the locked
    // re-read below will hit the same `UnparseableDesignFileError` and refuse through the normal
    // 409 path.
    let closeProbeIsJourney: boolean | undefined
    if (appliedPatch.op === 'close' || appliedPatch.op === 'reply') {
      let preNotes: Notes | undefined
      try {
        preNotes = readDesignDocOrThrow(cwd, 'notes') as Notes
      } catch {
        preNotes = undefined
      }
      if (preNotes) {
        const isNote = preNotes.notes.some((n) => n.id === appliedPatch.id)
        if (!isNote && !(appliedPatch.id in preNotes.journeys)) {
          const state = await buildState(cwd, role, runner)
          closeProbeIsJourney = state.journeys.some((j) => j.id === appliedPatch.id)
        }
      }
    }

    try {
      await withDesignLock(cwd, async () => {
        let notes: Notes
        let approval: Approval
        try {
          // `readDesignDocOrThrow`'s return type is keyed on the runtime `kind` argument, not
          // narrowed by it — each cast is safe because the literal `kind` above guarantees the
          // shape. This is the AUTHORITATIVE read — taken under the lock, it is acted on
          // whatever the unlocked pre-read above saw, including a target seeded by someone else
          // between the two reads.
          notes = readDesignDocOrThrow(cwd, 'notes') as Notes
          // review-2: `applyNotesPatch`'s rule-6 un-approve reads `approval` too and the patch may
          // write it back (see below) — an unparsable `approval.json` is just as much a reason to
          // refuse this write as an unparsable `notes.json`, or rule 6 would silently run against
          // an empty approval document and the real (corrupt) file would never surface to anyone.
          approval = readDesignDocOrThrow(cwd, 'approval') as Approval
        } catch (err) {
          if (err instanceof UnparseableDesignFileError) {
            sendUnparseable(res, err)
            return
          }
          throw err
        }

        // D23: `update`/`remove` for an id with no row in the current document answer 404 and
        // change nothing — never a silent no-op 200.
        if (
          (appliedPatch.op === 'update' || appliedPatch.op === 'remove') &&
          !notes.notes.some((n) => n.id === appliedPatch.id)
        ) {
          res.statusCode = 404
          res.end()
          return
        }

        // D6: `op:'update'`'s write-path scope invariant — checked against the MERGED note
        // (existing + patch fields), not the patch fields alone, so a patch that would leave the
        // note claiming both kinds (or neither) is refused 400. Runs after the 404 pre-check
        // above (the id is known to exist by this point) and before `applyNotesPatch` ever sees
        // the patch. `AddNoteSchema`'s own `superRefine` covers `op:'add'`; the read-back schemas
        // (`src/schemas/notes.ts`) stay permissive on purpose (D6) — an existing contradictory
        // note still loads and renders, it just can't be updated into staying contradictory.
        if (appliedPatch.op === 'update') {
          const existing = notes.notes.find((n) => n.id === appliedPatch.id)
          if (existing) {
            const mergedScreen =
              appliedPatch.fields.screen !== undefined ? appliedPatch.fields.screen : existing.screen
            const mergedProject =
              appliedPatch.fields.project !== undefined ? appliedPatch.fields.project : existing.project
            if (scopeViolation({ screen: mergedScreen, project: mergedProject })) {
              sendJson(res, 400, { error: 'invalid notes patch' })
              return
            }
          }
        }

        // D1/D10/D11: `close` and `reply` alike may target a note or a journey conversation. A
        // note match is checked first; when the id is not a note and not yet a `notes.journeys`
        // entry, both ops must first confirm the id names a REAL journey — unknown everywhere
        // answers 404 (AC-20260917-02-15's "exists nowhere" case, AC-20260918-02-1's unknown-id
        // case). D4: the locked re-read is authoritative — if the target is now present (seeded
        // by another writer between the pre-read and this read), it's acted on directly and the
        // probe is never consulted. The probe's answer is consulted only when this re-read ALSO
        // finds neither. Only once the id is confirmed real is a default `{status:'open',
        // thread:[]}` entry seeded so the reducer below has something to update/append to.
        if (appliedPatch.op === 'close' || appliedPatch.op === 'reply') {
          const isNote = notes.notes.some((n) => n.id === appliedPatch.id)
          if (!isNote && !(appliedPatch.id in notes.journeys)) {
            const isJourney = closeProbeIsJourney ?? false
            if (!isJourney) {
              res.statusCode = 404
              res.end()
              return
            }
            notes = { ...notes, journeys: { ...notes.journeys, [appliedPatch.id]: { status: 'open', thread: [] } } }
          }

          // D11: the ownership gate — a client may CLOSE only a note or journey conversation
          // they themselves opened. `reply` carries no such gate (D2's whole point: a client
          // replying, including to someone else's note, is never refused). Runs only after the
          // 404 pre-check above has confirmed the target exists, so it never leaks existence.
          if (appliedPatch.op === 'close' && role === 'client' && !clientOwnsCloseTarget(appliedPatch.id, notes)) {
            res.statusCode = 403
            res.end()
            return
          }
        }

        const result = applyNotesPatch(notes, appliedPatch, approval)

        // D2: stamped at the write site, not in the pure `applyNotesPatch` reducer — stamping
        // inside it would break `unapproveScreen`'s no-op identity check and rewrite
        // `approval.json` on every note patch.
        const stampedNotes: Notes = { ...result.notes, contractVersion: CONTRACT_VERSION }
        writeJsonAtomic(path.join(cwd, 'design', 'notes.json'), stampedNotes)
        if (result.approval !== approval) {
          const stampedApproval: Approval = { ...result.approval, contractVersion: CONTRACT_VERSION }
          writeJsonAtomic(path.join(cwd, 'design', 'approval.json'), stampedApproval)
        }

        sendJson(res, 200, stampedNotes)
      })
    } catch (err) {
      if (err instanceof DesignLockedError) {
        sendLocked(res, err)
        return
      }
      throw err
    }
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

    // D7: the client confirm is If-Match on the story hash — three guards, in this order, all
    // inside the write lock where `buildState`'s result (`state.journeys`) is already in hand.
    // (1) unknown journey; (2) a journey with nothing confirmable yet (`beats === null`); (3) the
    // hash the client echoed no longer matches what would be served now (the seed moved under
    // them since they read it) — 409, file left byte-identical. Only once all three pass does the
    // reducer write.
    if (appliedPatch.op === 'clientOk') {
      const journey = state.journeys.find((j) => j.id === appliedPatch.id)
      if (!journey) {
        sendJson(res, 400, { error: `unknown journey ${appliedPatch.id}` })
        return
      }
      if (journey.beats === null) {
        sendJson(res, 400, {
          error: `journey ${appliedPatch.id} has no beats — every step needs a sentence before a client can confirm it`,
        })
        return
      }
      if (appliedPatch.beats !== journey.beats) {
        sendJson(res, 409, { error: 'story changed since it was shown — reload' })
        return
      }
    }

    // D4: the file lock wraps only this read→apply→write span — `buildState` and the validation
    // guards above run unlocked, still inside the in-process `withWriteLock`, so a cross-process
    // lock is never held across a Vite render.
    try {
      await withDesignLock(cwd, async () => {
        let approval: Approval
        try {
          approval = readDesignDocOrThrow(cwd, 'approval') as Approval
        } catch (err) {
          if (err instanceof UnparseableDesignFileError) {
            sendUnparseable(res, err)
            return
          }
          throw err
        }
        const next = applyApprovalPatch(approval, appliedPatch, ctxFromState(cwd, state))

        // D2: stamped at the write site, not inside the pure `applyApprovalPatch` reducer.
        const stampedNext: Approval = { ...next, contractVersion: CONTRACT_VERSION }
        writeJsonAtomic(path.join(cwd, 'design', 'approval.json'), stampedNext)

        sendJson(res, 200, stampedNext)
      })
    } catch (err) {
      if (err instanceof DesignLockedError) {
        sendLocked(res, err)
        return
      }
      throw err
    }
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

/** D1: `pkgRoot` of the *compiled* plugin module — both `dist/server/plugin.js` (a real install)
 * and `.test-dist/server/plugin.js` (this repo's own test build) sit two directories under the
 * package root, so this one calculation resolves correctly in every layout the package ships in. */
function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', '..')
}

/** D1/D3 (specs/20260916/01): the root-relative posix path a `hotUpdate` file lives at, or
 * `undefined` when `file` is outside `root` (mirrors the old `srcRelativePath` minus its `src`
 * check — that check now lives in the handler itself, which also classifies `design`). */
function rootRelative(root: string, file: string): string | undefined {
  const rel = path.relative(root, file)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined
  return rel.split(path.sep).join('/')
}

/**
 * The reviewer's Vite plugin. Mounts the server API under `/__mock-review/` (D6), the in-memory
 * component registry at `GET /r/registry.json` (reference §10), and `GET /` (owner, `?client=`,
 * `?frame=1` alike) as the one entry document (D1) ahead of Vite's own middlewares. `resolveId`/
 * `load` answer the virtual entry module id (D1). An unconditional, object-form `order: 'pre'`
 * `hotUpdate` hook (specs/20260916/01 D1-D3) runs ahead of every host plugin in both mounts
 * (`serve` and a host's own `vite.config.ts`): in the client environment, any file under
 * `<root>/design/` is silenced (`[]`, nothing sent) so the host's Tailwind scan never full-reloads
 * the reviewer on a design write, and any file under `<root>/src/` sends the frame-only
 * `mock-review:frame-reload` custom event and returns `[]`; every other file, and every
 * non-client environment, gets Vite's default handling (`undefined`).
 */
export function mockReview(): Plugin {
  const pkgRoot = packageRoot()
  const entryModulePath = path.resolve(pkgRoot, 'src', 'ui', 'main.tsx')

  const plugin: Plugin = {
    name: 'mock-review',
    apply: 'serve',

    config() {
      return {
        optimizeDeps: { include: OPTIMIZE_DEPS_INCLUDE },
        resolve: { dedupe: ['react', 'react-dom'] },
      }
    },

    resolveId(id) {
      if (id === ENTRY_ID) return RESOLVED_ENTRY_ID
      return undefined
    },

    load(id) {
      if (id === RESOLVED_ENTRY_ID) return `import ${JSON.stringify(entryModulePath)}\n`
      return undefined
    },

    // specs/20260916/01 D1-D3: object-form `order: 'pre'` is load-bearing (Vite sorts
    // `hotUpdate` hooks by the hook object's own `order`, never by plugin `enforce`) — it splices
    // this handler ahead of every host plugin (Tailwind, plugin-react) regardless of where the
    // host lists `mockReview()`, so its `[]` empties `modules` before they ever see the file.
    hotUpdate: {
      order: 'pre',
      handler(options) {
        if (this.environment.name !== 'client') return undefined
        const rel = rootRelative(options.server.config.root, options.file)
        if (rel === undefined) return undefined
        const top = rel.split('/')[0]
        if (top === 'design') return []
        if (top === 'src') {
          this.environment.hot.send('mock-review:frame-reload', { file: rel })
          return []
        }
        return undefined
      },
    },

    configureServer(server) {
      // D1 (specs/20260916/02): captured once here — this hook's `this` is a `PluginContext`
      // with `meta.viteVersion`; the middleware closure below reads the captured string rather
      // than re-reading `this`, which is unavailable inside the closure.
      const viteVersion = this.meta.viteVersion
      const cwd = server.config.root

      // D1: `src/ui/main.tsx` (and everything it imports) lives outside the host's project root
      // when the package is linked, so it needs an explicit allow-list entry for Vite to serve it
      // via `/@fs/`. Harmless to push twice (D4's double-mount case).
      server.config.server.fs.allow.push(pkgRoot)

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
            await handleGetState(req, res, cwd, getRunner(server, viteVersion))
            return
          }

          if (req.method === 'POST' && pathname === '/__mock-review/notes') {
            await handlePostNotes(req, res, cwd, getRunner(server, viteVersion))
            return
          }

          if (req.method === 'POST' && pathname === '/__mock-review/approval') {
            await handlePostApproval(req, res, cwd, getRunner(server, viteVersion))
            return
          }

          if (req.method === 'GET' && pathname === '/__mock-review/events') {
            await handleEvents(req, res, server, cwd, getRunner(server, viteVersion))
            return
          }

          if (req.method === 'GET' && pathname === '/r/registry.json') {
            const config = await configFor(cwd, getRunner(server, viteVersion))
            if (roleOf(req, res, config) === 'refused') {
              sendRefused(res)
              return
            }
            const discovered = discoverHost(cwd)
            sendJson(res, 200, buildRegistry(config.name ?? 'app', discovered.components))
            return
          }

          // D1: `GET /` answers the one entry document for the owner, `?client=` and `?frame=1`
          // alike — `main.tsx` (loaded by the one script tag) picks the frame branch at runtime
          // when the URL carries `frame` (D2). Vite's own module routes (`/@vite/client`,
          // `/@id/*`, `/@fs/*`, `/src/*`, `/node_modules/*`) are never intercepted by this
          // middleware at all — they fall through to `next()` below untouched.
          if (req.method === 'GET' && pathname === '/') {
            const config = await configFor(cwd, getRunner(server, viteVersion))
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

            const html = await server.transformIndexHtml(req.url ?? '/', ENTRY_HTML)
            res.statusCode = 200
            res.setHeader('content-type', 'text/html; charset=utf-8')
            res.end(html)
            return
          }

          next()
        })().catch(next)
      })
    },
  }

  return plugin
}

export default mockReview
