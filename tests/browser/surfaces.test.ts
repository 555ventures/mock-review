// AC-20260915-02-1, -2, -15, -16 [env: SKIP_BROWSER]: reference §1/§2/§9/§11 surfaces, D10's
// theme pick, D11's client role. Playwright is a devDependency added by a later wave (D13); it
// is only ever imported dynamically, inside this skipIf-gated describe, so SKIP_BROWSER=1 (or a
// tree with no `playwright` yet) never breaks collection of this file. Only vitest's own
// `expect` is used (no `@playwright/test` per D13's "plain playwright"), so assertions on
// visibility/text/enabled state poll a plain Playwright locator method rather than using
// Playwright's web-first matchers.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost } from '../helpers/cli.js'
import { startServe, startServeIn, stopServe, type Serve } from '../helpers/serve.js'
import type { Locator, Page } from 'playwright'

async function textOf(locator: Locator): Promise<string> {
  return (await locator.first().textContent()) ?? ''
}

// AC-20260915-04-4/-5/-6/-8 (D1/D5/D6): the journey ring is drawn in the reviewer document, a
// sibling of the iframe inside the scaled wrapper — never written into the frame's own document
// (D1). `ringGeometry` reads both documents from the outside (never mutating either) and reports,
// per iframe/wrapper pair: how many `[data-journey-ring]` elements sit in that wrapper, and (when
// exactly one is present) how far its rect is from the control's frame-local rect mapped through
// the wrapper's own scale (AC-4's formula: `iframeRect.left + ctl.left * scale`, `scale =
// wrapper.getBoundingClientRect().width / wrapper.offsetWidth`).
type RingGeometry = {
  count: number
  deltaLeft: number
  deltaTop: number
  deltaWidth: number
  deltaHeight: number
  journeyAttrsInFrame: number
  dataJourneyTargetInFrame: number
}

async function ringGeometry(page: Page, label = 'Account'): Promise<RingGeometry[]> {
  return page.evaluate((lbl) => {
    const iframes = Array.from(document.querySelectorAll('iframe'))
    return iframes.map((iframe) => {
      const wrapper = iframe.parentElement as HTMLElement
      const rings = wrapper.querySelectorAll('[data-journey-ring]')
      const doc = iframe.contentDocument
      let journeyAttrsInFrame = 0
      let dataJourneyTargetInFrame = 0
      if (doc) {
        for (const el of Array.from(doc.querySelectorAll('*'))) {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.includes('journey')) journeyAttrsInFrame++
          }
        }
        dataJourneyTargetInFrame = doc.querySelectorAll('[data-journey-target]').length
      }
      if (rings.length !== 1) {
        return {
          count: rings.length,
          deltaLeft: Infinity,
          deltaTop: Infinity,
          deltaWidth: Infinity,
          deltaHeight: Infinity,
          journeyAttrsInFrame,
          dataJourneyTargetInFrame,
        }
      }
      const ring = rings[0] as HTMLElement
      const ctlEl = doc?.querySelector(`[data-to="${lbl}"]`) as HTMLElement | null | undefined
      if (!ctlEl) {
        return {
          count: rings.length,
          deltaLeft: Infinity,
          deltaTop: Infinity,
          deltaWidth: Infinity,
          deltaHeight: Infinity,
          journeyAttrsInFrame,
          dataJourneyTargetInFrame,
        }
      }
      const iframeRect = iframe.getBoundingClientRect()
      const wrapperRect = wrapper.getBoundingClientRect()
      const scale = wrapperRect.width / wrapper.offsetWidth
      const ctl = ctlEl.getBoundingClientRect()
      const expected = {
        left: iframeRect.left + ctl.left * scale,
        top: iframeRect.top + ctl.top * scale,
        width: ctl.width * scale,
        height: ctl.height * scale,
      }
      const actual = ring.getBoundingClientRect()
      return {
        count: rings.length,
        deltaLeft: Math.abs(actual.left - expected.left),
        deltaTop: Math.abs(actual.top - expected.top),
        deltaWidth: Math.abs(actual.width - expected.width),
        deltaHeight: Math.abs(actual.height - expected.height),
        journeyAttrsInFrame,
        dataJourneyTargetInFrame,
      }
    })
  }, label)
}

function expectRingWithinOnePx(g: RingGeometry): void {
  expect(g.count).toBe(1)
  expect(g.deltaLeft).toBeLessThanOrEqual(1)
  expect(g.deltaTop).toBeLessThanOrEqual(1)
  expect(g.deltaWidth).toBeLessThanOrEqual(1)
  expect(g.deltaHeight).toBeLessThanOrEqual(1)
}

// Confirmed by direct reproduction (20 concurrent `serve` processes sharing mock.config.ts's
// port 5180): Vite's own port-fallback + resolvedUrls already isolates every server correctly —
// no cross-talk. The gate's real failure mode is CPU contention: the full suite runs many
// Chromium instances + Vite dev servers concurrently across both vitest projects, and a
// POST-then-refetch-then-rerender round trip that's fast in isolation can take several seconds
// under that load. Every poll following a state-changing action gets this generous, explicit
// window rather than vitest's ~1s default.
const SLOW_POLL = { timeout: 20_000 }

