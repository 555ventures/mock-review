// AC-20260916-01-4, AC-20260916-01-5 [env: SKIP_BROWSER]: a design write (a note add) must never
// reload the reviewer document, in `mock-review serve` (AC-4) and in a host embedding
// `mockReview()` in its own vite.config.ts (AC-5) alike; AC-5 additionally proves a host src/**
// edit still reloads the frame document alone in that embedded mount (D3). A8: every scratch
// host's design/approval.json is seeded with theme "nova" before its server starts, or the
// Tailwind reload this spec fixes never even fires (the fixture's default CSS never links a
// themed stylesheet without it) and these tests would measure nothing. Playwright is imported
// dynamically inside this skipIf-gated describe (see tests/browser/surfaces.test.ts's header note
// on why SKIP_BROWSER=1 still lets this file collect).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, installPackageInto, removeScratchDir } from '../helpers/cli.js'
import { startServeIn, stopServe, type Serve } from '../helpers/serve.js'
import { EMPTY_APPROVAL } from '../../src/schemas/index.js'

it.skipIf(process.env.SKIP_BROWSER !== '1')(
  '[env: SKIP_BROWSER] this file\'s browser assertions were NOT run: SKIP_BROWSER=1 skipped them all',
  () => {
    console.warn('tests/browser/reload.test.ts: SKIP_BROWSER=1 — AC-20260916-01-4/-5 skipped, not verified')
    expect(process.env.SKIP_BROWSER).toBe('1')
  },
)

const NOTE_PATCH = {
  op: 'add' as const,
  note: {
    screen: 'home',
    state: 'Default',
    component: 'WalletSummary',
    key: '0',
    snippet: 'USD 128.50',
    status: 'open' as const,
    thread: [{ by: 'owner' as const, text: 'bigger' }],
  },
}

/** Seeds `design/approval.json` with `theme: "nova"` (A8) before a server ever starts on `host`. */
function seedNovaTheme(host: string): void {
  mkdirSync(path.join(host, 'design'), { recursive: true })
  writeFileSync(path.join(host, 'design', 'approval.json'), JSON.stringify({ ...EMPTY_APPROVAL, theme: 'nova' }))
}

/** Plants a marker on `window` that only survives while the document itself is never reloaded (a
 * real navigation tears down every JS global). */
async function plantWindowMarker(page: import('playwright').Page, key: string): Promise<void> {
  await page.evaluate((k) => {
    ;(window as unknown as Record<string, string>)[k] = 'alive'
  }, key)
}

async function readWindowMarker(page: import('playwright').Page, key: string): Promise<string | undefined> {
  return page.evaluate((k) => (window as unknown as Record<string, string | undefined>)[k], key)
}

/** Plants/reads a marker on the mock iframe's own `contentWindow` — gone once the frame document
 * itself reloads, even though the outer reviewer document never did. */
async function plantFrameMarker(iframe: import('playwright').Locator, key: string): Promise<void> {
  await iframe.evaluate((el: HTMLIFrameElement, k: string) => {
    const win = el.contentWindow as unknown as Record<string, string> | null
    if (win) win[k] = 'alive'
  }, key)
}

async function readFrameMarker(iframe: import('playwright').Locator, key: string): Promise<string | undefined> {
  return iframe.evaluate(
    (el: HTMLIFrameElement, k: string) => (el.contentWindow as unknown as Record<string, string | undefined> | null)?.[k],
    key,
  )
}

/** Spawns the fixture host's own `node_modules/.bin/vite` dev server (D8's "npx vite --host
 * 127.0.0.1 --port 0-equivalent") in `host` and resolves once it prints its Local URL. */
