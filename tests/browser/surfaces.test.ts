// AC-20260915-02-1, -2, -15, -16 [env: SKIP_BROWSER]: reference §1/§2/§9/§11 surfaces, D10's
// theme pick, D11's client role. Playwright is a devDependency added by a later wave (D13); it
// is only ever imported dynamically, inside this skipIf-gated describe, so SKIP_BROWSER=1 (or a
// tree with no `playwright` yet) never breaks collection of this file. Only vitest's own
// `expect` is used (no `@playwright/test` per D13's "plain playwright"), so assertions on
// visibility/text/enabled state poll a plain Playwright locator method rather than using
// Playwright's web-first matchers.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost } from '../helpers/cli.js'
import { startServe, startServeIn, stopServe, type Serve } from '../helpers/serve.js'
import type { Locator } from 'playwright'

async function textOf(locator: Locator): Promise<string> {
  return (await locator.first().textContent()) ?? ''
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

  it("AC-20260915-02-1 (D4/D21's guide): a guided click on [data-to] advances the frame and keeps the journey and step in the hash", async () => {
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

  it('AC-20260915-02-15: the theme Select appears only when the host has src/themes/*.css, and picking nova applies its stylesheet', async () => {
    serve = await startServe(greenHost)
    const page = await browser.newPage()
    try {
      await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })
      const themeSelect = page.getByRole('combobox', { name: /Theme/i })
      await expect.poll(() => themeSelect.count(), SLOW_POLL).toBeGreaterThan(0)
      await themeSelect.first().click()
      await page.getByRole('option', { name: 'nova' }).click()

      const currentUrl = serve.url
      await expect.poll(async () => {
        const res = await fetch(`${currentUrl}/__mock-review/state`)
        const state = (await res.json()) as { approval: { theme: string | null } }
        return state.approval.theme
      }, SLOW_POLL).toBe('nova')

      // Picking a theme triggers a genuine iframe reload (D18e: the frame entry only reads
      // `approval.theme` once, at script load, so it must reload to pick up the new value) —
      // server.transformIndexHtml + the /@fs transpile + the state fetch round trip take
      // roughly 900ms-1.5s under load, and expect.poll's default ~2.5s window is sometimes too
      // tight for that when running inside the full suite. Widen the window; the assertion
      // itself is unchanged.
      await expect.poll(async () => {
        const hrefs = await page.locator('iframe').first().evaluate((el: HTMLIFrameElement) => {
          const doc = el.contentDocument
          return Array.from(doc?.querySelectorAll('link[rel="stylesheet"]') ?? []).map((l) => l.getAttribute('href'))
        })
        return hrefs.some((h: string | null) => h?.includes('themes/nova.css'))
      }, SLOW_POLL).toBe(true)

      // D22: the Components page's own preview iframes (catalog/Preview.tsx) carry the picked
      // theme too, now that the frame no longer fetches GET state. A hash-only change on an
      // already-loaded page is a same-document navigation, not a real page load — `page.goto`
      // with `waitUntil: 'networkidle'` here hangs for the full timeout because the app's own
      // long-lived SSE connection (`EventSource('/__mock-review/events')`, open for the page's
      // whole lifetime) never lets the network go idle, and no new "load" ever fires for Playwright
      // to resolve against. Driving the hash change directly (as a real in-app link click would)
      // and polling for the result avoids relying on a navigation lifecycle event that a
      // client-side router's hash change was never going to produce.
      // ComponentsPage only mounts a `Preview` (and its iframe) once a component is selected
      // (`?c=<name>`) — the bare list has none.
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

  it('AC-20260915-02-15: a host with no src/themes/*.css renders no theme control', async () => {
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

  it('AC-20260915-02-16: the client role hides owner-only controls and shows Confirm journey; a wrong token renders the owner page', async () => {
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
})
