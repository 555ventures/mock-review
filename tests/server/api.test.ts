// AC-20260915-02-8, -9, -10, -13, -14: D6's server API (GET state, POST notes, POST approval,
// GET events/SSE), D8's frame + prebuilt-page serving, D9's viewport-driven device captions.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost, pageDir } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'
import { startServe, startServeIn, stopServe, type Serve } from '../helpers/serve.js'

let serve: Serve | undefined

afterEach(async () => {
  await stopServe(serve)
  serve = undefined
})

type ServerState = {
  screens: { name: string }[]
  journeys: { id: string }[]
  inventory: { name: string }[]
  notes: { notes: unknown[]; journeys: Record<string, unknown> }
  approval: { screens: Record<string, unknown>; journeys: Record<string, unknown>; theme: string | null }
  role: 'owner' | 'client'
}

async function getState(url: string, init?: RequestInit): Promise<ServerState> {
  const res = await fetch(`${url}/__mock-review/state`, init)
  expect(res.status).toBe(200)
  return (await res.json()) as ServerState
}

describe('mock-review server API (D6)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-02-8: GET state reports screens/journeys/inventory/notes/approval and role owner, client when the mock-review-client cookie matches the config token', async () => {
    serve = await startServe(greenHost)
    const state = await getState(serve.url)
    expect(state.screens.map((s) => s.name)).toEqual(['account', 'home'])
    expect(state.journeys[0]?.id).toBe('first-visit')
    expect(state.inventory.map((i) => i.name)).toContain('WalletSummary')
    expect(state.notes).toBeDefined()
    expect(state.approval).toBeDefined()
    expect(state.role).toBe('owner')

    // D24 (redesigned): the role travels in the `mock-review-client` cookie, not the Referer —
    // the frame's own sub-requests all carry the frame's URL as Referer with no token, so a
    // Referer-based rule would 403 a real remote client into a blank mock.
    const clientState = await getState(serve.url, {
      headers: { Cookie: 'mock-review-client=replace-me' },
    })
    expect(clientState.role).toBe('client')
  })

  it('AC-20260915-02-9: POST notes {op:add} persists to design/notes.json with no leftover .tmp, and answer over the CLI reaches an SSE notes event within 2s', async () => {
    serve = await startServe(greenHost)

    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: 'home',
          state: 'Default',
          component: 'WalletSummary',
          key: '0',
          snippet: 'Balance',
          status: 'open',
          thread: [{ by: 'owner', text: 'bigger' }],
        },
      }),
    })
    expect(addRes.status).toBe(200)
    const addedDoc = (await addRes.json()) as { notes: { id: string }[] }
    expect(addedDoc.notes.some((n) => n.id === 'N001')).toBe(true)

    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const onDisk = JSON.parse(readFileSync(notesPath, 'utf8'))
    expect(onDisk).toEqual(addedDoc)
    expect(existsSync(`${notesPath}.tmp`)).toBe(false)

    const eventsRes = await fetch(`${serve.url}/__mock-review/events`)
    expect(eventsRes.status).toBe(200)
    const reader = eventsRes.body?.getReader()
    expect(reader).toBeDefined()

    const waitForNotesEvent = (async () => {
      const decoder = new TextDecoder()
      let buf = ''
      while (reader) {
        const { value, done } = await reader.read()
        if (done) throw new Error('SSE stream ended before a notes event')
        buf += decoder.decode(value, { stream: true })
        if (buf.includes('event: notes')) return
      }
    })()

    const answerResult = run(serve.host, ['answer', '--note', 'N001', '--text', 'done'])
    expect(answerResult.status).toBe(0)

    await Promise.race([
      waitForNotesEvent,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no notes SSE event within 2s')), 2000)),
    ])
    reader?.cancel()

    const after = await getState(serve.url)
    const n1 = (after.notes.notes as { id: string; status: string }[]).find((n) => n.id === 'N001')
    expect(n1?.status).toBe('answered')
  }, 20_000)

  it('AC-20260915-02-10: a client-role request may only add notes / clientOk approval; anything else is 403', async () => {
    serve = await startServe(greenHost)
    const clientUrl = `${serve.url}/__mock-review/notes?client=replace-me`

    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const before = readFileSync(notesPath, 'utf8')

    const removeRes = await fetch(clientUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'remove', id: 'N001' }),
    })
    expect(removeRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

    const addRes = await fetch(clientUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'x' }],
        },
      }),
    })
    expect(addRes.status).toBe(200)
    const doc = (await addRes.json()) as { notes: { thread: { by: string }[] }[] }
    expect(doc.notes[doc.notes.length - 1]?.thread[0]?.by).toBe('client')

    const approveScreenRes = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'approveScreen', name: 'home' }),
    })
    expect(approveScreenRes.status).toBe(403)

    const clientOkRes = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'clientOk', id: 'first-visit' }),
    })
    expect(clientOkRes.status).toBe(200)
    const approval = (await clientOkRes.json()) as { journeys: Record<string, { client: string | null }> }
    expect(approval.journeys['first-visit']?.client).toBe('ok')
  })

  it('AC-20260915-02-8/-10 (D24): ?client= sets a Set-Cookie, the cookie alone grants client from a forwarded request, and a Referer-only token or a stale cookie is 403', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const before = readFileSync(notesPath, 'utf8')
    // `X-Forwarded-For` is how a remote client is imitated while every request still physically
    // arrives over loopback (D24: otherwise `owner` only for a loopback socket with none of
    // X-Forwarded-For/Forwarded/Cf-Connecting-Ip present).
    const forwarded = { 'x-forwarded-for': '203.0.113.9' }

    // A ?client= request (even forwarded) that matches the token is `client` and sets the cookie.
    const setCookieRes = await fetch(`${serve.url}/?client=replace-me`, { headers: forwarded })
    expect(setCookieRes.status).toBe(200)
    expect(setCookieRes.headers.get('set-cookie')).toBe('mock-review-client=replace-me; Path=/; HttpOnly; SameSite=Lax')

    // The cookie alone (no ?client=, still forwarded) is enough for `state`, the frame HTML, and
    // the frame's own Vite module route — the mechanism a remote client's browser actually uses
    // once the cookie is set, and the exact case the plugin's earlier Referer-based draft failed
    // (the frame's sub-requests carry the frame's own URL as Referer, never the token).
    const cookieHeaders = { ...forwarded, Cookie: 'mock-review-client=replace-me' }
    const cookieStateRes = await fetch(`${serve.url}/__mock-review/state`, { headers: cookieHeaders })
    expect(cookieStateRes.status).toBe(200)
    const cookieState = (await cookieStateRes.json()) as ServerState
    expect(cookieState.role).toBe('client')

    const frameRes = await fetch(`${serve.url}/?frame=1#/home?state=Default`, { headers: cookieHeaders })
    expect(frameRes.status).toBe(200)
    const frameHtml = await frameRes.text()
    const fsMatch = /src="(\/@fs\/[^"]+)"/.exec(frameHtml)
    expect(fsMatch).not.toBeNull()
    const frameEntryUrl = fsMatch?.[1] ?? ''
    const fsRes = await fetch(`${serve.url}${frameEntryUrl}`, { headers: cookieHeaders })
    expect(fsRes.status).toBe(200)

    // A forwarded request whose only token carrier is the Referer (no cookie, no ?client=) is
    // refused — the Referer is never consulted (D24's rationale: the spike that killed the first
    // draft).
    const refererOnlyRes = await fetch(`${serve.url}/__mock-review/state`, {
      headers: { ...forwarded, Referer: `${serve.url}/?client=replace-me` },
    })
    expect(refererOnlyRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

    // A forwarded request with a stale/wrong cookie value is refused too.
    const staleCookieRes = await fetch(`${serve.url}/__mock-review/state`, {
      headers: { ...forwarded, Cookie: 'mock-review-client=stale' },
    })
    expect(staleCookieRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

    // Plain loopback (no forwarding header, no token) keeps working exactly as before.
    const loopbackRes = await fetch(`${serve.url}/`)
    expect(loopbackRes.status).toBe(200)

    // `ping` stays open regardless.
    const pingRes = await fetch(`${serve.url}/__mock-review/ping`, { headers: forwarded })
    expect(pingRes.status).toBe(200)
  })

  it('AC-20260915-02-8/-9/-11 (D23): approveScreen for an unknown screen is 400 and writes nothing; a non-JSON body is 400, not 500; add ignores a caller id; update/remove of an unknown id is 404', async () => {
    serve = await startServe(greenHost)
    const approvalPath = path.join(serve.host, 'design', 'approval.json')
    const notesPath = path.join(serve.host, 'design', 'notes.json')

    const approvalBefore = readFileSync(approvalPath, 'utf8')
    const unknownScreenRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'approveScreen', name: 'does-not-exist' }),
    })
    expect(unknownScreenRes.status).toBe(400)
    expect(readFileSync(approvalPath, 'utf8')).toBe(approvalBefore)

    const notesBefore = readFileSync(notesPath, 'utf8')
    const nonJsonRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all {{{',
    })
    expect(nonJsonRes.status).toBe(400)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)

    const callerIdRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          id: 'N999',
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'ignored id' }],
        },
      }),
    })
    // NotesPatchSchema's `add.note` is `NoteSchema.omit({id:true}).strict()` — a caller-supplied
    // `id` is an unrecognized key, so the whole patch is refused rather than silently honored.
    expect(callerIdRes.status).toBe(400)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)

    const updateUnknownRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'update', id: 'N999', fields: { status: 'approved' } }),
    })
    expect(updateUnknownRes.status).toBe(404)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)

    const removeUnknownRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'remove', id: 'N999' }),
    })
    expect(removeUnknownRes.status).toBe(404)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)
  })

  it('review pass 3: an unparseable design file answers 409 (a conflict with on-disk state, not a bad request) and is left byte-identical', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const approvalPath = path.join(serve.host, 'design', 'approval.json')

    const corruptNotes = '{ not valid json at all'
    writeFileSync(notesPath, corruptNotes)
    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: { screen: 'home', state: 'Default', component: null, key: null, snippet: null, status: 'open', thread: [{ by: 'owner', text: 'x' }] },
      }),
    })
    expect(addRes.status).toBe(409)
    expect(readFileSync(notesPath, 'utf8')).toBe(corruptNotes)

    const corruptApproval = '{ also not valid json'
    writeFileSync(approvalPath, corruptApproval)
    const approveRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'theme', key: 'nova' }),
    })
    expect(approveRes.status).toBe(409)
    expect(readFileSync(approvalPath, 'utf8')).toBe(corruptApproval)
  })

  it('AC-20260915-02-9 (D23): the SSE stream disposes itself when the client connection drops, without breaking later connections or notes writes', async () => {
    serve = await startServe(greenHost)

    const controller = new AbortController()
    const droppedRes = await fetch(`${serve.url}/__mock-review/events`, { signal: controller.signal })
    expect(droppedRes.status).toBe(200)
    // Read the stream's opening blank line (handleEvents' `res.write('\n')`) so the connection is
    // fully established before it's dropped — aborting before any bytes arrive would test
    // connection setup racing teardown, not the dispose path this AC is about.
    const reader = droppedRes.body?.getReader()
    await reader?.read()
    controller.abort()
    // `req.on('close', dispose)` / `res.on('error', dispose)` run on the server's own event loop
    // tick, not synchronously with the client's abort.
    await new Promise((resolve) => setTimeout(resolve, 300))

    // A write that would otherwise reach the dropped connection's watcher listener (an `add`
    // reaching design/notes.json) must not crash the server — `handleEvents`' own `if
    // (res.writableEnded) return` guard, plus the dispose above, both exist for exactly this.
    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: { screen: 'home', state: 'Default', component: null, key: null, snippet: null, status: 'open', thread: [{ by: 'owner', text: 'sse dispose' }] },
      }),
    })
    expect(addRes.status).toBe(200)
    const addedDoc = (await addRes.json()) as { notes: { id: string }[] }
    const noteId = addedDoc.notes[addedDoc.notes.length - 1]?.id as string

    // Let that write's own filesystem event (and the (harmlessly ignored) attempt to reach the
    // now-disposed watcher) fully settle before opening a second connection, so the CLI `answer`
    // below produces one unambiguous `change` for the fresh listener to catch, not one racing the
    // tail of the previous write.
    await new Promise((resolve) => setTimeout(resolve, 300))

    // A fresh SSE connection opened after the dropped one still receives events normally — the
    // disposed watcher's listeners were actually removed (D23's own doc: "or they leak for the
    // rest of the serve process's life"), not merely ignored by a lingering broken listener. Same
    // trigger (CLI `answer` over the built binary) and window as AC-9's own already-proven SSE
    // check above.
    const freshRes = await fetch(`${serve.url}/__mock-review/events`)
    expect(freshRes.status).toBe(200)
    const freshReader = freshRes.body?.getReader()

    const waitForNotesEvent = (async () => {
      const decoder = new TextDecoder()
      let buf = ''
      while (freshReader) {
        const { value, done } = await freshReader.read()
        if (done) throw new Error('SSE stream ended before a notes event')
        buf += decoder.decode(value, { stream: true })
        if (buf.includes('event: notes')) return
      }
    })()

    const answerResult = run(serve.host, ['answer', '--note', noteId, '--text', 'after dispose'])
    expect(answerResult.status).toBe(0)

    await Promise.race([
      waitForNotesEvent,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no notes SSE event within 5s on the fresh connection')), 5000)),
    ])
    freshReader?.cancel()
  }, 20_000)

  describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-02-13: frame document and prebuilt page [env: SKIP_BROWSER]', () => {
    it('serves the frame with the shell rendered, no reviewer chrome, and toggles html.dark on &scheme=dark', async () => {
      serve = await startServe(greenHost)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${serve.url}/?frame=1#/home?state=Default`, { waitUntil: 'networkidle' })
        await expect.poll(() => page.locator('[data-component="ConsoleShell"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[data-component="ConsoleShell"] button[data-to="Account"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[data-sidebar]').count()).toBe(0)

        await page.goto(`${serve.url}/?frame=1#/home?state=Default&scheme=dark`, { waitUntil: 'networkidle' })
        const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        expect(hasDark).toBe(true)
      } finally {
        await browser.close()
      }
    }, 30_000)

    it('serves the prebuilt reviewer page at GET / with a script tag under /__mock-review/page/', async () => {
      serve = await startServe(greenHost)
      const res = await fetch(`${serve.url}/`)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toMatch(/<script[^>]+src="\/__mock-review\/page\//)
      expect(existsSync(path.join(pageDir, 'index.html'))).toBe(true)
    })

    it('a production `vite build` of the host emits no chunk containing "mock-review"', () => {
      // D18: the fixture host ships no index.html (it is only ever loaded through the reviewer's
      // frame/page routes, never as a standalone Vite app), so a bare `vite build` emits nothing
      // and this assertion would pass vacuously. Give the *scratch copy only* (never the
      // committed fixture) a minimal HTML entry pointing at a real host module, so the build is
      // real and actually exercises the host's own module graph.
      // This label alone isn't enough to keep "mock-review" out of the build output — a JSX
      // dev-source annotation embeds the *absolute* scratch path, and that path is
      // `path.join(tmpdir(), label)`: `tmpdir()` itself comes from TMPDIR, which has twice now
      // been redirected (once by a prior session, once by a concurrent worker in this same
      // review round) to a directory under this repo's own checkout — whose path already
      // contains "mock-review" as this project's own directory name, with no way for this test
      // to control that. Filtering every literal occurrence of the scratch host's own absolute
      // path out of each file's content before searching makes the assertion immune to *where*
      // the OS happens to put temp files, which a label alone can never guarantee.
      const host = copyFixtureHost(greenHost, 'reviewer-vitebuild-')
      writeFileSync(
        path.join(host, 'index.html'),
        [
          '<!doctype html>',
          '<html>',
          '  <body>',
          '    <script type="module" src="/src/screens/home.tsx"></script>',
          '  </body>',
          '</html>',
          '',
        ].join('\n'),
      )
      const result = spawnSync('npx', ['vite', 'build', '--outDir', 'dist'], { cwd: host, encoding: 'utf8' })
      expect(result.status).toBe(0)
      const outDir = path.join(host, 'dist')
      const files = existsSync(outDir) ? (readdirSync(outDir, { recursive: true }) as string[]) : []
      const textFiles = files.filter((f) => /\.(js|css|html)$/.test(f))
      expect(textFiles.length).toBeGreaterThan(0)
      const offending = textFiles.filter((f) => {
        const raw = readFileSync(path.join(outDir, f), 'utf8')
        // Strip every literal occurrence of the scratch host's own absolute path first (dev-source
        // annotations embed it) — what's left is the build's actual emitted content, not an
        // artifact of where the OS put this test's temp files.
        const withoutScratchPath = raw.split(host).join('')
        return withoutScratchPath.includes('mock-review')
      })
      expect(offending).toEqual([])
    }, 60_000)
  })

  describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-02-14: viewport-driven device captions (D9) [env: SKIP_BROWSER]', () => {
    it('defaults to the Desktop view (D18a), and captions Desktop 1280 / Mobile 360 from config.targets.viewports once Both is chosen', async () => {
      serve = await startServe(greenHost)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

        // D18a: the page never defaults to `both` — only the Desktop frame shows at first.
        await expect.poll(() => page.getByText('Desktop 1280').count()).toBeGreaterThan(0)
        expect(await page.getByText('Mobile 360').count()).toBe(0)

        await page.locator('[aria-label="Both"]').click()
        await expect.poll(() => page.getByText('Mobile 360').count()).toBeGreaterThan(0)
        expect(await page.getByText('Desktop 1280').count()).toBeGreaterThan(0)
        // Reference §3: the desktop iframe is sized at the device's raw CSS width (1280px)
        // before the workspace's fit-to-width scale transform is applied.
        const iframeWidthAttr = await page
          .locator('iframe')
          .first()
          .evaluate((el: HTMLIFrameElement) => el.style.width || el.getAttribute('width'))
        expect(iframeWidthAttr).toContain('1280')
      } finally {
        await browser.close()
      }
    }, 30_000)

    it('a single-viewport config hides the Mobile/Both device toggle items, leaving only Desktop', async () => {
      const host = copyFixtureHost(greenHost, 'mock-review-oneviewport-')
      writeFileSync(
        path.join(host, 'mock.config.ts'),
        [
          "export default {",
          "  name: 'app',",
          "  port: 5180,",
          "  targets: { viewports: ['1280x800'], schemes: ['light', 'dark'] },",
          "  theme: null,",
          "  client: { token: 'replace-me' },",
          "}",
          '',
        ].join('\n'),
      )
      serve = await startServeIn(host)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })
        await expect.poll(() => page.locator('[aria-label="Desktop"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[aria-label="Mobile"]').count()).toBe(0)
        expect(await page.locator('[aria-label="Both"]').count()).toBe(0)
      } finally {
        await browser.close()
      }
    }, 30_000)
  })
})
