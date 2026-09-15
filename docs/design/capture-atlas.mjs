import { chromium } from '/home/jj/projects/claude-plugins/.claude/worktrees/agent-ae25a43a1031bd49a/prototypes/react-mocks/node_modules/playwright/index.mjs'
import fs from 'node:fs'
const B = 'http://127.0.0.1:45980'
const OUT = '/home/jj/projects/mock-review/docs/design/atlas'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
let n = 0
const shot = async (name, opts = {}) => {
  n++
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file, ...opts })
  console.log('->', file.split('/').pop())
}
const settle = (ms = 1800) => page.waitForTimeout(ms)
const go = async (hash, ms) => { await page.goto(`${B}/${hash}`); await settle(ms) }
const setSession = (o) => page.addInitScript((o) => { try { for (const [k, v] of Object.entries(o)) sessionStorage.setItem(k, v) } catch {} }, o)

await setSession({ view: 'desktop', 'side-tab': 'journeys', 'guide-off': '0' })

// ---------- 1. default entry ----------
await go('#/', 2600)
await shot('home-default-console-account')

// ---------- sidebar ----------
await shot('sidebar-journeys-list', { clip: { x: 0, y: 0, width: 300, height: 1000 } })
await page.getByRole('tab', { name: 'Screens' }).click(); await settle(900)
await shot('sidebar-screens-list-status-dots', { clip: { x: 0, y: 0, width: 300, height: 1000 } })
await shot('sidebar-screens-expanded-full')
await page.locator('button[data-sidebar="trigger"]').first().click(); await settle(900)
await shot('sidebar-collapsed-icon-rail')
await page.locator('button[data-sidebar="trigger"]').first().click(); await settle(900)

// ---------- top bar ----------
await shot('topbar-chrome-screen-mode', { clip: { x: 256, y: 0, width: 1344, height: 56 } })
await page.locator('header button:has(.lucide-chevron-down), header [data-slot="dropdown-menu-trigger"]').first().click(); await settle(700)
await shot('state-switcher-dropdown-open')
await page.keyboard.press('Escape'); await settle(500)

// ---------- device views ----------
await go('#/console-account?state=Keys', 2600)
await shot('view-desktop-1440')
await page.locator('[aria-label="Mobile"]').click(); await settle(2200)
await shot('view-mobile-390')
await page.locator('[aria-label="Both"]').click(); await settle(2600)
await shot('view-both-desktop-plus-mobile-ghost-pin')
await page.locator('[aria-label="Desktop"]').click(); await settle(1800)

// ---------- every screen x state ----------
const matrix = [
  ['console-account', ['Default', 'Keys', 'Funding', 'Empty', 'Loading', 'Error']],
  ['console-home', ['Default', 'Switcher', 'Quiet', 'SignedOut', 'Empty', 'Loading', 'Error']],
]
for (const [screen, states] of matrix)
  for (const s of states) { await go(`#/${screen}?state=${s}`, 2400); await shot(`screen-${screen}-${s.toLowerCase()}`) }

// ---------- marking / drawing ----------
await go('#/console-home?state=Quiet', 2400)
await page.locator('[aria-label="Mark an area"]').click(); await settle(700)
await shot('marking-mode-on-crosshair')
const overlay = page.locator('.cursor-crosshair').first()
const bb = await overlay.boundingBox()
await page.mouse.move(bb.x + 260, bb.y + 200)
await page.mouse.down()
await page.mouse.move(bb.x + 560, bb.y + 330, { steps: 12 })
await page.waitForTimeout(400)
await shot('note-being-drawn-drag-rectangle')
await page.mouse.up(); await settle(900)
await shot('new-note-dialog-from-drawn-area')
await page.locator('#note-text').fill('The empty state needs a clearer next action.')
await settle(400)
await shot('new-note-dialog-text-entered-save-enabled')
await page.getByRole('button', { name: 'Cancel' }).click(); await settle(700)
await page.keyboard.press('Escape'); await settle(600)

// ---------- project note dialog ----------
await go('#/console-account?state=Default', 2400)
await page.locator('section[data-notes-scroll]').nth(1).getByRole('button', { name: 'Note' }).click(); await settle(800)
await shot('new-note-dialog-project-scope')
await page.keyboard.press('Escape'); await settle(600)
await page.locator('section[data-notes-scroll]').nth(0).getByRole('button', { name: 'Note' }).click(); await settle(800)
await shot('new-note-dialog-whole-screen-scope')
await page.keyboard.press('Escape'); await settle(600)

// ---------- note thread dialogs ----------
await page.click('[data-row="N004"]'); await settle(900)
await shot('note-thread-answered-yellow-reject-approve')
await page.locator('#note-reply').fill('Still not right — make the switcher list scroll.')
await settle(400)
await shot('note-thread-reply-typed')
await page.keyboard.press('Escape'); await settle(600)
await page.click('[data-row="N002"]'); await settle(900)
await shot('note-thread-open-red-outdated-anchor-alert')
await page.getByRole('button', { name: 'Approve', exact: true }).count()
await page.keyboard.press('Escape'); await settle(600)

