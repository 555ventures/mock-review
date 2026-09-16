// AC-20260915-02-21 [env: SPEC_PLUGIN_ROOT] [env: SKIP_BROWSER]: the brief's definition of done —
// the real plugin driver reaches APPROVED against the real page, no stub anywhere. Continues
// spec 01's tests/e2e/driver.test.ts past journey-drawn: the browser approves screens, approves
// the journey, picks a theme, confirms as the client, then the driver records
// journey-approved/theme-picked/approved. Also covers spec 01's former AC-24 (now D16 of spec 01,
// moved here): `client open`'s serve-dependent behaviour in state CLIENT.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyHostInto, linkInstalledBin, registerScratchDir, spawnWithTimeout } from '../helpers/cli.js'
import { startServeIn, stopServe, type Serve } from '../helpers/serve.js'

const pluginRoot = process.env.SPEC_PLUGIN_ROOT || path.join(homedir(), 'projects', 'claude-plugins')
const driverScript = path.join(pluginRoot, 'spec', 'scripts', 'mocks-driver.js')
const hasPlugin = existsSync(driverScript)
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
      console.warn(`tests/e2e/approved.test.ts: no mocks-driver.js at ${driverScript} — AC-20260915-02-21 skipped, not verified`)
    }
    if (skipBrowser) {
      console.warn('tests/e2e/approved.test.ts: SKIP_BROWSER=1 — AC-20260915-02-21 skipped, not verified')
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
  journeys: Record<string, { drawn: string | null; approved: string | null }>
} {
  return JSON.parse(readFileSync(path.join(scratchRoot, 'design', 'mocks', 'status.json'), 'utf8'))
}

describeIfReady('AC-20260915-02-21: mocks-driver.js reaches APPROVED against the real page [env: SPEC_PLUGIN_ROOT] [env: SKIP_BROWSER]', () => {
  let scratchRoot: string
  let appDir: string
  let serve: Serve | undefined
  let browser: import('playwright').Browser

  beforeAll(async () => {
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
        'A new customer opens the app, checks their wallet, and goes to their account.',
        '```surfaces',
        'Home',
        'Home -> Account',
        '```',
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

  it('AC-20260915-03-11: after journey-drawn, browser approvals + theme pick + client confirm let the driver reach APPROVED', async () => {
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
        // `--mark journey-approved` below reads approval.json straight off disk and requires
        // every step screen's approval.screens[name].approvedAt to already be there — wait for
        // the PATCH /approval round trip to land rather than racing it.
        await expect.poll(() => {
          const approval = JSON.parse(readFileSync(path.join(appDir, 'design', 'approval.json'), 'utf8')) as {
            screens: Record<string, { approvedAt: string | null }>
          }
          return approval.screens[screen]?.approvedAt
        }, SLOW_POLL).not.toBeNull()
      }

      // JourneyPanel.tsx's owner-role trigger is a plain `Approve` button (not "Approve
      // journey" — confirmed by reading src/ui/journeys/JourneyPanel.tsx and reproducing
      // against a live page: `getByRole('button', {name: /Approve journey/i})` never matches
      // anything, which is what was actually timing out here, not a load/timing issue). The
      // trigger and the dialog's own confirm action share the same accessible name ("Approve"),
      // so each click is scoped to its own container rather than reusing one ambiguous locator:
      // the trigger lives in JourneyPanel's own right-hand panel (`.border-l.bg-sidebar`, the
      // journey-mode counterpart of NotesPanel's `w-80` sidebar), the confirm action lives in the
      // AlertDialog titled "Approve {journey title}?" (seed.md's fixture journey title is "First
      // visit" — tests/e2e/approved.test.ts's own seed.md above).
      await page.goto(`${serve.url}/#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })
      const journeyPanel = page.locator('.border-l.bg-sidebar')
      const approveJourneyTrigger = journeyPanel.getByRole('button', { name: 'Approve', exact: true })
      await expect.poll(() => approveJourneyTrigger.count(), SLOW_POLL).toBeGreaterThan(0)
      await approveJourneyTrigger.click()
      const approveJourneyDialog = page.getByRole('alertdialog', { name: 'Approve First visit?' })
      await expect.poll(() => approveJourneyDialog.isVisible(), SLOW_POLL).toBe(true)
      await approveJourneyDialog.getByRole('button', { name: 'Approve', exact: true }).click()

      // Same disk-write race as the screen approvals above: `--mark journey-approved` reads
      // approval.journeys['first-visit'].approvedAt straight off disk.
      await expect.poll(() => {
        const approval = JSON.parse(readFileSync(path.join(appDir, 'design', 'approval.json'), 'utf8')) as {
          journeys: Record<string, { approvedAt: string | null }>
        }
        return approval.journeys['first-visit']?.approvedAt
      }, SLOW_POLL).not.toBeNull()

      const approvedJourney = runDriver(scratchRoot, ['--mark', 'journey-approved', '--journey', 'first-visit'])
      expect(approvedJourney.status).toBe(0)
      expect(statusJson(scratchRoot).journeys['first-visit']?.approved).toBeTruthy()

      const themeSelect = page.getByRole('combobox', { name: /Theme/i }).or(page.getByText('Theme', { exact: true }))
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
      await page.goto(`${serve.url}/?client=replace-me#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })
      const confirmButton = page.getByRole('button', { name: 'Confirm journey' })
      await expect.poll(() => confirmButton.count(), SLOW_POLL).toBeGreaterThan(0)
      await confirmButton.click()
      await page.getByRole('button', { name: 'Confirm', exact: true }).click()

      // Same disk-write race again: `--mark approved` reads
      // approval.journeys['first-visit'].client straight off disk.
      await expect.poll(() => {
        const approval = JSON.parse(readFileSync(path.join(appDir, 'design', 'approval.json'), 'utf8')) as {
          journeys: Record<string, { client: string | null }>
        }
        return approval.journeys['first-visit']?.client
      }, SLOW_POLL).toBe('ok')

      const approved = runDriver(scratchRoot, ['--mark', 'approved'])
      expect(approved.status).toBe(0)
      expect(statusJson(scratchRoot).marks.approved).toBeTruthy()
    } finally {
      await page.close()
    }
  }, 180_000)
})