// D (env gates): `SKIP_BROWSER=1` removes every assertion below via `describe.skipIf` — vitest's
// own "skipped" reporter line is easy to miss in a long run, so this reports itself loudly, as
// its own passing test with a title that says exactly what happened, whenever the gate is closed.
// The title deliberately carries no AC id (review pass 2, item 2): an AC-matrix tool that reads
// test titles must never read this sentinel as that AC being covered and green on a machine with
// no browser — only a real assertion earns an AC id in its title.
it.skipIf(process.env.SKIP_BROWSER !== '1')(
  '[env: SKIP_BROWSER] this file\'s browser assertions were NOT run: SKIP_BROWSER=1 skipped them all',
  () => {
    console.warn('tests/browser/surfaces.test.ts: SKIP_BROWSER=1 — AC-20260915-02-1/-2/-15/-16 assertions were skipped, not verified')
    expect(process.env.SKIP_BROWSER).toBe('1')
  },
)

describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-02-1/-2/-15/-16: reviewer page surfaces [env: SKIP_BROWSER]', () => {
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

  const stop = async () => {
    await stopServe(serve)
    serve = undefined
  }

  it('AC-20260915-02-1: #/home renders the sidebar, top bar, and right notes panel per reference §1/§2/§5', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

      expect(await page.getByRole('tab', { name: 'Journeys' }).count()).toBeGreaterThan(0)
      expect(await page.getByRole('tab', { name: 'Screens' }).count()).toBeGreaterThan(0)

      await expect.poll(() => page.locator('[data-slot="sidebar-menu-badge"]').count(), SLOW_POLL).toBeGreaterThan(0)

      // The device switcher is a `ToggleGroup type="single"` — Radix's stock single-select
      // semantics, `role="radiogroup"` over `role="radio"` items (not `role="button"`, which
      // would be a fabricated override the rules forbid: shadcn parts are composed as the
      // official example, never reshaped).
      expect(await page.getByRole('radio', { name: 'Desktop' }).count()).toBeGreaterThan(0)
      expect(await page.getByRole('radio', { name: 'Mobile' }).count()).toBeGreaterThan(0)
      expect(await page.getByRole('radio', { name: 'Both' }).count()).toBeGreaterThan(0)

      const markToggle = page.getByRole('button', { name: 'Mark an area' })
      expect(await markToggle.count()).toBeGreaterThan(0)
      expect(await textOf(markToggle)).toContain('M')

      const notesToggle = page.getByRole('button', { name: /Notes/ })
      expect(await notesToggle.count()).toBeGreaterThan(0)

      const rightSidebar = page.locator('[data-slot="sidebar"][data-side="right"]')
      await expect.poll(() => rightSidebar.count(), SLOW_POLL).toBeGreaterThan(0)
      const width: string = await rightSidebar.first().evaluate((el: Element) => getComputedStyle(el).width)
      expect(width).toBe('320px')
      expect(await page.getByText('THIS SCREEN', { exact: false }).count()).toBeGreaterThan(0)
      expect(await page.getByText('PROJECT', { exact: false }).count()).toBeGreaterThan(0)
      expect(await page.getByRole('button', { name: /\+ Note|Note/ }).count()).toBeGreaterThan(1)

      expect(await page.getByText('Desktop 1280').count()).toBeGreaterThan(0)
      const iframeSrc = await page.locator('iframe').first().getAttribute('src')
      expect(iframeSrc?.startsWith('/?frame=1#/home')).toBe(true)

      // AC-1: the top bar's state-switcher breadcrumb (reference §2) — a DropdownMenuTrigger
      // showing the current state label ("Default", D21's example-key casing), which opens the
      // per-state menu.
      const header = page.locator('header')
      const stateSwitcher = header.getByRole('button', { name: 'Default' })
      expect(await stateSwitcher.count()).toBeGreaterThan(0)

      // AC-1: the device frame is a Card-framed iframe (reference §3: shadcn `Card`, `data-slot`
      // per the official registry), not a bare iframe dropped in the workspace.
      const card = page.locator('[data-slot="card"]').filter({ has: page.locator('iframe') })
      expect(await card.count()).toBeGreaterThan(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260915-02-2: command palette, marking overlay, new-note dialog, and the unknown-screen fallback', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

      await page.keyboard.press('Control+k')
      // shadcn's CommandDialog renders `title="Search"` (design-reference.md §9), a real
      // `role="dialog"` labelled by that title — scope the group lookup there, since the left
      // sidebar's own Tabs ("Screens"/"Journeys" triggers, §1) sit behind the palette overlay and
      // would otherwise satisfy `getByText('Screens'|'Journeys', {exact:true})` even when the
      // palette never opened.
      const palette = page.getByRole('dialog', { name: 'Search' })
      await expect.poll(() => palette.isVisible(), SLOW_POLL).toBe(true)
      await expect.poll(() => palette.getByPlaceholder('Search screens, states, journeys…').isVisible(), SLOW_POLL).toBe(true)
      for (const group of ['Screens', 'Journeys', 'Components', 'Actions']) {
        expect(await palette.getByText(group, { exact: true }).count()).toBeGreaterThan(0)
      }
      await page.keyboard.press('Escape')

      await page.keyboard.press('m')
      await expect.poll(() => page.locator('.cursor-crosshair').count(), SLOW_POLL).toBeGreaterThan(0)

      const frame = page.locator('iframe').first()
      const box = await frame.boundingBox()
      if (!box) throw new Error('frame has no bounding box')
      const startX = box.x + 20
      const startY = box.y + 20
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + 60, startY + 40, { steps: 5 })
      await page.mouse.up()

      const dialog = page.getByRole('dialog', { name: /New note/i })
      await expect.poll(() => dialog.isVisible(), SLOW_POLL).toBe(true)
      expect(await textOf(dialog)).toContain('Home – Default · desktop')
      const saveButton = dialog.getByRole('button', { name: 'Save' })
      await expect.poll(() => saveButton.isDisabled(), SLOW_POLL).toBe(true)
      await dialog.getByRole('textbox').fill('Make the balance bigger')
      await expect.poll(() => saveButton.isDisabled(), SLOW_POLL).toBe(false)
      await page.keyboard.press('Escape')

      await page.goto(`${serve.url}/#/nope`, { waitUntil: 'networkidle' })
      await expect.poll(() => page.getByText('No screen "nope" in this prototype.').isVisible(), SLOW_POLL).toBe(true)
      expect(await page.getByRole('link', { name: 'Home' }).count()).toBeGreaterThan(0)
      expect(await page.getByRole('link', { name: 'Account' }).count()).toBeGreaterThan(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  // Escaped from spec 02's review: the port folded pins, draft and the marking surface into one
  // `Overlay` and gated the whole thing on `showNotes`, so "Mark an area" became a no-op with the
  // Notes panel hidden. The prototype gates only the pins (`ReviewLayer.tsx:212` vs `:234`/`:241`),
  // and reference rule 26 ties pins to `showNotes` but mark mode to `marking` alone. Steps 5-6 pin
  // that split: marking works with the panel hidden, and the saved note's pin stays hidden until
  // the panel is shown again — the panel must NOT open on commit.
  it('AC-20260915-02-2 (escape, reference §4 / rule 26): with the Notes panel hidden, M mounts the crosshair overlay, a drag opens the New note dialog, and the saved pin stays hidden until the panel is shown', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

      const notesToggle = page.getByRole('button', { name: /Notes/ })
      await expect.poll(() => notesToggle.count(), SLOW_POLL).toBeGreaterThan(0)
      await notesToggle.click()
      await expect.poll(() => page.locator('[data-notes-scroll]').count(), SLOW_POLL).toBe(0)

      await page.keyboard.press('m')
      await expect.poll(() => page.locator('.cursor-crosshair').count(), SLOW_POLL).toBeGreaterThan(0)

      const frame = page.locator('iframe').first()
      const box = await frame.boundingBox()
      if (!box) throw new Error('frame has no bounding box')
      const startX = box.x + 20
      const startY = box.y + 20
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + 60, startY + 40, { steps: 5 })
      await page.mouse.up()

      const dialog = page.getByRole('dialog', { name: /New note/i })
      await expect.poll(() => dialog.isVisible(), SLOW_POLL).toBe(true)
      await dialog.getByRole('textbox').fill('Marked with the panel hidden')
      await dialog.getByRole('button', { name: 'Save' }).click()

      const notesPath = path.join(serve.host, 'design', 'notes.json')
      await expect
        .poll(() => {
          try {
            return (JSON.parse(readFileSync(notesPath, 'utf8')) as { notes: { text?: string }[] }).notes.length
          } catch {
            return 0
          }
        }, SLOW_POLL)
        .toBeGreaterThan(0)

      // The pin is not in the accessibility tree behind a closed panel — locate it by attribute
      // (gotcha AC-20260915-02-19), and assert the panel did not open itself on commit.
      expect(await page.locator('[data-note]').count()).toBe(0)
      expect(await page.locator('[data-notes-scroll]').count()).toBe(0)

      await notesToggle.click()
      await expect.poll(() => page.locator('[data-note]').count(), SLOW_POLL).toBeGreaterThan(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260915-02-1: view/side-tab prefs persist across a reload (sessionStorage, rule 31)', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

      await page.locator('[aria-label="Both"]').click()
      await expect.poll(() => page.getByText('Mobile 360').count(), SLOW_POLL).toBeGreaterThan(0)

      await page.reload({ waitUntil: 'networkidle' })
      await expect.poll(() => page.getByText('Mobile 360').count(), SLOW_POLL).toBeGreaterThan(0)
      expect(await page.getByText('Desktop 1280').count()).toBeGreaterThan(0)

      await page.getByRole('tab', { name: 'Screens' }).click()
      await expect.poll(() => page.getByRole('tab', { name: 'Screens', selected: true }).count(), SLOW_POLL).toBeGreaterThan(0)

      await page.reload({ waitUntil: 'networkidle' })
      await expect.poll(() => page.getByRole('tab', { name: 'Screens', selected: true }).count(), SLOW_POLL).toBeGreaterThan(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it("AC-20260915-02-1 (D4/D21's guide) / AC-20260915-04-9: a guided click on [data-to] advances the frame and keeps the journey and step in the hash", async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })

      const frame = page.locator('iframe').first()
      await expect.poll(() =>
        frame.evaluate((el: HTMLIFrameElement) => !!el.contentDocument?.querySelector('[data-to="Account"]')),
      SLOW_POLL).toBe(true)

      await frame.evaluate((el: HTMLIFrameElement) => {
        el.contentDocument?.querySelector<HTMLElement>('[data-to="Account"]')?.click()
      })

      await expect.poll(() => page.evaluate(() => location.hash.startsWith('#/account')), SLOW_POLL).toBe(true)
      const hash = await page.evaluate(() => location.hash)
      // D4/D21: the guide's own click handler builds the next hash from the journey step it
      // advances to, not a bare screen/state href — `j=` and the advanced `step=` must survive.
      expect(hash).toContain('j=first-visit')
      expect(hash).toContain('step=1')
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  // AC-20260917-03-18 (D9): an untouched journey (no `notes.journeys` entry — the default state
  // of a fresh serve, since `design/notes.json` never ships committed, D9's own build gotcha)
  // renders no status line in its own panel and no dot in the sidebar, matching each other exactly.
  // Before D9, ScreenPage routed the journey's tone through `journeyTone`, which itself defaulted
  // an untouched journey to `answered` — so the panel showed an actionable Approve button while
  // the sidebar (already null-guarded by D5 in this same spec) showed nothing at all.
  it('AC-20260917-03-18: an untouched journey (no conversation entry) shows no Approve control in its panel and no dot in the sidebar', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })

      // The journey panel replaces the notes list while a journey is active (reference §8.1) —
      // wait for its Reply control to confirm it has actually mounted before asserting Approve's
      // absence (an absence check performed too early would pass for the wrong reason).
      const replyButton = page.getByRole('button', { name: 'Reply' })
      await expect.poll(() => replyButton.count(), SLOW_POLL).toBeGreaterThan(0)
      expect(await page.getByRole('button', { name: 'Approve' }).count()).toBe(0)

      // The sidebar's own per-journey badge (Journeys tab, the default side-tab) renders no colour
      // dot at all for this same untouched journey.
      const journeyItem = page
        .locator('li[data-slot="sidebar-menu-item"]')
        .filter({ has: page.getByRole('link', { name: 'First visit', exact: true }) })
      const badge = journeyItem.locator('[data-slot="sidebar-menu-badge"]')
      await expect.poll(() => badge.count(), SLOW_POLL).toBeGreaterThan(0)
      expect(await badge.locator('span.rounded-full').count()).toBe(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it("AC-20260915-02-1/-6 (D21): the state switcher and the frame src both carry the example-key casing (Default), not meta.states' raw case", async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })
      const iframeSrc = await page.locator('iframe').first().getAttribute('src')
      expect(iframeSrc).toContain('state=Default')
      expect(iframeSrc).not.toContain('state=default')

      const header = page.locator('header')
      expect(await header.getByRole('button', { name: 'Default' }).count()).toBeGreaterThan(0)
      expect(await header.getByText('default', { exact: true }).count()).toBe(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  // AC-20260918-03-5 (D5, rewrites AC-20260915-03-10): the theme Select is retired outright — no
  // host, themed or not, renders one. The theme is whatever `mock.config.ts` declares; the fixture
  // ships `theme: null` (tests/fixtures/host/mock.config.ts:11) and `src/themes/nova.css` exists,
  // so this test edits the SCRATCH host's config to `theme: 'nova'` before `startServeIn` —
  // anchored on the parsed literal `theme: null`, never on source text generally (pipeline rules §
  // Gotchas / AC-20260917-02-20's citation) — and asserts the frame requests `nova.css` with no UI
  // control ever driving that choice.
  it('AC-20260918-03-5: no theme Select renders, and the mock frame requests the stylesheet mock.config.ts declares', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-themed-config-')
    const configPath = path.join(host, 'mock.config.ts')
    const config = readFileSync(configPath, 'utf8')
    const themedConfig = config.replace('theme: null', "theme: 'nova'")
    if (themedConfig === config) {
      throw new Error(`could not find "theme: null" in ${configPath}`)
    }
    writeFileSync(configPath, themedConfig)

    serve = await startServeIn(host)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

      expect(await page.getByRole('combobox', { name: /Theme/i }).count()).toBe(0)

      await expect.poll(async () => {
        const hrefs = await page.locator('iframe').first().evaluate((el: HTMLIFrameElement) => {
          const doc = el.contentDocument
          return Array.from(doc?.querySelectorAll('link[rel="stylesheet"]') ?? []).map((l) => l.getAttribute('href'))
        })
        return hrefs.some((h: string | null) => h?.includes('themes/nova.css'))
      }, SLOW_POLL).toBe(true)

      // D5: the Components page's own preview iframes (catalog/Preview.tsx) carry the declared
      // theme too — `data?.config.theme`, not `data?.approval.theme`. A hash-only change on an
      // already-loaded page is a same-document navigation, not a real page load — `page.goto`
      // with `waitUntil: 'networkidle'` here hangs for the full timeout because the app's own
      // long-lived SSE connection (`EventSource('/__mock-review/events')`, open for the page's
      // whole lifetime) never lets the network go idle, and no new "load" ever fires for
      // Playwright to resolve against. Driving the hash change directly (as a real in-app link
      // click would) and polling for the result avoids relying on a navigation lifecycle event a
      // client-side router's hash change was never going to produce. ComponentsPage only mounts a
      // `Preview` (and its iframe) once a component is selected (`?c=<name>`) — the bare list has
      // none.
      await page.evaluate(() => {
        location.hash = '#/components?c=WalletSummary'
      })
      const previewFrame = page.locator('iframe').first()
      await expect.poll(() => previewFrame.count(), SLOW_POLL).toBeGreaterThan(0)
      await expect.poll(async () => (await previewFrame.getAttribute('src')) ?? '', SLOW_POLL).toContain('_theme=nova')
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260915-02-15 (unaffected by D5): a host with no src/themes/*.css renders no theme control', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-nothemes-')
    rmSync(path.join(host, 'src', 'themes'), { recursive: true, force: true })
    serve = await startServeIn(host)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })
      expect(await page.getByRole('combobox', { name: /Theme/i }).count()).toBe(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  // AC-20260918-03-4 (D4): the owner sees no control that approves a screen anywhere on the
  // page — neither a button whose accessible name matches /Approve screen/i, nor the status line
  // NotesPanel's header used to render above the notes list. `home` starts with no
  // `approval.screens` entry and no notes, exactly the state the pre-image control was reachable
  // from (AC-20260917-03-21's own pre-image fixture) — the strongest case for the control's
  // absence, since a screen with a note would already hide it for an unrelated reason.
  it('AC-20260918-03-4: the reviewer page renders no Approve-screen control and no status line above the notes list', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

      const rightSidebar = page.locator('[data-slot="sidebar"][data-side="right"]')
      const header = rightSidebar.locator('[data-slot="sidebar-header"]')
      await expect.poll(() => header.count(), SLOW_POLL).toBeGreaterThan(0)

      expect(await page.getByRole('button', { name: /Approve screen/i }).count()).toBe(0)
      // The pre-image status line rendered a colour dot (span.rounded-full) directly in this
      // header, above the notes list, independent of any sidebar screen/journey dot elsewhere on
      // the page (those are scoped to the LEFT sidebar and are unaffected by D4).
      expect(await header.locator('span.rounded-full').count()).toBe(0)

      // Same absence on a second screen, so this isn't merely "home happens to have nothing to
      // approve".
      await page.goto(`${serve.url}/#/account`, { waitUntil: 'networkidle' })
      await expect.poll(() => header.count(), SLOW_POLL).toBeGreaterThan(0)
      expect(await page.getByRole('button', { name: /Approve screen/i }).count()).toBe(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  // Every write refusal used to be an unhandled rejection: `api.ts` threw, `useNoteActions` never
  // caught, and every caller is `void actions.x()` — so the server's human sentence was discarded
  // and the control looked dead. A client replying on a note is the highest-traffic instance: the
  // op-level gate answers 403 and the reply textarea clears, losing what they typed. The reply
  // itself still needs a server-side `reply` op (staged separately); this pins that the refusal is
  // now *visible*, and that a write 403 does NOT blank the page the way a dead token does.
  // Gate repair (spec 02, 2026-09-18): this test used to produce its 403 by having a client
  // Reply to a note (`op:'update'` under the pre-image). D1/D2 make a client reply `op:'reply'`,
  // which the server now ADMITS (200) — see
  // specs/20260918/02-one-reply-and-the-page-ends-a-note.deviations.md. `op:'update'` is still
  // UNCONDITIONALLY refused for a client role — `clientNotesOpPatch` (src/server/plugin.ts)
  // returns `null` for it regardless of ownership, D2's own point being that only `add`/`reply`/
  // `close` get an entry point at all. The one client-reachable UI path that still sends
  // `op:'update'` is Re-anchor, offered on a note whose anchor `snippet` no longer matches the
  // DOM (reference rule 12) — this seeds exactly that note directly, then re-anchors it over
  // WalletSummary using the same on-screen-to-document scale conversion as
  // AC-20260915-02-18/-19 in tests/browser/roundtrip.test.ts.
  it('AC-20260917-02-20 (escape): a write the server refuses shows one notice instead of failing silently, and does not replace the page with the dead-link notice', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const notesPath = path.join(serveHost, 'design', 'notes.json')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.dirname(notesPath), { recursive: true })
    // `snippet` deliberately does not appear anywhere in WalletSummary's rendered text
    // ("{currency} {balance.toFixed(2)}" -> "USD 128.50", tests/fixtures/host's WalletSummary) —
    // `anchorEl` (src/ui/notes/anchor.ts) then resolves the element by component+key but reports
    // no box for it (rule 12), which is exactly what makes the card offer Re-anchor.
    writeFileSync(
      notesPath,
      JSON.stringify({
        contractVersion: 3,
        notes: [
          {
            id: 'N001',
            screen: 'home',
            state: 'Default',
            component: 'WalletSummary',
            key: '0',
            snippet: 'this snippet no longer matches anything on screen',
            status: 'open',
            thread: [{ by: 'client', text: 'change this' }],
          },
        ],
        journeys: {},
      }),
    )

    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/?client=replace-me#/home`, { waitUntil: 'networkidle' })

      // The pin itself does not render for an outdated note (rule 12: no pin, not a stale one) —
      // open the note through its panel row instead (NoteRow sets `data-row={id}`).
      const row = page.locator('button[data-row="N001"]')
      await expect.poll(() => row.count(), SLOW_POLL).toBeGreaterThan(0)
      await row.first().click()

      const card = page.getByRole('dialog')
      await expect.poll(() => card.isVisible(), SLOW_POLL).toBe(true)
      const reanchorButton = card.getByRole('button', { name: 'Re-anchor' })
      await expect.poll(() => reanchorButton.count(), SLOW_POLL).toBeGreaterThan(0)
      await reanchorButton.click()

      // Draw a new anchor over WalletSummary — same geometry conversion as
      // AC-20260915-02-18 (tests/browser/roundtrip.test.ts): the frame is CSS-transform-scaled to
      // fit its device width, so the on-screen drag must be converted through that scale.
      const readWalletBox = () =>
        page.locator('iframe').first().evaluate((el: HTMLIFrameElement) => {
          const doc = el.contentDocument
          const target = doc?.querySelector('[data-component="WalletSummary"]')
          const rect = target?.getBoundingClientRect()
          return rect
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, clientWidth: el.clientWidth }
            : null
        })
      await expect.poll(readWalletBox, SLOW_POLL).not.toBeNull()
      const walletBox = await readWalletBox()
      const frameBox = await page.locator('iframe').first().boundingBox()
      if (!walletBox || !frameBox) throw new Error('could not locate WalletSummary inside the frame')
      const scale = walletBox.clientWidth > 0 ? frameBox.width / walletBox.clientWidth : 1
      const startX = frameBox.x + walletBox.x * scale + 5
      const startY = frameBox.y + walletBox.y * scale + 5
      const dragDocWidth = Math.min(60, Math.max(8, walletBox.width - 4))
      const dragDocHeight = Math.min(14, Math.max(8, walletBox.height - 2))
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + dragDocWidth * scale, startY + dragDocHeight * scale, { steps: 5 })
      await page.mouse.up()

      // The re-anchor write (`op:'update'`) is not admitted for a client at all — the notice must
      // surface it, never fail silently.
      const alert = page.locator('[data-notice]')
      await expect.poll(() => alert.count(), SLOW_POLL).toBeGreaterThan(0)
      expect(await alert.first().textContent()).toContain('cannot make that change')
      // D24's dead-token notice replaces the whole page; a refused write must never do that.
      expect(await page.getByText('This review link is no longer valid.').count()).toBe(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260917-02-20 (rewrites AC-20260915-02-16): the client role hides owner-only controls and shows Confirm journey; confirming still leaves approval.journeys client:"ok"; a wrong token renders the owner page', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/?client=replace-me#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })
      expect(await page.getByRole('link', { name: 'Components' }).count()).toBe(0)
      expect(await page.getByRole('button', { name: 'Search' }).count()).toBe(0)
      expect(await page.getByRole('button', { name: /Delete/ }).count()).toBe(0)
      expect(await page.getByRole('button', { name: /Reject/ }).count()).toBe(0)
      expect(await page.getByRole('button', { name: /^Approve/ }).count()).toBe(0)

      const confirmButton = page.getByRole('button', { name: 'Confirm journey' })
      await expect.poll(() => confirmButton.count(), SLOW_POLL).toBeGreaterThan(0)
      await confirmButton.click()
      await page.getByRole('button', { name: 'Confirm', exact: true }).click()

      const currentUrl = serve.url
      await expect.poll(async () => {
        const res = await fetch(`${currentUrl}/__mock-review/state`)
        const state = (await res.json()) as { approval: { journeys: Record<string, { client: string | null }> } }
        return state.approval.journeys['first-visit']?.client
      }, SLOW_POLL).toBe('ok')

      await page.goto(`${serve.url}/?client=wrong#/home`, { waitUntil: 'networkidle' })
      expect(await page.getByRole('link', { name: 'Components' }).count()).toBeGreaterThan(0)

      // D24: a present-but-mismatched ?client= clears any previously-set cookie.
      const cookies = await page.context().cookies(serve.url)
      expect(cookies.find((c) => c.name === 'mock-review-client')).toBeUndefined()
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  // AC-20260918-02-10 (D8): a client, on a note THEY THEMSELVES raised (thread[0].by ===
  // 'client', the server's own ownership gate), sees Approve and Defer and never Delete or
  // Reject; Defer persists status:'deferred'. A4: the Defer confirm (an AlertDialog, role
  // `alertdialog`) stacks over the note card (a Radix `Dialog`), which then goes `aria-hidden` —
  // the confirm is the topmost dialog once open, so role locators keep working for elements
  // INSIDE it; the note card itself is queried before the confirm opens, while it is still
  // topmost.
  it('AC-20260918-02-10: a client sees Approve and Defer (never Delete/Reject) on a note they raised, and Defer persists status:deferred', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const notesPath = path.join(serveHost, 'design', 'notes.json')
    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/?client=replace-me#/home`, { waitUntil: 'networkidle' })

      // The client raises a note (op:'add'), exactly as AC-20260917-02-20's escape test does —
      // its thread[0].by is forced to 'client' server-side, so this is a note they own.
      await page.keyboard.press('m')
      await expect.poll(() => page.locator('.cursor-crosshair').count(), SLOW_POLL).toBeGreaterThan(0)
      const frame = page.locator('iframe').first()
      const box = await frame.boundingBox()
      if (!box) throw new Error('frame has no bounding box')
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 })
      await page.mouse.up()
      const newNote = page.getByRole('dialog', { name: /New note/i })
      await expect.poll(() => newNote.isVisible(), SLOW_POLL).toBe(true)
      await newNote.getByRole('textbox').fill('Please change this part')
      await newNote.getByRole('button', { name: 'Save' }).click()

      await page.keyboard.press('Escape')
      const pin = page.getByRole('button', { name: /^Open note / })
      await expect.poll(() => pin.count(), SLOW_POLL).toBeGreaterThan(0)
      await pin.first().click()

      const card = page.getByRole('dialog')
      await expect.poll(() => card.isVisible(), SLOW_POLL).toBe(true)

      await expect.poll(() => card.getByRole('button', { name: 'Approve' }).count(), SLOW_POLL).toBeGreaterThan(0)
      await expect.poll(() => card.getByRole('button', { name: 'Defer' }).count(), SLOW_POLL).toBeGreaterThan(0)
      expect(await card.getByRole('button', { name: /Delete/ }).count()).toBe(0)
      expect(await card.getByRole('button', { name: /Reject/ }).count()).toBe(0)

      await card.getByRole('button', { name: 'Defer' }).click()
      const confirm = page.getByRole('alertdialog')
      await expect.poll(() => confirm.isVisible(), SLOW_POLL).toBe(true)
      await confirm.getByRole('button', { name: 'Defer', exact: true }).click()

      await expect.poll(() => {
        const doc = JSON.parse(readFileSync(notesPath, 'utf8')) as { notes: { status: string }[] }
        return doc.notes[doc.notes.length - 1]?.status
      }, SLOW_POLL).toBe('deferred')
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  // AC-20260918-02-11 (D9/§ UI): the notes panel row for a `deferred` note carries the word
  // "Deferred" (NotesPanel.tsx prefixes `what` with `'Deferred · '` for that status only — same
  // rule NoteDialogs.tsx's dialog title follows); a non-deferred row must not. Seeded directly
  // (two notes, one deferred and one open) rather than driven through the UI, since the point
  // here is the row's rendered text, not how a note reaches `deferred` (that's AC-20260918-02-10).
  it('AC-20260918-02-11: a deferred note\'s panel row carries the word "Deferred"; a non-deferred row does not', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const notesPath = path.join(serveHost, 'design', 'notes.json')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.dirname(notesPath), { recursive: true })
    writeFileSync(
      notesPath,
      JSON.stringify({
        contractVersion: 3,
        notes: [
          {
            id: 'N001',
            screen: 'home',
            state: 'Default',
            component: 'WalletSummary',
            key: '0',
            snippet: 'USD 128.50',
            status: 'deferred',
            thread: [{ by: 'owner', text: 'parked for later' }],
          },
          {
            id: 'N002',
            screen: 'home',
            state: 'Default',
            component: 'WalletSummary',
            key: '0',
            snippet: 'USD 128.50',
            status: 'open',
            thread: [{ by: 'owner', text: 'still open' }],
          },
        ],
        journeys: {},
      }),
    )

    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/#/home`, { waitUntil: 'networkidle' })

      const deferredRow = page.locator('button[data-row="N001"]')
      const openRow = page.locator('button[data-row="N002"]')
      await expect.poll(() => deferredRow.count(), SLOW_POLL).toBeGreaterThan(0)
      await expect.poll(() => openRow.count(), SLOW_POLL).toBeGreaterThan(0)

      expect(await deferredRow.first().textContent()).toContain('Deferred')
      expect(await openRow.first().textContent()).not.toContain('Deferred')
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it("AC-20260915-02-16 (D24): a forwarded (simulated-remote) client request still renders the mock, proving the role does not depend on the Referer", async () => {
    serve = await startServe(greenHost)
    const context = await browser.newContext()
    // X-Forwarded-For is how this suite imitates a remote client while every request still
    // physically arrives over loopback (see tests/server/api.test.ts's matching D24 coverage).
    await context.setExtraHTTPHeaders({ 'X-Forwarded-For': '203.0.113.9' })
    const page = await context.newPage()
    try {
      await page.goto(`${serve.url}/?client=replace-me#/home`, { waitUntil: 'networkidle' })
      const frame = page.locator('iframe').first()
      await expect.poll(() =>
        frame.evaluate((el: HTMLIFrameElement) => el.contentDocument?.querySelector('[data-component="ConsoleShell"]') !== null),
      SLOW_POLL).toBe(true)
    } finally {
      await page.close()
      await context.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260915-04-4: the journey ring is drawn in the reviewer document over the frame, styled as the D6 ripple, and writes nothing journey-related into the frame', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })

      const frame = page.locator('iframe').first()
      await expect.poll(() =>
        frame.evaluate((el: HTMLIFrameElement) => !!el.contentDocument?.querySelector('[data-to="Account"]')),
      SLOW_POLL).toBe(true)

      await expect.poll(() => ringGeometry(page).then((gs) => gs[0]), { timeout: 5000 }).toEqual(
        expect.objectContaining({ count: 1, journeyAttrsInFrame: 0, dataJourneyTargetInFrame: 0 }),
      )
      const [g] = await ringGeometry(page)
      if (!g) throw new Error('no ring geometry reported')
      expectRingWithinOnePx(g)
      expect(g.journeyAttrsInFrame).toBe(0)
      expect(g.dataJourneyTargetInFrame).toBe(0)

      const style = await page.evaluate(() => {
        const ring = document.querySelector('[data-journey-ring]') as HTMLElement
        const cs = getComputedStyle(ring)
        const before = getComputedStyle(ring, '::before')
        const after = getComputedStyle(ring, '::after')
        return {
          outline: cs.outline,
          outlineOffset: cs.outlineOffset,
          pointerEvents: cs.pointerEvents,
          animationName: cs.animationName,
          beforeAnimationName: before.animationName,
          beforeAnimationDuration: before.animationDuration,
          afterAnimationDelay: after.animationDelay,
        }
      })
      expect(style.outline).toBe('oklch(0.606 0.25 292.7) solid 2px')
      expect(style.outlineOffset).toBe('2px')
      expect(style.pointerEvents).toBe('none')
      expect(style.animationName).toBe('none')
      expect(style.beforeAnimationName).toBe('ripple-out')
      expect(style.beforeAnimationDuration).toBe('2.6s')
      expect(style.afterAnimationDelay).toBe('1.3s')
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260915-04-5: the guide matches an encoded frame hash (a state with a space) — pre-image: zero rings and zero hints', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-ac5-')
    const homePath = path.join(host, 'src', 'screens', 'home.tsx')
    const homeSrc = readFileSync(homePath, 'utf8')
    const editedHome = homeSrc
      .replace("states: ['default', 'empty'],", "states: ['Low balance', 'empty'],")
      .replace('Default: <Home state="default" />,', "'Low balance': <Home state=\"default\" />,")
    expect(editedHome).not.toBe(homeSrc)
    writeFileSync(homePath, editedHome)

    // D13/Gotchas: anchored on the fixture's own beat-bearing home step (`{ screen: 'home', beat:
    // 'I open the app' }`), not a whole-line source literal — the fixture's step shape changed
    // under this spec, and a `.replace()` anchored on the retired shape would silently no-op.
    const journeysPath = path.join(host, 'src', 'journeys.ts')
    const journeysSrc = readFileSync(journeysPath, 'utf8')
    const editedJourneys = journeysSrc.replace(
      "{ screen: 'home', beat: 'I open the app' }",
      "{ screen: 'home', beat: 'I open the app', state: 'Low balance' }",
    )
    expect(editedJourneys).not.toBe(journeysSrc)
    writeFileSync(journeysPath, editedJourneys)

    serve = await startServeIn(host)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home?state=Low%20balance&j=first-visit&step=0`, { waitUntil: 'networkidle' })

      const frame = page.locator('iframe').first()
      await expect.poll(
        () => frame.evaluate((el: HTMLIFrameElement) => el.contentWindow?.location.hash ?? ''),
        SLOW_POLL,
      ).toBe('#/home?state=Low%20balance')

      await expect.poll(() => page.locator('[data-journey-ring]').count(), SLOW_POLL).toBe(1)

      const pillText = await page.locator('[aria-label="Guide"]').locator('xpath=..').textContent()
      expect(pillText ?? '').toContain('Account')
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260915-04-6: the ring tracks the control through a frame scroll and a reviewer resize, disappears with the Guide toggle, and both-view shows one ring per iframe', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })
      const frame = page.locator('iframe').first()
      await expect.poll(() =>
        frame.evaluate((el: HTMLIFrameElement) => !!el.contentDocument?.querySelector('[data-to="Account"]')),
      SLOW_POLL).toBe(true)
      await expect.poll(() => ringGeometry(page).then((gs) => gs[0]?.count), { timeout: 5000 }).toBe(1)

      // A 1600px spacer prepended to the frame's #root, then scrolling the frame's own window.
      await frame.evaluate((el: HTMLIFrameElement) => {
        const doc = el.contentDocument
        const root = doc?.getElementById('root')
        if (!doc || !root) return
        const spacer = doc.createElement('div')
        spacer.style.height = '1600px'
        root.insertBefore(spacer, root.firstChild)
        el.contentWindow?.scrollTo(0, 1400)
      })
      await expect.poll(
        async () => {
          const [g] = await ringGeometry(page)
          return g && g.count === 1 && g.deltaLeft <= 1 && g.deltaTop <= 1 && g.deltaWidth <= 1 && g.deltaHeight <= 1
        },
        { timeout: 2000 },
      ).toBe(true)

      // Reviewer resize changes the wrapper's scale.
      await page.setViewportSize({ width: 900, height: 700 })
      await expect.poll(
        async () => {
          const [g] = await ringGeometry(page)
          return g && g.count === 1 && g.deltaLeft <= 1 && g.deltaTop <= 1 && g.deltaWidth <= 1 && g.deltaHeight <= 1
        },
        { timeout: 2000 },
      ).toBe(true)

      // Guide toggle removes then restores the ring.
      await page.locator('[aria-label="Guide"]').click()
      await expect.poll(() => page.locator('[data-journey-ring]').count(), { timeout: 2000 }).toBe(0)
      await page.locator('[aria-label="Guide"]').click()
      await expect.poll(() => page.locator('[data-journey-ring]').count(), { timeout: 2000 }).toBe(1)

      // Both-view, wide reviewer viewport: one ring per iframe after reload.
      await page.evaluate(() => sessionStorage.setItem('view', 'both'))
      await page.setViewportSize({ width: 1800, height: 900 })
      await page.reload({ waitUntil: 'networkidle' })
      await expect.poll(() => page.locator('iframe').count(), SLOW_POLL).toBe(2)
      await expect.poll(
        async () => {
          const gs = await ringGeometry(page)
          return gs.length === 2 && gs.every((g) => g.count === 1 && g.deltaLeft <= 1 && g.deltaTop <= 1)
        },
        { timeout: 5000 },
      ).toBe(true)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)

  it('AC-20260915-04-8: the ring hides when the control is clipped by a scrolling ancestor, returns once unclipped, and hides again when the frame leaves this device\'s screen', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home?j=first-visit&step=0`, { waitUntil: 'networkidle' })
      const frame = page.locator('iframe').first()
      await expect.poll(() =>
        frame.evaluate((el: HTMLIFrameElement) => !!el.contentDocument?.querySelector('[data-to="Account"]')),
      SLOW_POLL).toBe(true)
      await expect.poll(() => ringGeometry(page).then((gs) => gs[0]?.count), { timeout: 5000 }).toBe(1)

      // Wrap the control in a zero-height overflow:hidden div — clipped, so no ring.
      await frame.evaluate((el: HTMLIFrameElement) => {
        const doc = el.contentDocument
        const ctl = doc?.querySelector('[data-to="Account"]')
        if (!doc || !ctl?.parentElement) return
        const wrap = doc.createElement('div')
        wrap.setAttribute('data-ac8-wrap', '')
        wrap.style.overflow = 'hidden'
        wrap.style.height = '0'
        ctl.parentElement.insertBefore(wrap, ctl)
        wrap.appendChild(ctl)
      })
      await expect.poll(() => page.locator('[data-journey-ring]').count(), { timeout: 2000 }).toBe(0)

      // Unwrap: move the control back out and remove the div — ring returns.
      await frame.evaluate((el: HTMLIFrameElement) => {
        const doc = el.contentDocument
        const wrap = doc?.querySelector('[data-ac8-wrap]')
        const ctl = wrap?.querySelector('[data-to="Account"]')
        if (!doc || !wrap?.parentElement || !ctl) return
        wrap.parentElement.insertBefore(ctl, wrap)
        wrap.remove()
      })
      await expect.poll(
        async () => {
          const [g] = await ringGeometry(page)
          return g && g.count === 1 && g.deltaLeft <= 1 && g.deltaTop <= 1 && g.deltaWidth <= 1 && g.deltaHeight <= 1
        },
        { timeout: 2000 },
      ).toBe(true)

      // The frame navigates away from this device's screen — the route guard drops the ring even
      // though the reviewer itself stays on #/home?j=first-visit&step=0.
      await frame.evaluate((el: HTMLIFrameElement) => {
        const win = el.contentWindow
        if (!win) return
        win.location.replace(win.location.pathname + win.location.search + '#/account?state=Default')
      })
      await expect.poll(() => page.locator('[data-journey-ring]').count(), { timeout: 2000 }).toBe(0)
    } finally {
      await page.close()
      await stop()
    }
  }, 60_000)
})