// ---------- verdict dialogs ----------
await page.click('[data-row="N004"]'); await settle(900)
await page.getByRole('button', { name: 'Approve', exact: true }).click(); await settle(700)
await shot('verdict-dialog-approve')
await page.getByRole('button', { name: 'Cancel' }).click(); await settle(600)
await page.getByRole('button', { name: 'Reject', exact: true }).click(); await settle(700)
await shot('verdict-dialog-reject-destructive')
await page.getByRole('button', { name: 'Cancel' }).click(); await settle(600)
await page.keyboard.press('Escape'); await settle(600)
await page.click('[data-row="N006"]'); await settle(900)
await page.getByRole('button', { name: 'Delete', exact: true }).click(); await settle(700)
await shot('verdict-dialog-delete-destructive')
await page.getByRole('button', { name: 'Cancel' }).click(); await settle(600)
await page.keyboard.press('Escape'); await settle(600)

// ---------- re-anchor ----------
await page.click('[data-row="N002"]'); await settle(900)
await page.getByRole('button', { name: 'Re-anchor' }).click(); await settle(1200)
await shot('re-anchoring-mode-banner')
await page.keyboard.press('Escape'); await settle(600)

// ---------- notes panel hidden ----------
await page.getByRole('button', { name: /^Notes/ }).click(); await settle(900)
await shot('notes-panel-hidden')
await page.getByRole('button', { name: /^Notes/ }).click(); await settle(900)

// ---------- journeys ----------
await go('#/console-home?state=SignedOut&j=first-visit&step=0', 3200)
await shot('journey-step-1-pill-and-guide-ring')
await shot('journey-pill-closeup', { clip: { x: 256, y: 760, width: 1344, height: 240 } })
await page.locator('[aria-label="Guide"]').click(); await settle(1500)
await shot('journey-guide-off-no-ring')
await page.locator('[aria-label="Guide"]').click(); await settle(1500)
await go('#/console-home?state=Default&j=daily-check&step=0', 3200)
await shot('journey-panel-conversation-empty')
await go('#/console-account?state=Default&j=daily-check&step=2', 3200)
await shot('journey-branch-two-hints')
await go('#/console-home?state=Quiet&j=first-visit&step=4', 3000)
await shot('journey-end-of-journey')
await go('#/console-account?state=Loading&j=first-visit', 3000)
await shot('journey-not-on-this-step')
await go('#/console-home?state=Default&j=daily-check&step=0', 3200)
await page.getByRole('button', { name: 'Approve', exact: true }).click(); await settle(800)
await shot('journey-approve-confirm-dialog')
await page.getByRole('button', { name: 'Cancel' }).click(); await settle(600)
await page.locator('#journey-reply').fill('The switcher should remember the last client.')
await settle(400)
await shot('journey-panel-reply-typed')

// ---------- command palette ----------
await go('#/console-account?state=Default', 2400)
await page.keyboard.press('Control+k'); await settle(900)
await shot('command-palette-open')
await page.keyboard.type('acc'); await settle(700)
await shot('command-palette-filtered')
await page.keyboard.press('Escape'); await settle(600)

// ---------- components page ----------
await go('#/components', 2400)
await shot('components-page-list-no-selection')
await go('#/components?c=project:KeyField', 3000)
await shot('components-page-component-isolated-preview')
await page.locator('[data-slot="select-trigger"]').first().click().catch(() => {}); await settle(700)
await shot('components-page-example-select-open')
await page.keyboard.press('Escape'); await settle(500)
await go('#/components?c=shell:ConsoleShell', 3400)
await shot('components-page-shell-preview-scaled')
await go('#/components?c=project:KeyField&from=console-account', 3000)
await shot('components-page-screen-filter-badge')
await page.getByPlaceholder('Search components…').fill('zzz'); await settle(700)
await shot('components-page-search-no-match')

// ---------- raw frame mode ----------
await page.goto(`${B}/?frame=1#/console-account?state=Default`); await settle(2200)
await shot('frame1-raw-screen-render')
await page.goto(`${B}/?frame=1#/__component?name=KeyField&example=Masked`); await settle(1500)
await shot('frame1-raw-component-render')

// ---------- unknown route ----------
await go('#/nope', 1500)
await shot('unknown-screen-fallback')

// ---------- MUTATION: approve N004 to show the approved (blue) tone ----------
await go('#/console-account?state=Default', 2600)
await page.click('[data-row="N004"]'); await settle(900)
await page.getByRole('button', { name: 'Approve', exact: true }).click(); await settle(700)
await page.locator('[role=alertdialog]').getByRole('button', { name: 'Approve' }).click(); await settle(1200)
await shot('note-thread-approved-blue-reply-only')
await page.keyboard.press('Escape'); await settle(900)
await shot('approved-blue-pin-and-row')

console.log('TOTAL', n)
await browser.close()