function startViteDev(host: string, timeoutMs = 30_000): Promise<{ child: ChildProcessWithoutNullStreams; url: string }> {
  return new Promise((resolve, reject) => {
    const bin = path.join(host, 'node_modules', '.bin', 'vite')
    const proc = spawn(bin, ['--host', '127.0.0.1', '--port', '0'], { cwd: host })
    let out = ''
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`vite dev server did not print a Local URL within ${timeoutMs}ms; output so far:\n${out}`))
    }, timeoutMs)
    const onData = (chunk: Buffer) => {
      out += chunk.toString('utf8')
      const match = out.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)\/?/)
      if (match?.[1]) {
        clearTimeout(timer)
        proc.stdout.off('data', onData)
        resolve({ child: proc, url: match[1] })
      }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
    })
    proc.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function stopViteDev(child: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  if (!child) return
  if (child.exitCode === null && !child.killed) {
    child.kill('SIGTERM')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260916-01-4/-5: a design write costs the reviewer nothing but its SSE refetch [env: SKIP_BROWSER]', () => {
  let browser: import('playwright').Browser

  beforeAll(async () => {
    await ensureFixtures()
    const { chromium } = await import('playwright')
    browser = await chromium.launch()
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
  })

  describe('AC-20260916-01-4: mock-review serve', () => {
    let serve: Serve | undefined
    let scratchRoot: string | undefined

    afterEach(async () => {
      await stopServe(serve)
      serve = undefined
      if (scratchRoot) removeScratchDir(scratchRoot)
      scratchRoot = undefined
    })

    it('AC-20260916-01-4: a note add shows its pin while both markers survive and the iframe src is unchanged', async () => {
      const host = copyFixtureHost(greenHost, 'reload-ac4-')
      scratchRoot = path.dirname(host)
      seedNovaTheme(host)
      serve = await startServeIn(host)
      const { url } = serve

      const page = await browser.newPage()
      try {
        await page.goto(`${url}/#/home`, { waitUntil: 'networkidle' })

        const pin = page.locator('button[aria-label^="Open note "]')
        expect(await pin.count()).toBe(0)

        await plantWindowMarker(page, '__spec04')
        const iframe = page.locator('iframe').first()
        await plantFrameMarker(iframe, '__spec04Frame')

        const srcBefore = await iframe.getAttribute('src')

        const res = await fetch(`${url}/__mock-review/notes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(NOTE_PATCH),
        })
        expect(res.status).toBe(200)

        await expect.poll(() => pin.count(), { timeout: 3_000 }).toBe(1)

        expect(await readWindowMarker(page, '__spec04')).toBe('alive')
        expect(await readFrameMarker(iframe, '__spec04Frame')).toBe('alive')
        expect(await iframe.getAttribute('src')).toBe(srcBefore)
      } finally {
        await page.close()
      }
    }, 30_000)
  })

  describe('AC-20260916-01-5: mockReview() embedded in a host\'s own vite.config.ts', () => {
    let host: string | undefined
    let viteChild: ChildProcessWithoutNullStreams | undefined

    afterEach(async () => {
      await stopViteDev(viteChild)
      viteChild = undefined
      if (host) removeScratchDir(path.dirname(host))
      host = undefined
    })

    it('AC-20260916-01-5: (a) a note add keeps both markers and the iframe src while the pin appears; (b) a host src/** edit reloads the frame alone, the reviewer document (and its marker) surviving', async () => {
      host = copyFixtureHost(greenHost, 'reload-ac5-')
      seedNovaTheme(host)
      writeFileSync(path.join(host, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }))
      writeFileSync(
        path.join(host, 'index.html'),
        ['<!doctype html>', '<html>', '  <body>', '    <script type="module" src="/src/screens/home.tsx"></script>', '  </body>', '</html>', ''].join('\n'),
      )
      writeFileSync(
        path.join(host, 'vite.config.ts'),
        [
          "import path from 'node:path'",
          "import { fileURLToPath } from 'node:url'",
          "import { defineConfig } from 'vite'",
          "import react from '@vitejs/plugin-react'",
          "import tailwindcss from '@tailwindcss/vite'",
          "import { mockReview } from '@555/mock-review/vite'",
          '',
          "const dirname = path.dirname(fileURLToPath(import.meta.url))",
          '',
          'export default defineConfig({',
          '  plugins: [react(), tailwindcss(), mockReview()],',
          '  resolve: { alias: { "@": path.resolve(dirname, "./src") } },',
          '})',
          '',
        ].join('\n'),
      )
      installPackageInto(host)

      const started = await startViteDev(host)
      viteChild = started.child
      const url = started.url

      const page = await browser.newPage()
      try {
        await page.goto(`${url}/#/home`, { waitUntil: 'networkidle' })

        const pin = page.locator('button[aria-label^="Open note "]')
        expect(await pin.count()).toBe(0)

        await plantWindowMarker(page, '__spec05')
        const iframe = page.locator('iframe').first()
        await plantFrameMarker(iframe, '__spec05Frame')
        const srcBefore = await iframe.getAttribute('src')

        // (a) a note add.
        const res = await fetch(`${url}/__mock-review/notes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(NOTE_PATCH),
        })
        expect(res.status).toBe(200)

        await expect.poll(() => pin.count(), { timeout: 3_000 }).toBe(1)
        expect(await readWindowMarker(page, '__spec05')).toBe('alive')
        expect(await readFrameMarker(iframe, '__spec05Frame')).toBe('alive')
        expect(await iframe.getAttribute('src')).toBe(srcBefore)

        // (b) a host source edit — the frame document alone reloads (D3), never the reviewer.
        const homeFile = path.join(host as string, 'src', 'screens', 'home.tsx')
        const original = readFileSync(homeFile, 'utf8')
        writeFileSync(homeFile, original.replace('>Account</Button>', '>Account (edited)</Button>'))

        await expect
          .poll(() => iframe.evaluate((el: HTMLIFrameElement) => el.contentDocument?.body.textContent ?? ''), {
            timeout: 3_000,
          })
          .toContain('Account (edited)')

        expect(await readWindowMarker(page, '__spec05')).toBe('alive')
        expect(await readFrameMarker(iframe, '__spec05Frame')).toBeUndefined()
        expect(await iframe.getAttribute('src')).toBe(srcBefore)
      } finally {
        await page.close()
      }
    }, 40_000)
  })
})
