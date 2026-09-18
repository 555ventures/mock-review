// AC-20260917-02-18 [env: SPEC_PLUGIN_ROOT] [env: SKIP_BROWSER]: the brief's definition of done —
// the real plugin driver reaches journey-approved then approved against the real page, no stub
// anywhere. Continues tests/e2e/driver.test.ts past journey-drawn: the browser approves screens,
// the CLIENT confirms the journey (an If-Match POST on the story hash — no owner journey-approve
// anywhere, D9), picks a theme, then the driver records journey-approved/theme-picked/approved.
// Also covers spec 01's former AC-24 (now D16 of spec 01, moved here): `client open`'s
// serve-dependent behaviour in state CLIENT.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { contractSkew, copyHostInto, linkInstalledBin, registerScratchDir, spawnWithTimeout } from '../helpers/cli.js'
import { startServeIn, stopServe, type Serve } from '../helpers/serve.js'
import { CONTRACT_VERSION } from '../../src/schemas/version.js'

const pluginRoot = process.env.SPEC_PLUGIN_ROOT || path.join(homedir(), 'projects', 'claude-plugins')
const driverScript = path.join(pluginRoot, 'spec', 'scripts', 'mocks-driver.js')
const hasPlugin = existsSync(driverScript)
// D9: this is the second driver-running e2e test D6 missed — same contractSkew helper, same
// pluginRoot-derived template path, reused verbatim (no new mechanism).
const pluginContractTemplate = path.join(pluginRoot, 'spec', 'templates', 'mock', 'contract.json')
const skipBrowser = process.env.SKIP_BROWSER === '1'
const describeIfReady = hasPlugin && !skipBrowser ? describe : describe.skip

// D (env gates): a plain describe.skip here (either gate closed) reads, in a long run, exactly
// like a test that quietly disappeared. Report which gate is closed as its own passing test — no
// AC id in the title (review pass 2, item 2), so an AC-matrix tool never reads this sentinel as
// that AC covered and green on a machine with no plugin checkout or no browser.
it.skipIf(hasPlugin && !skipBrowser)(
  '[env: SPEC_PLUGIN_ROOT] [env: SKIP_BROWSER] this file\'s e2e assertions were NOT run',
  () => {
    if (!hasPlugin) {
      console.warn(`tests/e2e/approved.test.ts: no mocks-driver.js at ${driverScript} — AC-20260917-02-18 skipped, not verified`)
    }
    if (skipBrowser) {
      console.warn('tests/e2e/approved.test.ts: SKIP_BROWSER=1 — AC-20260917-02-18 skipped, not verified')
    }
    expect(hasPlugin && !skipBrowser).toBe(false)
  },
)

function runDriver(scratchRoot: string, args: string[]) {
  return spawnWithTimeout(process.execPath, [driverScript, '--root', scratchRoot, ...args])
}

function statusJson(scratchRoot: string): {
  state?: string
  marks: { seedDone: string | null; shellDrawn: string | null; themePicked: string | null; approved: string | null }
  journeys: Record<string, { drawn: string | null; approved: string | null; beats?: string }>
} {
  return JSON.parse(readFileSync(path.join(scratchRoot, 'design', 'mocks', 'status.json'), 'utf8'))
}

