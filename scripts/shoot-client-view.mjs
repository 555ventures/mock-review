#!/usr/bin/env node
// walkthrough prototype: drives the client view (and the owner's reviewer) in a real Chromium and
// takes the design-review screenshots named in docs/design/client-view.md's build brief. Talks to
// a server already running on WALKTHROUGH_PORT (`npm run walkthrough`).
//
//   node scripts/shoot-client-view.mjs --project <id> --phase <phase> [--out <dir>]
//
// phases, in the order they can run against one project (each later one changes data for good):
//   copy     make <id> a copy of hearwell's round 1 (screens, journey, the answered note on "Ren")
//   note     as the client, add a note on "Aiko Tanaka"; the team answers it through the API
//   read     01 step 1, 02 step 2 with pins, 03 pick mode, 04 the note sheet typed (not saved),
//            05 the notes list, 06 the whole story before confirming
//   confirm  press "This is my story"; 07 the whole story after confirming
//   round2   push a round with one sentence reworded and one screen changed; 08 story + step
//   empty    09 a project with no round
//   owner    10 the owner's reviewer in "Add a note" pick mode (1440 only)
/* global fetch, structuredClone, window, document */
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((a) => {
      const [k, ...v] = a.trim().split(' ')
      return [k, v.join(' ')]
    }),
)
const PROJECT = args.project || 'hearwell'
const PHASE = args.phase || 'read'
const OUT = path.resolve(root, args.out || 'docs/design/client-view-shots')
const BASE = `http://127.0.0.1:${process.env.WALKTHROUGH_PORT}`
const API = process.env.WALKTHROUGH_API_TOKEN
const CLIENT = process.env.WALKTHROUGH_CLIENT_TOKEN
const JOURNEY = 'owner-onboarding'
mkdirSync(OUT, { recursive: true })

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { authorization: `Bearer ${API}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: res.status, data }
}

async function state(project) {
  const res = await fetch(`${BASE}/p/${project}/__mock-review/state`)
  return res.json()
}

const shots = []
async function shoot(page, name) {
  const file = path.join(OUT, name)
  // a full-page capture draws sticky bars where the scroll left them; start from the top
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(100)
  await page.screenshot({ path: file, fullPage: true })
  shots.push(file)
  console.log(`shot ${file}`)
}

const clientUrl = (hash) => `${BASE}/p/${PROJECT}/?client=${encodeURIComponent(CLIENT)}${hash}`

async function settle(page) {
  // let a hash change reach React first (the frame's data-drawn flips on that render)
  await page.waitForTimeout(150)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => {
    const f = document.querySelector('.cv-main .cv-frame')
    return !f || f.getAttribute('data-drawn') === 'true'
  })
  await page.waitForFunction(() => [...document.querySelectorAll('.cv-thumb iframe')].every((i) => i.getAttribute('data-visible') === 'true'))
  await page.waitForTimeout(900)
}

async function open(page, hash) {
  await page.goto(clientUrl(hash))
  await page.waitForSelector('.cv')
  await settle(page)
}

/** Page coordinates of the centre of the n-th `[data-node=<node>]` inside the step's frame. */
async function nodePoint(page, node, n = 0) {
  return page.evaluate(
    ({ node, n }) => {
      const iframe = document.querySelector('.cv-main .cv-frame iframe')
      const el = iframe.contentDocument.querySelectorAll(`[data-node="${node}"]`)[n]
      const fr = iframe.getBoundingClientRect()
      const scale = fr.width / iframe.offsetWidth
      const r = el.getBoundingClientRect()
      return { x: fr.left + (r.left + r.width / 2) * scale, y: fr.top + (r.top + r.height / 2) * scale }
    },
    { node, n },
  )
}

const sizes = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
]

async function withBrowser(fn) {
  const browser = await chromium.launch()
  try {
    await fn(browser)
  } finally {
    await browser.close()
  }
}

async function clientPage(browser, size) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`console error: ${m.text()}`)
  })
  return page
}

// ------------------------------------------------------------------ phases

async function copy() {
  const src = await state('hearwell')
  const screens = []
  for (const s of src.screens) {
    for (const st of s.states) {
      const f = await (await fetch(`${BASE}/p/hearwell/__walkthrough/frame?screen=${s.name}&state=${st}&round=1`)).json()
      screens.push({ name: s.name, state: st, spec: f.spec })
    }
  }
  const j = src.journeys.find((x) => x.id === JOURNEY)
  const push = await api('POST', `/v1/projects/${PROJECT}/rounds`, {
    round: 1,
    kind: 'wireframe',
    name: 'Hearwell',
    journeys: [{ id: j.id, title: j.title, persona: j.persona, steps: j.steps.map((s) => ({ beat: s.beat, screen: s.screen, ...(s.state ? { state: s.state } : {}) })) }],
    screens,
  })
  console.log('push round 1', push.status, push.data.error ?? '')
  const add = await fetch(`${BASE}/p/${PROJECT}/__mock-review/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      op: 'add',
      note: { screen: 'roster-confirm', state: 'default', component: 'who', key: '1', snippet: 'Ren', status: 'open', thread: [{ by: 'owner', text: 'Ren has a surname: Ito' }], anchor: { node: 'who', index: 1 }, pickedText: 'Ren' },
    }),
  })
  const doc = await add.json()
  const id = doc.notes?.at(-1)?.id
  const r = await api('POST', `/v1/projects/${PROJECT}/notes/${id}/reply`, { text: 'Fixed: the roster now shows Ren Ito.' })
  console.log('owner note', id, r.status)
}

