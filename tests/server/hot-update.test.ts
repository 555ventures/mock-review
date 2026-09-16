// AC-20260916-01-2, AC-20260916-01-3 (D8 of specs/20260916/01): a Vite dev server built the same
// way `serve.ts` builds one, on a scratch copy of `tests/fixtures/host`, with a raw `vite-hmr`
// WebSocket counting `full-reload` frames. D8 gives the exact config; A8 gives the mandatory
// `approval.theme: "nova"` seed — without it the fixture's own stylesheet never imports
// `nova.css` and nothing in this file measures anything real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost } from '../helpers/cli.js'
import { mockReview } from '../../src/server/plugin.js'
import { EMPTY_APPROVAL, EMPTY_NOTES } from '../../src/schemas/index.js'

type HmrFrame = Record<string, unknown>

/** Opens a raw `vite-hmr` WebSocket to `url` (D8) and resolves once it's open, with `frames`
 * accumulating every parsed JSON message the server sends for the life of the connection. */
function openHmrSocket(url: string): Promise<{ ws: WebSocket; frames: HmrFrame[] }> {
  const wsUrl = url.replace(/^http/, 'ws')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, 'vite-hmr')
    const frames: HmrFrame[] = []
    const timer = setTimeout(() => reject(new Error('hmr socket did not open within 5000ms')), 5000)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve({ ws, frames })
    })
    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        frames.push(JSON.parse(String(ev.data)) as HmrFrame)
      } catch {
        // non-JSON frame — never sent by Vite's own hmr channel; ignored defensively.
      }
    })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('hmr socket error before it opened'))
    })
  })
}