describeIfReady('AC-20260917-02-18: mocks-driver.js reaches journey-approved then approved against the real page [env: SPEC_PLUGIN_ROOT] [env: SKIP_BROWSER]', () => {
  let scratchRoot: string
  let appDir: string
  let serve: Serve | undefined
  let browser: import('playwright').Browser
  // D9: set once in beforeAll, consulted by the it body's own ctx.skip — beforeAll's own context
  // has no `.skip` of its own, so the driver marks below are simply not run when skewed, and the
  // it body is what actually reports the skip with its reason.
  let skewReason: string | null = null

  beforeAll(async () => {
    skewReason = contractSkew(pluginContractTemplate, CONTRACT_VERSION)
    if (skewReason) return

    await ensureFixtures()
    const { chromium } = await import('playwright')
    browser = await chromium.launch()

    scratchRoot = mkdtempSync(path.join(tmpdir(), 'mock-review-e2e-approved-'))
    // Item 3: this file creates its own scratch root directly (not through copyFixtureHost), so
    // it registers it itself for the shared exit-time cleanup rather than leaking it.
    registerScratchDir(scratchRoot)
    appDir = path.join(scratchRoot, 'app')
    copyHostInto(greenHost, appDir)
    linkInstalledBin(appDir)
    mkdirSync(path.join(scratchRoot, 'design', 'mocks'), { recursive: true })
    // D13: the seed's own beats must copy `src/journeys.ts`'s beats verbatim — `--mark
    // journey-drawn`/`--mark journey-approved` compare them beat-for-beat against `check
    // --json`'s steps (mocks-driver.js `findBeatsMismatch`). Replaces the retired
    // ```surfaces``` block (A8/A9).
    writeFileSync(
      path.join(scratchRoot, 'design', 'mocks', 'seed.md'),
      [
        '# Seed — Mock Review Fixture',
        '',
        '## Product',
        '',
        'A tiny wallet app used to prove the mock-review CLI end to end.',
        '',
        '## Records',
        '',
        '- customers',
        '',
        '## Journeys',
        '',
        '### first-visit',
        'a new customer',
        '1. "I open the app" -> home',
        '2. "I land on my account" -> account@default',
        '',
      ].join('\n'),
    )

    expect(runDriver(scratchRoot, ['--mark', 'seed-done']).status).toBe(0)
    expect(runDriver(scratchRoot, ['--mark', 'shell-drawn']).status).toBe(0)
    expect(runDriver(scratchRoot, ['--mark', 'journey-drawn', '--journey', 'first-visit']).status).toBe(0)
  }, 180_000)

  afterAll(async () => {
    await stopServe(serve)
    await browser?.close()
  })

  // AC-20260917-02-18 (D7/D14): v2's real ordering — the driver reaches journey-approved only
  // AFTER the CLIENT's own confirm (an If-Match POST binding the hash `GET state` served), never
  // through an owner journey-approve and never by polling `approvedAt` (D9 removed it as a
  // writer; the driver is forbidden from reading it, mocks-driver.js:40,71).
  it('AC-20260917-02-18: after journey-drawn, screen approvals + client confirm + theme pick let the driver reach journey-approved then approved', async (ctx) => {
    if (skewReason) ctx.skip(skewReason)
    // Confirmed by direct reproduction (20 concurrent `serve` processes sharing
    // mock.config.ts's port 5180) that Vite's own port-fallback + resolvedUrls already isolates
    // every server correctly — no cross-talk. Under the full gate (many Chromium instances +
    // Vite dev servers running concurrently across both vitest projects), a state-changing
    // action's UI update can lag well past vitest's ~1s default poll window even though this
    // test's own 180s budget has plenty of room, so every poll below is given an explicit,
    // generous window.
    const SLOW_POLL = { timeout: 20_000 }
    serve = await startServeIn(appDir)
    const page = await browser.newPage()
    try {
      for (const screen of ['home', 'account']) {
        await page.goto(`${serve.url}/#/${screen}`, { waitUntil: 'networkidle' })
        const approveScreenButton = page.getByRole('button', { name: 'Approve screen' })
        await expect.poll(() => approveScreenButton.count(), SLOW_POLL).toBeGreaterThan(0)
        await approveScreenButton.click()
        await page.getByRole('button', { name: 'Approve', exact: true }).click()
        await expect.poll(() => {
          const approval = JSON.parse(readFileSync(path.join(appDir, 'design', 'approval.json'), 'utf8')) as {
            screens: Record<string, { approvedAt: string | null }>
          }
          return approval.screens[screen]?.approvedAt
        }, SLOW_POLL).not.toBeNull()
      }

      // The CLIENT's own confirm — a real POST clientOk carrying the hash `GET state` served,
      // driven through the page exactly as a real client would (JourneyPanel's client-role
      // "Confirm journey" control, spec 01's already-shipped trigger). No owner journey-approve
      // anywhere in this flow (D9 removed the op).
      //
      // The client role is STICKY: `roleOf` (src/server/plugin.ts) sets an HttpOnly
      // `mock-review-client` cookie on any `?client=<token>` request and thereafter returns
      // `client` from that cookie alone, regardless of URL. Doing the confirm in its own
      // Playwright browser context (a fresh cookie jar, closed right after) keeps the main
      // `page`'s context genuinely owner-role for every step before and after — reusing `page`
      // for the confirm would leave it permanently client-role for the rest of this test (the
      // owner-only theme Select would then never render).
      const clientContext = await browser.newContext()
      try {
        const clientPage = await clientContext.newPage()
        await clientPage.goto(`${serve.url}/?client=replace-me#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })
        const confirmJourneyButton = clientPage.getByRole('button', { name: 'Confirm journey' })
        await expect.poll(() => confirmJourneyButton.count(), SLOW_POLL).toBeGreaterThan(0)
        await confirmJourneyButton.click()
        await clientPage.getByRole('button', { name: 'Confirm', exact: true }).click()

        // `--mark journey-approved` below reads approval.json straight off disk — wait for the
        // client's own write to land before leaving this context, rather than racing it.
        await expect.poll(() => {
          const approval = JSON.parse(readFileSync(path.join(appDir, 'design', 'approval.json'), 'utf8')) as {
            journeys: Record<string, { client: string | null; beats?: string }>
          }
          return approval.journeys['first-visit']?.client
        }, SLOW_POLL).toBe('ok')
      } finally {
        await clientContext.close()
      }

      // Never polls `approvedAt` (D9/AC-18: the driver is forbidden from reading that key) —
      // the poll above, inside the client's own context, is the one witness this flow needs.
      const approvedJourney = runDriver(scratchRoot, ['--mark', 'journey-approved', '--journey', 'first-visit'])
      expect(approvedJourney.status).toBe(0)
      expect(statusJson(scratchRoot).journeys['first-visit']?.approved).toBeTruthy()

      // status.json's own stored beats must equal the beats written to approval.json by the
      // client's confirm — the exact witness AC-18 requires.
      const approvalOnDisk = JSON.parse(readFileSync(path.join(appDir, 'design', 'approval.json'), 'utf8')) as {
        journeys: Record<string, { beats?: string }>
      }
      expect(statusJson(scratchRoot).journeys['first-visit']?.beats).toBe(approvalOnDisk.journeys['first-visit']?.beats)

      // The theme pick, on `page` — which never visited a `?client=` URL and so stayed
      // genuinely owner-role throughout (the client confirm above ran in its own, now-closed
      // browser context) — the theme Select is owner-only. Same selector as the passing
      // tests/browser/surfaces.test.ts:333 case, with no text fallback: a missing control must
      // fail here, at the control, not 20s later at the approval.json poll below.
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })
      const themeSelect = page.getByRole('combobox', { name: /Theme/i })
      await expect.poll(() => themeSelect.count(), SLOW_POLL).toBeGreaterThan(0)
      await themeSelect.first().click()
      await page.getByRole('option', { name: 'nova' }).click()

      // The theme pick is a PATCH /approval round trip (client click -> POST -> write
      // approval.json -> return); the driver's `--mark theme-picked` reads approval.json
      // straight off disk (readApprovalRaw in mocks-driver.js) and refuses with "approval.theme
      // is missing" if run before that write lands, so wait for it explicitly rather than racing
      // the click against the driver invocation below.
      await expect.poll(() => {
        const approval = JSON.parse(readFileSync(path.join(appDir, 'design', 'approval.json'), 'utf8')) as { theme: string | null }
        return approval.theme
      }, SLOW_POLL).toBe('nova')

      const configPath = path.join(appDir, 'mock.config.ts')
      const config = readFileSync(configPath, 'utf8')
      writeFileSync(configPath, config.replace('theme: null', "theme: 'nova'"))

      const themePicked = runDriver(scratchRoot, ['--mark', 'theme-picked'])
      expect(themePicked.status).toBe(0)
      expect(statusJson(scratchRoot).marks.themePicked).toBeTruthy()

      // In CLIENT (theme-picked done, approved not yet): client open prints the served URL...
      const clientOpenServing = runDriver(scratchRoot, ['client', 'open'])
      expect(clientOpenServing.status).toBe(0)
      expect(clientOpenServing.stdout.trim()).toBe(`${serve.url}/?client=replace-me`)

      // ...and exits 2 with the serve remedy once serve is stopped (spec 01's former AC-24,
      // moved here by spec 01 D16) — checked here, still in state CLIENT, before the final
      // approve mark moves state to APPROVED.
      await stopServe(serve)
      const clientOpenStopped = runDriver(scratchRoot, ['client', 'open'])
      expect(clientOpenStopped.status).toBe(2)
      expect(clientOpenStopped.stderr).toContain('remedy: npx mock-review serve')

      serve = await startServeIn(appDir)

      const approved = runDriver(scratchRoot, ['--mark', 'approved'])
      expect(approved.status).toBe(0)
      expect(statusJson(scratchRoot).marks.approved).toBeTruthy()
    } finally {
      await page.close()
    }
  }, 180_000)
})
