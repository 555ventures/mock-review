// AC-20260915-03-6 [env: SKIP_BROWSER]: D9's `hotUpdate` interception — a host source edit
// reloads the frame document alone, never the reviewer document, while every reviewer-side state
// (here, the drawn pin and a marker planted on `window`) survives untouched. Playwright is only
// ever imported dynamically, inside this skipIf-gated describe (see tests/browser/surfaces.test.ts's
// header note on why), so SKIP_BROWSER=1 never breaks collection of this file.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { startServe, stopServe, type Serve } from '../helpers/serve.js'

it.skipIf(process.env.SKIP_BROWSER !== '1')(
  '[env: SKIP_BROWSER] this file\'s browser assertions were NOT run: SKIP_BROWSER=1 skipped them all',
  () => {
    console.warn('tests/browser/hmr.test.ts: SKIP_BROWSER=1 — AC-20260915-03-6 skipped, not verified')
    expect(process.env.SKIP_BROWSER).toBe('1')
  },
)

describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-03-6: a host edit reloads the frame, never the reviewer document [env: SKIP_BROWSER]', () => {
  let browser: import('playwright').Browser
  let serve: Serve | undefined

  beforeAll(async () => {
    await ensureFixtures()
    const { chromium } = await import('playwright')
    browser = await chromium.launch()
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
  })

  afterEach(async () => {
    await stopServe(serve)
    serve = undefined
  })

  it('AC-20260915-03-6: an edited screen shows up inside the iframe within 2s, with the iframe src unchanged, the reviewer document not reloaded, the pin kept, one files SSE event, and a changed screens[home].hash', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve

    // Draw pin N001 first (mirrors AC-9's own precondition setup) so this test can assert it
    // survives the frame's document reload.
    const notesPath = path.join(serveHost, 'design', 'notes.json')
    writeFileSync(
      notesPath,
      JSON.stringify({
        contractVersion: 1,
        notes: [
          {
            id: 'N001',
            screen: 'home',
            state: 'Default',
            component: 'WalletSummary',
            key: '0',
            snippet: 'USD 128.50',
            status: 'open',
            thread: [{ by: 'owner', text: 'Make the balance bigger' }],
          },
        ],
        journeys: {},
      }),
    )

    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/#/home`, { waitUntil: 'networkidle' })

      const pin = page.locator('button[aria-label="Open note N001"]')
      await expect.poll(() => pin.count(), { timeout: 20_000 }).toBeGreaterThan(0)

      // A marker that only survives if the reviewer document itself never reloaded (a real
      // navigation tears down every JS global).
      await page.evaluate(() => {
        ;(window as unknown as { __spec03?: string }).__spec03 = 'alive'
      })

      const iframe = page.locator('iframe').first()
      const srcBefore = await iframe.getAttribute('src')

      const stateBefore = (await (await fetch(`${serveUrl}/__mock-review/state`)).json()) as {
        screens: Array<{ name: string; hash: string }>
      }
      const hashBefore = stateBefore.screens.find((s) => s.name === 'home')?.hash

      const eventsRes = await fetch(`${serveUrl}/__mock-review/events`)
      const reader = eventsRes.body?.getReader()
      const filesEventCount = (async () => {
        const decoder = new TextDecoder()
        let buf = ''
        let count = 0
        try {
          while (reader) {
            const { value, done } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const matches = buf.match(/event: files/g)
            if (matches) count = matches.length
          }
        } catch {
          // the reader is cancelled below once this test has what it needs; a read racing that
          // cancellation throwing is expected, not a failure.
        }
        return count
      })()

      const homeFile = path.join(serveHost, 'src', 'screens', 'home.tsx')
      const original = readFileSync(homeFile, 'utf8')
      writeFileSync(homeFile, original.replace('>Account</Button>', '>Account (edited)</Button>'))

      await expect.poll(
        () => iframe.evaluate((el: HTMLIFrameElement) => el.contentDocument?.body.textContent ?? ''),
        { timeout: 2_000 },
      ).toContain('Account (edited)')

      const srcAfter = await iframe.getAttribute('src')
      expect(srcAfter).toBe(srcBefore)

      expect(await page.evaluate(() => (window as unknown as { __spec03?: string }).__spec03)).toBe('alive')
      expect(await pin.count()).toBeGreaterThan(0)

      // Give the single expected `files` SSE event a moment to arrive, then stop reading.
      await new Promise((resolve) => setTimeout(resolve, 500))
      await reader?.cancel()
      expect(await filesEventCount).toBe(1)

      const stateAfter = (await (await fetch(`${serveUrl}/__mock-review/state`)).json()) as {
        screens: Array<{ name: string; hash: string }>
      }
      const hashAfter = stateAfter.screens.find((s) => s.name === 'home')?.hash
      expect(hashAfter).not.toBe(hashBefore)
    } finally {
      await page.close()
    }
  }, 30_000)
})
