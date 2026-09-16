// AC-20260915-02-8, -9, -10, -13, -14: D6's server API (GET state, POST notes, POST approval,
// GET events/SSE), D9's viewport-driven device captions.
// AC-20260915-03-1, -3, -4, -7: specs/20260915/03's collapse onto one document/one entry — the
// page/frame-serving and D24-cookie assertions below are rewritten for the single `GET /`
// template (D1) and the `/@id/__x00__mock-review:entry` virtual module (D1), replacing spec 02's
// `/__mock-review/page/*` static asset route and the frame's `/@fs/<frame entry>` script tag.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, installPackageInto, run } from '../helpers/cli.js'
import { startServe, startServeIn, stopServe, type Serve } from '../helpers/serve.js'

const ENTRY_URL = '/@id/__x00__mock-review:entry'

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

  it('AC-20260915-03-1: GET / and GET /?frame=1 answer one HTML document through the entry id, with no page/@fs leftovers, and the entry module is one import ending src/ui/main.tsx', async () => {
    serve = await startServe(greenHost)

    for (const suffix of ['/', '/?frame=1']) {
      const res = await fetch(`${serve.url}${suffix}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      const html = await res.text()
      const scriptMatches = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)]
      const entryScriptMatches = scriptMatches.filter((match) => match[1] === ENTRY_URL)
      expect(entryScriptMatches).toHaveLength(1)
      expect(html).toContain('/@vite/client')
      expect(html).not.toContain('/__mock-review/page/')
      expect(html).not.toContain('/@fs/')
    }

    const entryRes = await fetch(`${serve.url}${ENTRY_URL}`)
    expect(entryRes.status).toBe(200)
    expect(entryRes.headers.get('content-type') ?? '').toMatch(/javascript/)
    const entryBody = (await entryRes.text()).trim()
    const importLines = entryBody
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => !/^\/\/# sourceMappingURL=/.test(line.trim()))
      .filter((line) => !/^\/\/# sourceURL=/.test(line.trim()))
    expect(importLines).toHaveLength(1)
    expect(importLines[0]).toMatch(/^import\s+["'][^"']+src\/ui\/main\.tsx["']/)
    expect(importLines[0]).toMatch(/src\/ui\/main\.tsx["']\s*$/)
  })

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

  it('AC-20260915-03-7 (AC-20260915-02-8/-10, D24): ?client= sets a Set-Cookie, the cookie alone grants client from a forwarded request across every gated route including the entry and its module import, and a Referer-only token or a stale/missing cookie is 403 with no file changed', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const before = readFileSync(notesPath, 'utf8')
    // `X-Forwarded-For` is how a remote client is imitated while every request still physically
    // arrives over loopback (D24: otherwise `owner` only for a loopback socket with none of
    // X-Forwarded-For/Forwarded/Cf-Connecting-Ip present).
    const forwarded = { 'x-forwarded-for': '203.0.113.9' }

    // A ?client= request (even forwarded) that matches the token is `client`, answers the entry
    // document, and sets the cookie.
    const setCookieRes = await fetch(`${serve.url}/?client=replace-me`, { headers: forwarded })
    expect(setCookieRes.status).toBe(200)
    expect(setCookieRes.headers.get('set-cookie')).toBe('mock-review-client=replace-me; Path=/; HttpOnly; SameSite=Lax')
    expect(await setCookieRes.text()).toContain(ENTRY_URL)

    // The cookie alone (no ?client=, still forwarded) is enough for every gated route the D1
    // single-document design makes: `/`, `/?frame=1`, the entry module, the module URL that entry
    // imports, `state` (role: client), and `events` — the mechanism a remote client's browser
    // actually uses once the cookie is set, and the exact case the plugin's earlier Referer-based
    // draft failed (the frame's sub-requests carry the frame's own URL as Referer, never the
    // token).
    const cookieHeaders = { ...forwarded, Cookie: 'mock-review-client=replace-me' }

    const ownerRes = await fetch(`${serve.url}/`, { headers: cookieHeaders })
    expect(ownerRes.status).toBe(200)

    const frameRes = await fetch(`${serve.url}/?frame=1`, { headers: cookieHeaders })
    expect(frameRes.status).toBe(200)

    const entryRes = await fetch(`${serve.url}${ENTRY_URL}`, { headers: cookieHeaders })
    expect(entryRes.status).toBe(200)
    const entryBody = await entryRes.text()
    const importMatch = /import\s+["']([^"']+)["']/.exec(entryBody)
    expect(importMatch).not.toBeNull()
    const importedModuleUrl = importMatch?.[1] ?? ''
    const importedModuleRes = await fetch(`${serve.url}${importedModuleUrl}`, { headers: cookieHeaders })
    expect(importedModuleRes.status).toBe(200)

    const cookieStateRes = await fetch(`${serve.url}/__mock-review/state`, { headers: cookieHeaders })
    expect(cookieStateRes.status).toBe(200)
    const cookieState = (await cookieStateRes.json()) as ServerState
    expect(cookieState.role).toBe('client')

    const cookieEventsRes = await fetch(`${serve.url}/__mock-review/events`, { headers: cookieHeaders })
    expect(cookieEventsRes.status).toBe(200)
    await cookieEventsRes.body?.cancel()

    // A forwarded request with no cookie and no ?client= is refused for `state`.
    const noCookieStateRes = await fetch(`${serve.url}/__mock-review/state`, { headers: forwarded })
    expect(noCookieStateRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

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

  describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-03-3/-4: one document, one entry, CSS isolation and production safety [env: SKIP_BROWSER]', () => {
    it('AC-20260915-03-3: serves the frame with the shell rendered, no reviewer chrome or sidebar CSS, exactly the entry + frame/mount URLs under src/ui/, and toggles html.dark on &scheme=dark', async () => {
      serve = await startServe(greenHost)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${serve.url}/?frame=1#/home?state=Default`, { waitUntil: 'networkidle' })
        await expect.poll(() => page.locator('[data-component="ConsoleShell"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[data-component="ConsoleShell"] button[data-to="Account"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[data-sidebar]').count()).toBe(0)

        // D2/D3: the frame's own module graph never loads the reviewer's index.css, so no
        // stylesheet in this document defines the reviewer's `--sidebar-width` token.
        const hasSidebarWidthRule = await page.evaluate(() => {
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              for (const rule of Array.from(sheet.cssRules)) {
                if (rule.cssText.includes('--sidebar-width')) return true
              }
            } catch {
              // a cross-origin stylesheet throws on .cssRules; none exist in this document.
            }
          }
          return false
        })
        expect(hasSidebarWidthRule).toBe(false)

        // AC-3: resource timing carries exactly one src/ui/main.tsx URL (the entry, loaded once
        // by the outer reviewer document, visible here because same-origin timing entries include
        // cross-frame navigations within the same top-level browsing context in this Playwright
        // page) and one src/ui/frame/mount.tsx URL (D2's frame branch), and no other src/ui/ URL.
        const srcUiUrls = await page.evaluate(() =>
          performance.getEntriesByType('resource').map((e) => e.name).filter((name) => name.includes('src/ui/')),
        )
        expect(srcUiUrls.filter((u) => u.endsWith('src/ui/main.tsx'))).toHaveLength(1)
        expect(srcUiUrls.filter((u) => u.endsWith('src/ui/frame/mount.tsx'))).toHaveLength(1)
        expect(srcUiUrls.filter((u) => !u.endsWith('src/ui/main.tsx') && !u.endsWith('src/ui/frame/mount.tsx'))).toEqual([])

        await page.goto(`${serve.url}/?frame=1#/home?state=Default&scheme=dark`, { waitUntil: 'networkidle' })
        const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        expect(hasDark).toBe(true)
      } finally {
        await browser.close()
      }
    }, 30_000)

    it('AC-20260915-03-4: a host mounting mockReview() in its own vite.config.ts builds clean with no reviewer marker, and serve still answers the entry (double mount)', async () => {
      // D18/D5: the fixture host ships no package.json or index.html (it is only ever loaded
      // through the reviewer's own routes, never as a standalone Vite app). Give the *scratch
      // copy only* (never the committed fixture) an ESM package.json, a minimal HTML entry
      // pointing at a real host module, and a vite.config.ts that also mounts mockReview() —
      // exactly D5's documented host requirements and D4's double-mount case.
      // A JSX dev-source annotation embeds the *absolute* scratch path, which (per this repo's
      // own directory name) can itself contain the literal "mock-review" — strip every literal
      // occurrence of the scratch host's own absolute path out of each file's content before
      // searching, so the assertion is immune to *where* the OS happens to put temp files.
      const host = copyFixtureHost(greenHost, 'reviewer-vitebuild-')
      writeFileSync(path.join(host, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }))
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
      writeFileSync(
        path.join(host, 'vite.config.ts'),
        [
          "import { defineConfig } from 'vite'",
          "import react from '@vitejs/plugin-react'",
          "import tailwindcss from '@tailwindcss/vite'",
          "import { mockReview } from '@555/mock-review/vite'",
          '',
          'export default defineConfig({',
          '  plugins: [react(), tailwindcss(), mockReview()],',
          '})',
          '',
        ].join('\n'),
      )
      // D7/D8: materialises the package under this scratch host's own `node_modules/@555/mock-review/`
      // exactly as a real install would (`.test-dist/` as `dist/`, `src/ui/` as source, its own
      // `package.json` so the `exports` map's `"./vite"` entry resolves `@555/mock-review/vite` to
      // `dist/vite.js`) — the host's `vite.config.ts` above imports it by its real package
      // specifier, not a hand-rolled path, so this exercises the same resolution a published
      // install would.
      installPackageInto(host)

      const result = spawnSync('npx', ['vite', 'build', '--outDir', 'dist'], { cwd: host, encoding: 'utf8' })
      expect(result.status).toBe(0)
      const outDir = path.join(host, 'dist')
      const files = existsSync(outDir) ? (readdirSync(outDir, { recursive: true }) as string[]) : []
      const textFiles = files.filter((f) => /\.(js|css|html)$/.test(f))
      expect(textFiles.length).toBeGreaterThan(0)
      const offending = textFiles.filter((f) => {
        const raw = readFileSync(path.join(outDir, f), 'utf8')
        const withoutScratchPath = raw.split(host).join('')
        return ['data-sidebar', 'Geist', 'mock-review'].some((marker) => withoutScratchPath.includes(marker))
      })
      expect(offending).toEqual([])

      let liveServe: Serve | undefined
      try {
        liveServe = await startServeIn(host)
        const rootRes = await fetch(`${liveServe.url}/`)
        expect(rootRes.status).toBe(200)
        expect(await rootRes.text()).toContain(ENTRY_URL)
        const stateRes = await fetch(`${liveServe.url}/__mock-review/state`)
        expect(stateRes.status).toBe(200)
      } finally {
        await stopServe(liveServe)
      }
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