async function note() {
  await withBrowser(async (browser) => {
    const page = await clientPage(browser, sizes[0])
    await open(page, `#/j/${JOURNEY}/step/2`)
    await page.getByRole('button', { name: 'Add a note' }).click()
    const p = await nodePoint(page, 'who', 0)
    await page.mouse.click(p.x, p.y)
    await page.getByRole('textbox', { name: 'What should change here?' }).fill('Aiko only works on Mondays. Can the list say so?')
    await page.getByRole('button', { name: 'Save note' }).click()
    await page.getByText('Note saved. We will answer it here.').waitFor()
    await settle(page)
    await shoot(page, 'x-note-saved-390.png')
  })
  const s = await state(PROJECT)
  const mine = s.notes.notes.filter((n) => n.thread[0]?.by === 'client').at(-1)
  const r = await api('POST', `/v1/projects/${PROJECT}/notes/${mine.id}/reply`, { text: 'Done: the list now says “Mondays only” under Aiko.' })
  console.log('client note', mine.id, mine.anchor, mine.pickedText, 'answered', r.status)
}

async function read() {
  await withBrowser(async (browser) => {
    for (const size of sizes) {
      const page = await clientPage(browser, size)
      await open(page, `#/j/${JOURNEY}/step/1`)
      await shoot(page, `01-step-${size.w}.png`)

      await page.getByRole('button', { name: 'Next' }).click()
      await settle(page)
      await shoot(page, `02-step-note-pin-${size.w}.png`)

      await page.getByRole('button', { name: 'Add a note' }).click()
      const p = await nodePoint(page, 'add', 0)
      await page.mouse.move(p.x, p.y)
      await page.waitForSelector('.cv-hover')
      await shoot(page, `03-pick-mode-${size.w}.png`)

      await page.mouse.click(p.x, p.y)
      await page.getByRole('textbox', { name: 'What should change here?' }).fill('Can this say “Add someone from your team” instead?')
      await page.waitForTimeout(400)
      await shoot(page, `04-note-sheet-${size.w}.png`)
      await page.getByRole('button', { name: 'Cancel' }).click()

      await page.locator('.cv-noterow').click()
      await page.waitForTimeout(400)
      await shoot(page, `05-notes-list-${size.w}.png`)
      await page.getByRole('button', { name: 'Close' }).click()

      await open(page, `#/j/${JOURNEY}/story`)
      await shoot(page, `06-story-before-confirm-${size.w}.png`)
      await page.context().close()
    }
  })
}

async function confirm() {
  await withBrowser(async (browser) => {
    const first = await clientPage(browser, sizes[0])
    await open(first, `#/j/${JOURNEY}/story`)
    await first.getByRole('button', { name: 'This is my story' }).click()
    await first.getByText('You confirmed this story on').waitFor()
    await settle(first)
    await shoot(first, `07-story-after-confirm-${sizes[0].w}.png`)
    const second = await clientPage(browser, sizes[1])
    await open(second, `#/j/${JOURNEY}/story`)
    await shoot(second, `07-story-after-confirm-${sizes[1].w}.png`)
  })
}

