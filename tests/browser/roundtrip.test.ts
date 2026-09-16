// AC-20260915-02-18, -19, -20 [env: SKIP_BROWSER]: the raise -> answer -> approve round trip —
// the browser draws a note, the CLI answers it, the page reflects the answer live (SSE, no
// reload), and screen approval/un-approval both flow through the real UI. Playwright is imported
// dynamically inside this skipIf-gated describe (see tests/browser/surfaces.test.ts's header
// note on why).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { run } from '../helpers/cli.js'
import { startServe, stopServe, type Serve } from '../helpers/serve.js'

type NotesDoc = {
  notes: Array<{
    id: string
    component: string | null
    status: string
    project?: boolean
    screen?: string | null
    state?: string | null
    thread: Array<{ by: string; text: string }>
  }>
}

// Confirmed by direct reproduction (20 concurrent `serve` processes against scratch copies, all
// sharing mock.config.ts's port 5180): Vite's `strictPort: false` fallback + `server.listen(port)`
// hands each process its own free port with no cross-talk — every server's own GET state only
// ever showed its own writes. The gate's real failure mode is CPU contention: the full suite runs
// many Chromium instances + Vite dev servers concurrently (both vitest projects, unsequenced),
// and a POST-then-refetch-then-rerender round trip that takes well under a second in isolation can
// take several seconds under that load. Every poll below gets a generous, explicit window rather
// than vitest's ~1s default.
const SLOW_POLL = { timeout: 20_000 }

// D (env gates): make the SKIP_BROWSER=1 skip loud — see tests/browser/surfaces.test.ts's
// matching block for why a plain describe.skipIf isn't enough on its own, and (review pass 2,
// item 2) why this title carries no AC id.
it.skipIf(process.env.SKIP_BROWSER !== '1')(
  '[env: SKIP_BROWSER] this file\'s browser assertions were NOT run: SKIP_BROWSER=1 skipped them all',
  () => {
    console.warn('tests/browser/roundtrip.test.ts: SKIP_BROWSER=1 — AC-20260915-02-18/-19/-20 assertions were skipped, not verified')
    expect(process.env.SKIP_BROWSER).toBe('1')
  },
)

describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-02-18/-19/-20: raise -> answer -> approve round trip [env: SKIP_BROWSER]', () => {
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

  it('AC-20260915-02-18: M, drag over WalletSummary, save -> a red N001 pin, a red NoteRow, and notes.json holds the note', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/#/home`, { waitUntil: 'networkidle' })
      await page.keyboard.press('m')

      // The iframe's on-screen box is CSS-transform-scaled (DeviceFrames.tsx's fit-to-width
      // scale, D9); `getBoundingClientRect()` read *inside* the iframe's own document is
      // unscaled. Mixing the two only lands on the right element when scale === 1, which this
      // layout (256px sidebar + 320px notes panel + workspace padding around a 1280px desktop
      // device, at Chromium's default viewport) never reaches. Convert the inner rect through
      // the frame's own scale (on-screen width / native clientWidth) before adding it to the
      // on-screen iframe origin — this is what a real user's drag does.
      const readWalletBox = () =>
        page.locator('iframe').first().evaluate((el: HTMLIFrameElement) => {
          const doc = el.contentDocument
          const target = doc?.querySelector('[data-component="WalletSummary"]')
          const rect = target?.getBoundingClientRect()
          return rect
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, clientWidth: el.clientWidth }
            : null
        })
      // The frame is a same-origin iframe rendered by a separate Vite-served entry; `networkidle`
      // on the outer page doesn't guarantee the frame's own React tree has painted yet, so poll
      // for the target element rather than reading it once.
      await expect.poll(readWalletBox, SLOW_POLL).not.toBeNull()
      const walletBox = await readWalletBox()
      const frameBox = await page.locator('iframe').first().boundingBox()
      if (!walletBox || !frameBox) throw new Error('could not locate WalletSummary inside the frame')

      const scale = walletBox.clientWidth > 0 ? frameBox.width / walletBox.clientWidth : 1
      const startX = frameBox.x + walletBox.x * scale + 5
      const startY = frameBox.y + walletBox.y * scale + 5
      // The marking overlay's own drag math tracks distance in the frame's *document* space
      // (the wrapper is laid out at native size and only visually shrunk by the CSS scale
      // transform, so its children's own coordinates are unscaled) — the reference's "drag
      // smaller than 8x8 CSS px is discarded" rule is checked against that unscaled size, not
      // the on-screen mouse delta. WalletSummary itself is a thin single-line element (~18px
      // document-tall), so pick a document-space box comfortably inside it (60w x 14h, both well
      // clear of the 8px discard floor and inside its own bounds) and convert to the on-screen
      // mouse delta this scale produces, rather than clamping the on-screen delta directly (which
      // could shrink to near zero once divided back down for a thin target).
      const dragDocWidth = Math.min(60, Math.max(8, walletBox.width - 4))
      const dragDocHeight = Math.min(14, Math.max(8, walletBox.height - 2))
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + dragDocWidth * scale, startY + dragDocHeight * scale, { steps: 5 })
      await page.mouse.up()

      const dialog = page.getByRole('dialog', { name: /New note/i })
      await dialog.getByRole('textbox').fill('Make the balance bigger')
      await dialog.getByRole('button', { name: 'Save' }).click()

      // The save round trip (POST /notes -> apply patch -> write notes.json -> return -> refetch
      // state -> re-render the pin) is a real network + filesystem round trip, not instant; the
      // default expect.poll window is sometimes too tight for that under full-suite CPU load
      // (same class of timing issue as AC-15's theme-reload poll).
      const pin = page.getByRole('button', { name: 'Open note N001' })
      await expect.poll(() => pin.count(), SLOW_POLL).toBeGreaterThan(0)
      // TONE.open.pin is `bg-red-500 text-white` (notes-ui.tsx); Tailwind v4's default palette
      // defines red-500 as an oklch color, and Chromium's computed style preserves the oklch
      // serialization for colors authored via a CSS color function rather than normalizing to
      // rgb() (confirmed by direct reproduction against this repo's own installed tailwindcss
      // theme.css value, `oklch(63.7% 0.237 25.331)`).
      const pinColor = await pin.first().evaluate((el: Element) => getComputedStyle(el.firstElementChild ?? el).backgroundColor)
      expect(pinColor).toBe('oklch(0.637 0.237 25.331)')

      const notesPath = path.join(serveHost, 'design', 'notes.json')
      await expect.poll(() => {
        const doc = JSON.parse(readFileSync(notesPath, 'utf8')) as NotesDoc
        return doc.notes.find((n) => n.id === 'N001')
      }, SLOW_POLL).toMatchObject({
        component: 'WalletSummary',
        status: 'open',
        thread: [{ by: 'owner', text: 'Make the balance bigger' }],
      })
    } finally {
      await page.close()
    }
  }, 60_000)

  it('AC-20260915-02-19: answer over the CLI turns the pin yellow live (no reload), and Approve turns it blue', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const notesPath = path.join(serveHost, 'design', 'notes.json')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.dirname(notesPath), { recursive: true })
    // `snippet` must actually appear in WalletSummary's rendered text (reference rule 12: a
    // snippet the anchor element no longer contains is treated as outdated and drawn with no
    // pin — src/ui/notes/anchor.ts's anchorEl). The fixture's WalletSummary renders
    // "{currency} {balance.toFixed(2)}" -> "USD 128.50" (see
    // tests/fixtures/host/src/components/WalletSummary.tsx), not "Balance".
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
      // The outer page's own `networkidle` says nothing about whether the iframe's React app has
      // actually mounted yet (mount/paint time isn't network activity) — the pin's overlay can
      // only place itself once the anchor element (WalletSummary) exists in the frame's own
      // contentDocument (same iframe-readiness race as AC-18's readWalletBox poll above), so wait
      // for that directly rather than for the pin, which would otherwise never appear if checked
      // too early and simply time out looking like a missing feature.
      await expect.poll(() =>
        page.locator('iframe').first().evaluate((el: HTMLIFrameElement) => !!el.contentDocument?.querySelector('[data-component="WalletSummary"]')),
      SLOW_POLL).toBe(true)
      // A plain attribute locator, not `getByRole` — Radix's `Dialog` is modal by default and
      // `aria-hidden`s the rest of the app (everything outside its portal, including the frame's
      // pin overlay) while the thread dialog below is open. `getByRole` reads the accessibility
      // tree and would then match nothing, which is exactly why the colour poll after Approve
      // (still inside that same open dialog) used to time out rather than see a wrong colour —
      // confirmed by direct reproduction (the button and its approved-blue background both exist
      // in the DOM at that moment; only the accessibility tree excludes them). A CSS attribute
      // locator ignores the accessibility tree entirely, so it keeps working with the dialog open
      // or closed.
      const pin = page.locator('button[aria-label="Open note N001"]')
      await expect.poll(() => pin.count(), SLOW_POLL).toBeGreaterThan(0)
      const pinColor = () => pin.first().evaluate((el: Element) => getComputedStyle(el.firstElementChild ?? el).backgroundColor)

      // "Without a reload" (AC-19): a real navigation/reload tears down the window's own JS
      // globals; a value planted here that survives past the SSE-driven update proves the update
      // arrived through a re-render, not a reload.
      await page.evaluate(() => {
        ;(window as unknown as { __noReloadMarker?: boolean }).__noReloadMarker = true
      })

      const answerResult = run(serveHost, ['answer', '--note', 'N001', '--text', 'Done: 2xl'])
      expect(answerResult.status).toBe(0)

      // TONE.answered.pin is `bg-yellow-400 text-yellow-950` (notes-ui.tsx); Tailwind v4's
      // yellow-400 is `oklch(85.2% 0.199 91.936)` (this repo's installed tailwindcss theme.css),
      // and Chromium's computed style preserves the oklch serialization rather than converting to
      // rgb() for a color authored via a CSS color function (confirmed by direct reproduction).
      await expect.poll(pinColor, SLOW_POLL).toBe('oklch(0.852 0.199 91.936)')
      expect(
        await page.evaluate(() => (window as unknown as { __noReloadMarker?: boolean }).__noReloadMarker),
      ).toBe(true)

      await pin.first().click()
      const dialog = page.getByRole('dialog')
      const dialogText = async () => (await dialog.textContent()) ?? ''
      await expect.poll(dialogText, SLOW_POLL).toContain('AI')
      expect(await dialogText()).toContain('Done: 2xl')
      const approveButton = dialog.getByRole('button', { name: 'Approve' })
      await expect.poll(() => approveButton.isVisible(), SLOW_POLL).toBe(true)
      await expect.poll(() => dialog.getByRole('button', { name: 'Reject' }).isVisible(), SLOW_POLL).toBe(true)

      await approveButton.click()
      await page.getByRole('button', { name: 'Approve', exact: true }).last().click()

      await expect.poll(() => {
        const doc = JSON.parse(readFileSync(notesPath, 'utf8')) as NotesDoc
        return doc.notes.find((n) => n.id === 'N001')?.status
      }, SLOW_POLL).toBe('approved')

      // TONE.approved.pin is `bg-blue-500 text-white`; Tailwind v4's blue-500 is
      // `oklch(62.3% 0.214 259.815)` (this repo's installed tailwindcss theme.css). D26 fixed the
      // sequencing race between `useNoteActions.ts`'s own refresh and `main.tsx`'s SSE-triggered
      // refetch; `pinColor` above now reads via a plain attribute locator (not `getByRole`) so the
      // thread dialog's modal `aria-hidden` doesn't hide the pin from this check either.
      await expect.poll(pinColor, SLOW_POLL).toBe('oklch(0.623 0.214 259.815)')

      // Reject/Approve disappear once the note is approved (reference §6: approved shows Reply
      // only) — the same thread dialog is still open (the approve action re-renders it, per
      // useNoteActions.ts, rather than closing it), so this checks the same dialog, not a reopen.
      await expect.poll(() => dialog.getByRole('button', { name: 'Approve' }).isVisible(), SLOW_POLL).toBe(false)
      await expect.poll(() => dialog.getByRole('button', { name: 'Reject' }).isVisible(), SLOW_POLL).toBe(false)
    } finally {
      await page.close()
    }
  }, 60_000)

  it('AC-20260915-02-20: Approve screen writes approval.screens.home with the check --json hash, and a new note un-approves it', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/#/home`, { waitUntil: 'networkidle' })

      // AC-20260915-02-20 (D20 selectors, screenTone): the sidebar's own Screens dot for "home"
      // turns blue on approval and red once a new note lands — the Screens tab list, not the
      // Journeys tab that's on by default.
      await page.getByRole('tab', { name: 'Screens' }).click()
      const homeItem = page.locator('li[data-slot="sidebar-menu-item"]').filter({ has: page.getByRole('link', { name: 'Home', exact: true }) })
      const homeDot = homeItem.locator('span.rounded-full').first()
      const homeDotColor = () => homeDot.evaluate((el: Element) => getComputedStyle(el).backgroundColor)

      const approveScreenButton = page.getByRole('button', { name: 'Approve screen' })
      await expect.poll(() => approveScreenButton.count(), SLOW_POLL).toBeGreaterThan(0)
      await approveScreenButton.click()
      await page.getByRole('button', { name: 'Approve', exact: true }).click()

      const checkOut = run(serveHost, ['check', '--json'])
      const check = JSON.parse(checkOut.stdout) as { screens: Array<{ name: string; hash: string }> }
      const homeHash = check.screens.find((s) => s.name === 'home')?.hash

      await expect.poll(async () => {
        const res = await fetch(`${serveUrl}/__mock-review/state`)
        const state = (await res.json()) as { approval: { screens: Record<string, { hash: string }> } }
        return state.approval.screens.home?.hash
      }, SLOW_POLL).toBe(homeHash)

      // TONE.approved.pin is `bg-blue-500 text-white`; Tailwind v4's blue-500 is
      // `oklch(62.3% 0.214 259.815)` (this repo's installed tailwindcss theme.css); Chromium
      // preserves the oklch serialization rather than converting to rgb() (confirmed by direct
      // reproduction, same mechanism as AC-19's pin color checks above).
      await expect.poll(homeDotColor, SLOW_POLL).toBe('oklch(0.623 0.214 259.815)')

      await page.keyboard.press('m')
      const frame = page.locator('iframe').first()
      const box = await frame.boundingBox()
      if (!box) throw new Error('frame has no bounding box')
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 })
      await page.mouse.up()
      const dialog = page.getByRole('dialog', { name: /New note/i })
      await dialog.getByRole('textbox').fill('one more thing')
      await dialog.getByRole('button', { name: 'Save' }).click()

      await expect.poll(async () => {
        const res = await fetch(`${serveUrl}/__mock-review/state`)
        const state = (await res.json()) as { approval: { screens: Record<string, unknown> } }
        return state.approval.screens.home
      }, SLOW_POLL).toBeUndefined()

      // TONE.open.pin is `bg-red-500 text-white`; Tailwind v4's red-500 is
      // `oklch(63.7% 0.237 25.331)` (this repo's installed tailwindcss theme.css).
      await expect.poll(homeDotColor, SLOW_POLL).toBe('oklch(0.637 0.237 25.331)')
    } finally {
      await page.close()
    }
  }, 60_000)

  it("AC-20260915-02-18 (D1's PROJECT group): a PROJECT note saves with component: null and project: true, and opening its row opens the thread without changing the hash", async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/#/home`, { waitUntil: 'networkidle' })

      // Two "+ Note" buttons exist (reference §5: THIS SCREEN and PROJECT each have one) — scope
      // to the PROJECT group's own section, not the screen-anchored one.
      const projectSection = page.locator('[data-notes-scroll]').filter({ hasText: /project/i })
      await projectSection.getByRole('button', { name: /Note/ }).click()

      const dialog = page.getByRole('dialog', { name: /New note/i })
      await expect.poll(() => dialog.isVisible(), SLOW_POLL).toBe(true)
      expect(await dialog.textContent()).toContain('Project')
      await dialog.getByRole('textbox').fill('A project-wide note')
      await dialog.getByRole('button', { name: 'Save' }).click()

      const notesPath = path.join(serveHost, 'design', 'notes.json')
      await expect.poll(() => {
        const doc = JSON.parse(readFileSync(notesPath, 'utf8')) as NotesDoc
        return doc.notes.some((n) => n.thread[0]?.text === 'A project-wide note')
      }, SLOW_POLL).toBe(true)
      const doc = JSON.parse(readFileSync(notesPath, 'utf8')) as NotesDoc
      const saved = doc.notes.find((n) => n.thread[0]?.text === 'A project-wide note')
      expect(saved).toMatchObject({ component: null, project: true })

      const hashBefore = await page.evaluate(() => location.hash)
      const row = projectSection.getByText('A project-wide note')
      await expect.poll(() => row.count(), SLOW_POLL).toBeGreaterThan(0)
      await row.first().click()

      const threadDialog = page.getByRole('dialog').filter({ hasText: 'Project note' })
      await expect.poll(() => threadDialog.isVisible(), SLOW_POLL).toBe(true)
      expect(await page.evaluate(() => location.hash)).toBe(hashBefore)
    } finally {
      await page.close()
    }
  }, 60_000)

  it('AC-20260915-02-18 (D27): navigating to another screen with a draft note open resets the session — the draft is gone, not saved', async () => {
    serve = await startServe(greenHost)
    const { url: serveUrl, host: serveHost } = serve
    const page = await browser.newPage()
    try {
      await page.goto(`${serveUrl}/#/home`, { waitUntil: 'networkidle' })
      await page.keyboard.press('m')

      const frame = page.locator('iframe').first()
      const box = await frame.boundingBox()
      if (!box) throw new Error('frame has no bounding box')
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 })
      await page.mouse.up()

      const dialog = page.getByRole('dialog', { name: /New note/i })
      await expect.poll(() => dialog.isVisible(), SLOW_POLL).toBe(true)
      await dialog.getByRole('textbox').fill('this draft must not survive navigation')

      // D27: the note-editing session (marking, reanchor, selected, cardOpen, draft) lives in the
      // store and resets on every `route.screen` change — navigating away without saving or
      // cancelling must not let the draft (or marking mode) follow the reviewer to another
      // screen, and must never write a note for it.
      await page.goto(`${serveUrl}/#/account`, { waitUntil: 'networkidle' })

      expect(await page.getByRole('dialog', { name: /New note/i }).count()).toBe(0)
      expect(await page.locator('.cursor-crosshair').count()).toBe(0)

      const notesPath = path.join(serveHost, 'design', 'notes.json')
      const doc = JSON.parse(readFileSync(notesPath, 'utf8')) as NotesDoc
      expect(doc.notes.some((n) => n.thread.some((t) => t.text === 'this draft must not survive navigation'))).toBe(false)

      // Navigating back to home confirms the reset persisted (the draft did not just move off
      // screen and come back) — no draft dialog, no leftover marking mode.
      await page.goto(`${serveUrl}/#/home`, { waitUntil: 'networkidle' })
      expect(await page.getByRole('dialog', { name: /New note/i }).count()).toBe(0)
    } finally {
      await page.close()
    }
  }, 60_000)
})
