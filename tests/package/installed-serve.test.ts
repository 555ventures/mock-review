// AC-20260915-03-2 [env: SKIP_BROWSER]: D8's first-class installed-layout target — the package
// materialised under a scratch host's own `node_modules/@555/mock-review/` (never the linked
// repo checkout every other browser test uses), served from that installed `dist/cli.js`, with no
// `node_modules/.vite` yet (a genuinely cold dependency-optimizer start, A7's exact scenario).
// Playwright is only ever imported dynamically, inside this skipIf-gated describe (see
// tests/browser/surfaces.test.ts's header note on why), so SKIP_BROWSER=1 never breaks collection.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, installPackageInto, removeScratchDir } from '../helpers/cli.js'

// D (env gates): a plain describe.skipIf reads, in a long run, like a test that quietly
// disappeared. Report the closed gate as its own passing test with no AC id (an AC-matrix tool
// must never read this sentinel as AC-2 covered and green on a machine with no browser).
it.skipIf(process.env.SKIP_BROWSER !== '1')(
  '[env: SKIP_BROWSER] this file\'s browser assertions were NOT run: SKIP_BROWSER=1 skipped them all',
  () => {
    console.warn('tests/package/installed-serve.test.ts: SKIP_BROWSER=1 — AC-20260915-03-2 skipped, not verified')
    expect(process.env.SKIP_BROWSER).toBe('1')
  },
)

type InstalledServe = { child: ChildProcessWithoutNullStreams; url: string; host: string; scratchRoot: string }

/** Starts `node <installedCliPath> serve` in `host` (the installed layout's own `dist/cli.js`,
 * never the linked `.test-dist/cli.js` every other browser suite spawns) and resolves once the
 * first stdout line (the served URL) arrives. Mirrors tests/helpers/serve.ts's `startServeIn`,
 * parameterized by CLI path since that helper hard-codes the linked build. */
function startInstalledServe(installedCliPath: string, host: string, timeoutMs = 20_000): Promise<InstalledServe> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [installedCliPath, 'serve'], { cwd: host })
    let firstLine = ''
    const timer = setTimeout(() => {
      proc.stdout.off('data', onData)
      reject(new Error(`serve did not print a URL within ${timeoutMs}ms`))
    }, timeoutMs)
    const onData = (chunk: Buffer) => {
      if (firstLine) return
      firstLine = chunk.toString('utf8').split('\n')[0] ?? ''
      if (firstLine) {
        clearTimeout(timer)
        proc.stdout.off('data', onData)
        resolve({ child: proc, url: firstLine.trim(), host, scratchRoot: path.dirname(host) })
      }
    }
    proc.stdout.on('data', onData)
    proc.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function stopInstalledServe(serve: InstalledServe | undefined): Promise<void> {
  if (!serve) return
  if (serve.child.exitCode === null && !serve.child.killed) {
    serve.child.kill('SIGTERM')
    await new Promise((resolve) => serve.child.once('exit', resolve))
  }
  removeScratchDir(serve.scratchRoot)
}

describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-03-2: installed layout renders with a cold optimizer start [env: SKIP_BROWSER]', () => {
  let browser: import('playwright').Browser
  let serve: InstalledServe | undefined

  beforeAll(async () => {
    await ensureFixtures()
    const { chromium } = await import('playwright')
    browser = await chromium.launch()
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
  })

  afterEach(async () => {
    await stopInstalledServe(serve)
    serve = undefined
  })

  it('AC-20260915-03-2: renders the sidebar and the frame with zero 504/5xx responses, one react-dom/client module, and no page errors', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-installed-')
    // D8: never the linked repo checkout — a real materialised install, and no
    // `node_modules/.vite` yet (copyFixtureHost's own node_modules never symlinks dot-directories,
    // so this scratch host has never run Vite's dependency optimizer before this test).
    expect(existsSync(path.join(host, 'node_modules', '.vite'))).toBe(false)
    const installedCliPath = installPackageInto(host)
    expect(existsSync(installedCliPath)).toBe(true)

    serve = await startInstalledServe(installedCliPath, host)

    const page = await browser.newPage()
    const responses: { url: string; status: number }[] = []
    const pageErrors: string[] = []
    page.on('response', (res) => responses.push({ url: res.url(), status: res.status() }))
    page.on('pageerror', (err) => pageErrors.push(err.message))
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle', timeout: 30_000 })

      const sidebar = page.locator('[data-slot="sidebar"]').first()
      await expect.poll(() => sidebar.count(), { timeout: 20_000 }).toBeGreaterThan(0)
      const sidebarWidth = await sidebar.evaluate((el: Element) => el.getBoundingClientRect().width)
      expect(sidebarWidth).toBeGreaterThan(0)

      const frame = page.locator('iframe').first()
      const frameSrc = await frame.getAttribute('src')
      expect(frameSrc?.startsWith('/?frame=1#/home')).toBe(true)
      await expect.poll(
        () => frame.evaluate((el: HTMLIFrameElement) => !!el.contentDocument?.querySelector('[data-component="ConsoleShell"]')),
        { timeout: 20_000 },
      ).toBe(true)

      const badResponses = responses.filter((r) => r.status === 504 || r.status >= 500)
      expect(badResponses).toEqual([])

      const reactDomClientUrls = new Set(
        responses.filter((r) => /react-dom_client\.js/.test(r.url)).map((r) => r.url),
      )
      expect(reactDomClientUrls.size).toBe(1)

      expect(pageErrors).toEqual([])
      expect(pageErrors.some((m) => m.includes("can't detect preamble"))).toBe(false)
      expect(pageErrors.some((m) => m.includes('Invalid hook call'))).toBe(false)
    } finally {
      await page.close()
    }
  }, 60_000)
})