async function round2() {
  const s = await state(PROJECT)
  const n = s.round.n + 1
  const screens = []
  for (const sc of s.screens) {
    for (const st of sc.states) {
      const f = await (await fetch(`${BASE}/p/${PROJECT}/__walkthrough/frame?screen=${sc.name}&state=${st}&round=${s.round.n}`)).json()
      let spec = f.spec
      if (sc.name === 'roster-confirm' && st === 'default') {
        // the team's answer made real: Ren's surname and Aiko's days
        spec = structuredClone(spec)
        spec.state.members = [
          { name: 'Aiko Tanaka', role: 'Audiologist, Mondays only' },
          { name: 'Ren Ito', role: 'Front desk' },
          { name: 'Dr. Sato', role: 'Director' },
        ]
      }
      screens.push({ name: sc.name, state: st, spec })
    }
  }
  const j = s.journeys.find((x) => x.id === JOURNEY)
  const steps = j.steps.map((st, i) => ({
    beat: i === 1 ? 'I check that everyone on my team is listed' : st.beat,
    screen: st.screen,
    ...(st.state ? { state: st.state } : {}),
  }))
  const push = await api('POST', `/v1/projects/${PROJECT}/rounds`, { round: n, kind: 'wireframe', journeys: [{ id: j.id, title: j.title, persona: j.persona, steps }], screens })
  console.log(`push round ${n}`, push.status, push.data.error ?? '')
  await withBrowser(async (browser) => {
    for (const size of sizes) {
      const page = await clientPage(browser, size)
      await open(page, `#/j/${JOURNEY}/story`)
      await shoot(page, `08-story-changed-${size.w}.png`)
      await open(page, `#/j/${JOURNEY}/step/2`)
      await shoot(page, `08-step-changed-${size.w}.png`)
      await page.context().close()
    }
  })
}

async function empty() {
  await withBrowser(async (browser) => {
    for (const size of sizes) {
      const page = await clientPage(browser, size)
      await page.goto(`${BASE}/p/walkthrough-empty/?client=${encodeURIComponent(CLIENT)}`)
      await page.waitForSelector('.cv-empty')
      await page.evaluate(() => document.fonts.ready)
      await shoot(page, `09-empty-${size.w}.png`)
      await page.context().close()
    }
  })
}

async function owner() {
  await withBrowser(async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
    await page.goto(`${BASE}/p/${PROJECT}/#/roster-confirm`)
    await page.waitForSelector('iframe')
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every((f) => f.contentDocument?.getElementById('root')?.getAttribute('data-shown')?.startsWith('#/roster-confirm')))
    await page.getByRole('button', { name: 'Add a note' }).click()
    const p = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      const el = iframe.contentDocument.querySelectorAll('[data-node="add"]')[0]
      const fr = iframe.getBoundingClientRect()
      const scale = fr.width / iframe.offsetWidth
      const r = el.getBoundingClientRect()
      return { x: fr.left + (r.left + r.width / 2) * scale, y: fr.top + (r.top + r.height / 2) * scale }
    })
    await page.mouse.move(p.x, p.y)
    await page.waitForTimeout(300)
    await shoot(page, '10-owner-add-a-note-1440.png')
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(300)
    await shoot(page, 'x-owner-picked-1440.png')
  })
}

/** A project with two journeys: the entry is the plain list (design §5). Pushes round 1 once. */
async function multi() {
  const src = await state('hearwell')
  const screens = []
  for (const s of src.screens) {
    for (const st of s.states) {
      const f = await (await fetch(`${BASE}/p/hearwell/__walkthrough/frame?screen=${s.name}&state=${st}&round=1`)).json()
      screens.push({ name: s.name, state: st, spec: f.spec })
    }
  }
  const j = src.journeys.find((x) => x.id === JOURNEY)
  const steps = j.steps.map((s) => ({ beat: s.beat, screen: s.screen, ...(s.state ? { state: s.state } : {}) }))
  const push = await api('POST', `/v1/projects/${PROJECT}/rounds`, {
    round: 1,
    kind: 'wireframe',
    name: 'Hearwell',
    journeys: [
      { id: j.id, title: j.title, persona: j.persona, steps },
      { id: 'staff-brief', title: 'Staff brief', persona: 'Ren (front desk) reads what the clinic will ask of him.', steps: [steps[3]] },
    ],
    screens,
  })
  console.log('push round 1', push.status, push.data.error ?? '')
  await withBrowser(async (browser) => {
    for (const size of sizes) {
      const page = await clientPage(browser, size)
      await open(page, '#/')
      await shoot(page, `x-journey-list-${size.w}.png`)
      await page.context().close()
    }
  })
}

const phases = { copy, note, read, confirm, round2, empty, owner, multi }
if (!phases[PHASE]) {
  console.error(`unknown phase ${PHASE}`)
  process.exit(2)
}
await phases[PHASE]()