async function settle(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/** The `full-reload` frames received strictly after `sinceIndex` in `frames`. */
function fullReloadsSince(frames: HmrFrame[], sinceIndex: number): HmrFrame[] {
  return frames.slice(sinceIndex).filter((f) => f.type === 'full-reload')
}

/** AC-2's shared assertion: whatever `full-reload` frames arrived, none may be path-less and none
 * may carry a document-level path (`/` or `*`) — either shape is the reload every connected
 * document (reviewer window and mock iframe alike) would suffer. Returns the frames for a caller
 * that also expects one specific path-carrying frame (D7's `.html` case). */
function assertNoBroadReload(fullReloads: HmrFrame[]): HmrFrame[] {
  const pathless = fullReloads.filter((f) => f.path === undefined)
  const broad = fullReloads.filter((f) => f.path === '/' || f.path === '*')
  expect(pathless).toEqual([])
  expect(broad).toEqual([])
  return fullReloads
}

describe('AC-20260916-01-2/-3: design/** writes send nothing (or D7\'s inert .html frame), SSE keeps delivering', () => {
  let host: string
  let server: ViteDevServer
  let url: string
  let ws: WebSocket
  let frames: HmrFrame[]
  let novaCssAbs: string

  beforeAll(async () => {
    await ensureFixtures()
    host = copyFixtureHost(greenHost, 'hot-update-')

    // Preconditions (AC-2): every design file present before the server starts, approval seeded
    // with theme "nova" (A8) or nothing below is ever measured.
    mkdirSync(path.join(host, 'design'), { recursive: true })
    writeFileSync(path.join(host, 'design', 'notes.json'), JSON.stringify(EMPTY_NOTES))
    writeFileSync(path.join(host, 'design', 'approval.json'), JSON.stringify({ ...EMPTY_APPROVAL, theme: 'nova' }))
    mkdirSync(path.join(host, 'design', 'mocks'), { recursive: true })
    writeFileSync(path.join(host, 'design', 'mocks', 'status.json'), JSON.stringify({ ok: true }))
    mkdirSync(path.join(host, 'design', 'shell'), { recursive: true })
    writeFileSync(path.join(host, 'design', 'shell', 'app.html'), '<!doctype html><html><body></body></html>')

    // D8: the same inline config serve.ts uses, plus a scratch-local cacheDir so this server can
    // evict nothing from a shared node_modules/.vite/deps (the Gotcha this D8 decision cites).
    server = await createServer({
      root: host,
      configFile: path.join(host, 'vite.config.ts'),
      logLevel: 'silent',
      appType: 'custom',
      plugins: [mockReview()],
      cacheDir: path.join(host, '.vite-test'),
      server: { host: '127.0.0.1' },
    })
    await server.listen()

    const resolvedLocal = server.resolvedUrls?.local[0] ?? ''
    url = resolvedLocal.replace(/\/$/, '')

    // AC-2: GET / and GET /src/themes/nova.css once, so Tailwind's own scan has actually run —
    // the test then asserts the module graph directly, so a silent no-scan can never pass it.
    const rootRes = await fetch(`${url}/`)
    expect(rootRes.status).toBe(200)
    const cssRes = await fetch(`${url}/src/themes/nova.css`)
    expect(cssRes.status).toBe(200)

    novaCssAbs = path.join(host, 'src', 'themes', 'nova.css')
    const scanned = server.environments.client.moduleGraph.getModulesByFile(novaCssAbs)
    expect(scanned?.size).toBe(1)

    const opened = await openHmrSocket(url)
    ws = opened.ws
    frames = opened.frames
  }, 60_000)

  afterAll(async () => {
    ws?.close()
    await server?.close()
    rmSync(host, { recursive: true, force: true })
  })

  it('AC-20260916-01-2: design/** writes never full-reload every document; design/shell/app.html gets exactly Vite\'s own inert path-carrying frame (D7)', async () => {
    // design/notes.json rewritten through .tmp + rename.
    let since = frames.length
    const notesPath = path.join(host, 'design', 'notes.json')
    writeFileSync(`${notesPath}.tmp`, JSON.stringify({ ...EMPTY_NOTES, notes: [] }))
    renameSync(`${notesPath}.tmp`, notesPath)
    await settle(1500)
    assertNoBroadReload(fullReloadsSince(frames, since))

    // design/approval.json likewise.
    since = frames.length
    const approvalPath = path.join(host, 'design', 'approval.json')
    writeFileSync(`${approvalPath}.tmp`, JSON.stringify({ ...EMPTY_APPROVAL, theme: 'nova' }))
    renameSync(`${approvalPath}.tmp`, approvalPath)
    await settle(1500)
    assertNoBroadReload(fullReloadsSince(frames, since))

    // design/mocks/status.json overwritten.
    since = frames.length
    writeFileSync(path.join(host, 'design', 'mocks', 'status.json'), JSON.stringify({ ok: false }))
    await settle(1500)
    assertNoBroadReload(fullReloadsSince(frames, since))

    // design/mocks/ledger.md created then deleted.
    since = frames.length
    const ledgerPath = path.join(host, 'design', 'mocks', 'ledger.md')
    writeFileSync(ledgerPath, '# ledger\n')
    await settle(500)
    if (existsSync(ledgerPath)) unlinkSync(ledgerPath)
    await settle(1500)
    assertNoBroadReload(fullReloadsSince(frames, since))

    // design/shell/app.html overwritten — D7: Vite's own full-reload for an edited .html file
    // carries that file's path and is inert because neither reviewer document is served there;
    // the plugin does not, and must not, additionally suppress it.
    since = frames.length
    writeFileSync(path.join(host, 'design', 'shell', 'app.html'), '<!doctype html><html><body>changed</body></html>')
    await settle(1500)
    const htmlReloads = assertNoBroadReload(fullReloadsSince(frames, since))
    expect(htmlReloads).toHaveLength(1)
    expect(htmlReloads[0]?.path).toBe('/design/shell/app.html')
  }, 30_000)

  it('AC-20260916-01-3: notes.json and approval.json writes CONTINUE TO deliver exactly one notes/approval SSE frame each', async () => {
    const eventsRes = await fetch(`${url}/__mock-review/events`)
    expect(eventsRes.status).toBe(200)
    const reader = eventsRes.body?.getReader()
    if (!reader) throw new Error('no SSE body reader')

    let buf = ''
    let notesCount = 0
    let approvalCount = 0
    const pump = (async () => {
      const decoder = new TextDecoder()
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          notesCount = (buf.match(/event: notes/g) ?? []).length
          approvalCount = (buf.match(/event: approval/g) ?? []).length
        }
      } catch {
        // reader cancelled below once this test has what it needs.
      }
    })()

    const notesPath = path.join(host, 'design', 'notes.json')
    writeFileSync(`${notesPath}.tmp`, JSON.stringify({ ...EMPTY_NOTES, notes: [] }))
    renameSync(`${notesPath}.tmp`, notesPath)

    await settle(2000)

    const approvalPath = path.join(host, 'design', 'approval.json')
    writeFileSync(`${approvalPath}.tmp`, JSON.stringify({ ...EMPTY_APPROVAL, theme: 'nova' }))
    renameSync(`${approvalPath}.tmp`, approvalPath)

    await settle(2000)
    await reader.cancel()
    await pump

    expect(notesCount).toBe(1)
    expect(approvalCount).toBe(1)
  }, 20_000)
})
