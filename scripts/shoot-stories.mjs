#!/usr/bin/env node
// walkthrough prototype: the stories page (docs/design/client-view.md §5) — seeds its test projects
// through the API and the client's own endpoints, shoots it in a real Chromium, and walks it.
// Talks to a server already running on WALKTHROUGH_PORT (`npm run walkthrough`).
//
//   node scripts/shoot-stories.mjs --phase <phase> [--out <dir>]
//
// phases:
//   seed      hwstories: round 1 (8 journeys, two actors, two variants); as the client: confirm
//             three stories, a note answered by the team, a note left waiting; then round 2
//             rewording one sentence of a confirmed story. hwfew: 3 journeys, one actor, one
//             confirmed. hwmany: 8 main stories, two actors (the sub-grouped case). Each project
//             is seeded once; a project that already has a round is left alone.
//   shoot     11 hwstories, 12 hwfew, 13 hwmulti at 390, 1024 and 1440 (full page), plus
//             x-stories-subgroups-1440 (hwmany). In the hwstories browser the reader has opened
//             "Checking a patient in" first (read, not confirmed).
//   walk      clicks and keys: a tile opens step 1; a confirmed tile opens its whole story; a
//             variant row opens the variant; the project name returns; Tab reaches every tile and
//             variant with a visible focus ring; nothing scrolls sideways at 360; strips load lazily.
/* global fetch, window, document, getComputedStyle */
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
const PHASE = args.phase || 'shoot'
const OUT = path.resolve(root, args.out || 'docs/design/client-view-shots')
const BASE = `http://127.0.0.1:${process.env.WALKTHROUGH_PORT}`
const API = process.env.WALKTHROUGH_API_TOKEN
const CLIENT = process.env.WALKTHROUGH_CLIENT_TOKEN
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

/** A write as the client (the link's token), exactly as the page makes it. */
async function asClient(project, what, body) {
  const res = await fetch(`${BASE}/p/${project}/__mock-review/${what}?client=${encodeURIComponent(CLIENT)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

async function state(project) {
  const res = await fetch(`${BASE}/p/${project}/__mock-review/state`)
  return res.json()
}

function must(label, r, status = [200, 201]) {
  const ok = status.includes(r.status)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} → ${r.status}${ok ? '' : ` ${JSON.stringify(r.data)}`}`)
  if (!ok) process.exitCode = 1
  return r
}

// ------------------------------------------------------------------ screens (gray catalog)

const el = (type, props, children = [], extra = {}) => ({ type, props, children, ...extra })
const go = (to) => ({ on: { press: { action: 'navigate', params: { to } } } })

/** The Hearwell app frame: nav + a padded column of `main` elements. */
function screen(active, main, elements, state) {
  return {
    root: 'page',
    ...(state ? { state } : {}),
    elements: {
      page: el('Stack', { gap: 0 }, ['nav', 'main']),
      nav: el('Nav', { brand: 'Hearwell', items: ['Calendar', 'Team', 'Settings'], active }, ['me']),
      me: el('Avatar', { name: 'Mika Sato', size: 'sm' }),
      main: el('Stack', { gap: 20, padding: 32 }, main),
      ...elements,
    },
  }
}

const DAY = [
  ['09:00', 'Hana Kato', 'Aiko Tanaka'],
  ['10:30', '', ''],
  ['11:00', 'Kenji Ota', 'Dr. Sato'],
  ['14:00', '', ''],
]
const FULL = [
  ['09:00', 'Hana Kato', 'Aiko Tanaka'],
  ['10:30', 'Sora Abe', 'Aiko Tanaka'],
  ['11:00', 'Kenji Ota', 'Dr. Sato'],
  ['14:00', 'Mei Ueda', 'Dr. Sato'],
]

const NEW_SCREENS = [
  {
    name: 'opening-hours',
    state: 'default',
    spec: screen('Settings', ['title', 'lede', 'hours', 'change'], {
      title: el('Heading', { text: 'Opening hours', level: 1 }),
      lede: el('Text', { text: 'Patients see these hours when they book.', muted: true }),
      hours: el('Table', {
        columns: ['Day', 'Opens', 'Closes'],
        rows: [
          ['Monday to Friday', '09:00', '18:00'],
          ['Saturday', '09:00', '17:00'],
          ['Sunday', 'Closed', ''],
        ],
      }),
      change: el('Button', { label: 'Change Saturday' }, []),
    }),
  },
  {
    name: 'opening-hours',
    state: 'edit',
    spec: screen('Settings', ['title', 'opens', 'closes', 'save'], {
      title: el('Heading', { text: 'Saturday', level: 1 }),
      opens: el('Field', { label: 'Opens', value: '09:00' }),
      closes: el('Field', { label: 'Closes', value: '13:00', hint: 'Bookings after this time move to Monday.' }),
      save: el('Button', { label: 'Save the hours' }, [], go('day-view')),
    }),
  },
  {
    name: 'plans',
    state: 'default',
    spec: screen('Settings', ['title', 'grid'], {
      title: el('Heading', { text: 'Choose a plan', level: 1 }),
      grid: el('Grid', { columns: 1, gap: 12 }, ['solo', 'clinic', 'group']),
      solo: el('Card', { title: 'Solo', description: '1 person, ¥4,000 a month' }, ['soloPick']),
      soloPick: el('Button', { label: 'Choose Solo', variant: 'secondary' }),
      clinic: el('Card', { title: 'Clinic', description: 'Up to 5 people, ¥12,000 a month' }, ['clinicPick']),
      clinicPick: el('Button', { label: 'Choose Clinic' }),
      group: el('Card', { title: 'Group', description: 'Up to 20 people, ¥30,000 a month' }, ['groupPick']),
      groupPick: el('Button', { label: 'Choose Group', variant: 'secondary' }),
    }),
  },
  {
    name: 'plans',
    state: 'chosen',
    spec: screen('Settings', ['title', 'done', 'what', 'next'], {
      title: el('Heading', { text: 'Your plan', level: 1 }),
      done: el('Alert', { title: 'You chose Clinic', text: 'Up to 5 people. You can change this any time.' }),
      what: el('List', { items: ['¥12,000 a month', 'First bill on 1 November', 'Cancel any time'] }),
      next: el('Button', { label: 'Go to the calendar' }, [], go('day-view')),
    }),
  },
  {
    name: 'day-view',
    state: 'default',
    spec: screen('Calendar', ['title', 'days', 'book'], {
      title: el('Heading', { text: 'Thursday 2 October', level: 1 }),
      days: el('Tabs', { tabs: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], active: 'Thu' }, ['slots']),
      slots: el('Table', { columns: ['Time', 'Patient', 'With'], rows: DAY }),
      book: el('Button', { label: 'Book a patient' }, [], go('booking-form')),
    }),
  },
  {
    name: 'day-view',
    state: 'full',
    spec: screen('Calendar', ['title', 'full', 'days', 'wait'], {
      title: el('Heading', { text: 'Thursday 2 October', level: 1 }),
      full: el('Alert', { title: 'This day is full', text: 'Put the patient on the waiting list.' }),
      days: el('Tabs', { tabs: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], active: 'Thu' }, ['slots']),
      slots: el('Table', { columns: ['Time', 'Patient', 'With'], rows: FULL }),
      wait: el('Button', { label: 'Add to the waiting list' }, [], go('booking-form')),
    }),
  },
  {
    name: 'booking-form',
    state: 'default',
    spec: screen('Calendar', ['title', 'name', 'time', 'with', 'book'], {
      title: el('Heading', { text: 'New booking', level: 1 }),
      name: el('Field', { label: 'Patient name', value: 'Yui Mori' }),
      time: el('Select', { label: 'Time', options: ['10:30', '14:00'], value: '10:30' }),
      with: el('Select', { label: 'With', options: ['Aiko Tanaka', 'Dr. Sato'], value: 'Aiko Tanaka' }),
      book: el('Button', { label: 'Book' }),
    }),
  },
  {
    name: 'booking-form',
    state: 'done',
    spec: screen('Calendar', ['done', 'back'], {
      done: el('Alert', { title: 'Booked', text: 'Yui Mori, Thursday 10:30 with Aiko Tanaka.' }),
      back: el('Button', { label: 'Back to the calendar', variant: 'ghost' }, [], go('day-view')),
    }),
  },
  {
    name: 'booking-form',
    state: 'waitlist',
    spec: screen('Calendar', ['title', 'name', 'any', 'add'], {
      title: el('Heading', { text: 'Waiting list', level: 1 }),
      name: el('Field', { label: 'Patient name', value: 'Yui Mori' }),
      any: el('Checkbox', { label: 'Any day this week', checked: true }),
      add: el('Button', { label: 'Add to the waiting list' }),
    }),
  },
  {
    name: 'booking-form',
    state: 'arrived',
    spec: screen('Calendar', ['title', 'when', 'here', 'tell'], {
      title: el('Heading', { text: 'Yui Mori', level: 1 }),
      when: el('Text', { text: 'Thursday 10:30 with Aiko Tanaka' }),
      here: el('Badge', { text: 'Arrived' }),
      tell: el('Button', { label: 'Tell Aiko' }),
    }),
  },
]

/** hearwell's round-1 screens (owner-intro, roster-confirm default/empty, reciprocity-brief). */
async function hearwellScreens() {
  const src = await state('hearwell')
  const out = []
  for (const s of src.screens) {
    for (const st of s.states) {
      const f = await (await fetch(`${BASE}/p/hearwell/__walkthrough/frame?screen=${s.name}&state=${st}&round=1`)).json()
      out.push({ name: s.name, state: st, spec: f.spec })
    }
  }
  return out
}

const MIKA = 'Mika, clinic owner'
const REN = 'Ren, front desk'
const step = (beat, screen, state) => ({ beat, screen, ...(state ? { state } : {}) })

const STORIES = [
  {
    id: 'owner-onboarding',
    title: 'Owner onboarding',
    actor: MIKA,
    steps: [
      step('I open the invitation', 'owner-intro', 'default'),
      step('I check who is on my team', 'roster-confirm', 'default'),
      step('I read what happens next', 'reciprocity-brief', 'default'),
    ],
  },
  {
    id: 'owner-onboarding-empty',
    title: 'If nobody is listed yet',
    actor: MIKA,
    variantOf: 'owner-onboarding',
    steps: [
      step('I open the invitation', 'owner-intro', 'default'),
      step('I see nobody is listed yet', 'roster-confirm', 'empty'),
      step('I read what happens next', 'reciprocity-brief', 'default'),
    ],
  },
  {
    id: 'opening-hours',
    title: 'Setting the opening hours',
    actor: MIKA,
    steps: [
      step('I see the hours patients see', 'opening-hours', 'default'),
      step('I change Saturday to close at one', 'opening-hours', 'edit'),
      step('I check the calendar has the new hours', 'day-view', 'default'),
    ],
  },
  {
    id: 'choosing-plan',
    title: 'Choosing a plan',
    actor: MIKA,
    steps: [step('I compare the three plans', 'plans', 'default'), step('I pick the plan for five people', 'plans', 'chosen')],
  },
  {
    id: 'weekly-look',
    title: 'Looking at the week',
    actor: MIKA,
    steps: [
      step('I open this week in the calendar', 'day-view', 'default'),
      step('I see Thursday is fully booked', 'day-view', 'full'),
      step('I think about opening longer', 'opening-hours', 'default'),
      step('I see what a bigger plan would cost', 'plans', 'default'),
      step('I decide to wait a month', 'plans', 'chosen'),
    ],
  },
  {
    id: 'booking',
    title: 'Booking a patient',
    actor: REN,
    steps: [
      step('I look for a free time on Thursday', 'day-view', 'default'),
      step('I type the patient’s name and pick 10:30', 'booking-form', 'default'),
      step('I see the booking is saved', 'booking-form', 'done'),
    ],
  },
  {
    id: 'booking-full',
    title: 'If the day is full',
    actor: REN,
    variantOf: 'booking',
    steps: [step('I see Thursday is full', 'day-view', 'full'), step('I put the patient on the waiting list', 'booking-form', 'waitlist')],
  },
  {
    id: 'check-in',
    title: 'Checking a patient in',
    actor: REN,
    steps: [step('I find the patient in today’s list', 'day-view', 'default'), step('I mark that they have arrived', 'booking-form', 'arrived')],
  },
]

async function seeded(project) {
  return (await state(project)).round !== null
}

async function confirm(project, id) {
  const s = await state(project)
  const j = s.journeys.find((x) => x.id === id)
  must(`${project}: confirm ${id}`, await asClient(project, 'approval', { op: 'clientOk', id, beats: j.beats }))
}

async function clientNote(project, screen, st, node, index, pickedText, text) {
  const r = must(
    `${project}: client note on ${screen}@${st} "${pickedText}"`,
    await asClient(project, 'notes', {
      op: 'add',
      note: {
        screen,
        state: st,
        component: node,
        key: String(index ?? 0),
        snippet: pickedText,
        status: 'open',
        thread: [{ by: 'client', text }],
        anchor: { node, index },
        pickedText,
      },
    }),
  )
  return r.data.notes.at(-1).id
}

async function seed() {
  const base = await hearwellScreens()
  const screens = [...base, ...NEW_SCREENS]

  if (await seeded('hwstories')) console.log('hwstories: already seeded, left alone')
  else {
    must('hwstories: push round 1', await api('POST', '/v1/projects/hwstories/rounds', { round: 1, kind: 'wireframe', name: 'Hearwell', journeys: STORIES, screens }))
    for (const id of ['opening-hours', 'choosing-plan', 'booking-full']) await confirm('hwstories', id)
    const answered = await clientNote('hwstories', 'roster-confirm', 'default', 'who', 1, 'Ren', 'Ren has a surname: Ito. Can the list show it?')
    must('hwstories: team answers it', await api('POST', `/v1/projects/hwstories/notes/${answered}/reply`, { text: 'Fixed: the roster now shows Ren Ito.' }))
    await clientNote('hwstories', 'booking-form', 'default', 'time', null, 'Time', 'We also book at 16:30 on weekdays.')
    // round 2: one sentence of a confirmed story reworded, everything else the same
    const round2 = STORIES.map((j) =>
      j.id === 'opening-hours' ? { ...j, steps: j.steps.map((s, i) => (i === 1 ? { ...s, beat: 'I close at one on Saturdays from now on' } : s)) } : j,
    )
    must('hwstories: push round 2 (one sentence reworded)', await api('POST', '/v1/projects/hwstories/rounds', { round: 2, kind: 'wireframe', journeys: round2, screens }))
  }

  if (await seeded('hwfew')) console.log('hwfew: already seeded, left alone')
  else {
    const few = STORIES.filter((j) => ['owner-onboarding', 'opening-hours', 'choosing-plan'].includes(j.id))
    must('hwfew: push round 1', await api('POST', '/v1/projects/hwfew/rounds', { round: 1, kind: 'wireframe', name: 'Hearwell', journeys: few, screens }))
    await confirm('hwfew', 'choosing-plan')
  }

  if (await seeded('hwmany')) console.log('hwmany: already seeded, left alone')
  else {
    // 8 main stories for two actors: past the sub-grouping threshold (more than 6 main stories)
    const many = [
      ...STORIES.filter((j) => !j.variantOf),
      { id: 'week-off', title: 'Taking a week off', actor: MIKA, steps: [step('I close the clinic for a week', 'opening-hours', 'edit')] },
      { id: 'waiting-list', title: 'Calling the waiting list', actor: REN, steps: [step('I see who is waiting', 'booking-form', 'waitlist')] },
    ]
    must('hwmany: push round 1', await api('POST', '/v1/projects/hwmany/rounds', { round: 1, kind: 'wireframe', name: 'Hearwell', journeys: many, screens }))
  }
}

// ------------------------------------------------------------------ the browser

const SIZES = [
  { w: 390, h: 844 },
  { w: 1024, h: 800 },
  { w: 1440, h: 900 },
]

const clientUrl = (project, hash = '#/') => `${BASE}/p/${project}/?client=${encodeURIComponent(CLIENT)}${hash}`

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

/** Scrolls down the page a screen at a time, as a reader would, waiting at each stop until the
 * strip frames in view have drawn (Chromium does not render an off-screen frame, so a frame that
 * loads and is scrolled away before it draws stays blank until it is seen again). */
async function loadAllStrips(page) {
  await page.evaluate(() => document.fonts.ready)
  const vh = page.viewportSize().height
  for (let y = 0; ; y += Math.floor(vh * 0.8)) {
    await page.evaluate((y) => window.scrollTo(0, y), y)
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.cv-thumb')].every((t) => {
          const r = t.getBoundingClientRect()
          if (r.bottom < 0 || r.top > window.innerHeight) return true
          return t.querySelector('iframe')?.getAttribute('data-visible') === 'true'
        }),
      null,
      { timeout: 60_000 },
    )
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    if (y + vh >= height) break
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
}

async function openStories(page, project) {
  await page.goto(clientUrl(project))
  await page.waitForSelector('.cv-stories')
  await loadAllStrips(page)
}

async function shot(page, name) {
  const file = path.join(OUT, name)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(100)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`shot ${file}`)
}

/** The reader opened "Checking a patient in" in this browser and did not confirm it. */
async function readCheckIn(page) {
  await page.goto(clientUrl('hwstories', '#/j/check-in/step/1'))
  await page.waitForSelector('.cv-main .cv-frame')
}

async function shoot() {
  await withBrowser(async (browser) => {
    for (const size of SIZES) {
      const page = await clientPage(browser, size)
      await readCheckIn(page)
      await openStories(page, 'hwstories')
      await shot(page, `11-stories-${size.w}.png`)
      await openStories(page, 'hwfew')
      await shot(page, `12-stories-${size.w}.png`)
      await openStories(page, 'hwmulti')
      await shot(page, `13-stories-${size.w}.png`)
      await page.context().close()
    }
    const page = await clientPage(browser, SIZES[2])
    await openStories(page, 'hwmany')
    await shot(page, 'x-stories-subgroups-1440.png')
    await page.context().close()
  })
}

// ------------------------------------------------------------------ the walk

let failures = 0
function check(label, ok, extra = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  — ${extra}` : ''}`)
}

async function walk() {
  await withBrowser(async (browser) => {
    // lazy strips: on a phone, frames below the fold have not been requested
    {
      const page = await clientPage(browser, { w: 390, h: 844 })
      await page.goto(clientUrl('hwstories'))
      await page.waitForSelector('.cv-stories')
      await page.waitForTimeout(1500)
      const counts = await page.evaluate(() => {
        const all = [...document.querySelectorAll('.cv-thumb')]
        return { all: all.length, near: all.filter((t) => t.getAttribute('data-near') === 'true').length, frames: document.querySelectorAll('.cv-thumb iframe').length }
      })
      check('strip frames off-screen are not loaded (390×844, top of page)', counts.near < counts.all && counts.frames === counts.near, JSON.stringify(counts))

      // nothing scrolls sideways at 360
      await page.setViewportSize({ width: 360, height: 780 })
      await loadAllStrips(page)
      const sideways = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      check('no sideways scroll at 360', sideways.scroll <= sideways.client, JSON.stringify(sideways))
      await page.context().close()
    }

    for (const size of [SIZES[0], SIZES[2]]) {
      const page = await clientPage(browser, size)
      const at = `(${size.w})`
      await openStories(page, 'hwstories')

      // a tile opens step 1
      await page.locator('.cv-tile-main[data-journey="weekly-look"]').click()
      await page.waitForURL(/#\/j\/weekly-look\/step\/1$/)
      check(`${at} "Looking at the week" tile opens step 1`, true, page.url().split('#')[1])

      // the project name returns to the stories page
      if (size.w < 960) await page.locator('.cv-bar .cv-project').click()
      else await page.locator('.cv-side .cv-project').click()
      await page.waitForSelector('.cv-stories')
      check(`${at} the project name returns to the stories page`, page.url().endsWith('#/'), page.url().split('#')[1])

      // a confirmed tile opens its whole story
      await page.locator('.cv-tile-main[data-journey="choosing-plan"]').click()
      await page.waitForURL(/#\/j\/choosing-plan\/story$/)
      await page.getByText('You confirmed this story on').waitFor()
      check(`${at} confirmed "Choosing a plan" tile opens its whole story`, true, page.url().split('#')[1])
      await page.goBack()
      await page.waitForSelector('.cv-stories')

      // a variant row opens the variant
      await page.locator('.cv-variant[data-journey="owner-onboarding-empty"]').click()
      await page.waitForURL(/#\/j\/owner-onboarding-empty\/step\/1$/)
      check(`${at} variant row "If nobody is listed yet" opens the variant`, true, page.url().split('#')[1])
      await page.goBack()
      await page.waitForSelector('.cv-stories')

      // clicking a tile's strip (not its title) still opens the story
      await page.locator('.cv-tile-main[data-journey="check-in"] .cv-thumb').first().click()
      await page.waitForURL(/#\/j\/check-in\/step\/1$/)
      check(`${at} clicking a strip frame opens the story`, true)
      await page.goBack()
      await page.waitForSelector('.cv-stories')

      // Tab reaches every tile and variant, each with a visible ring
      // (from a fresh load: after a click, the browser's Tab starting point is the clicked link)
      await page.reload()
      await page.waitForSelector('.cv-stories')
      const expected = await page.evaluate(() => [...document.querySelectorAll('.cv-tile-main, .cv-variant')].map((a) => a.getAttribute('data-journey')))
      const reached = []
      const rings = []
      for (let i = 0; i < expected.length + 4; i++) {
        await page.keyboard.press('Tab')
        const info = await page.evaluate(() => {
          const a = document.activeElement
          if (!a || !a.matches('.cv-tile-main, .cv-variant')) return null
          const ringOn = a.matches('.cv-tile-main') ? a.closest('.cv-tile') : a
          const cs = getComputedStyle(ringOn)
          return { id: a.getAttribute('data-journey'), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }
        })
        if (info && !reached.includes(info.id)) {
          reached.push(info.id)
          rings.push(info.ring)
        }
      }
      check(`${at} Tab reaches every tile and variant in order`, JSON.stringify(reached) === JSON.stringify(expected), `${reached.join(', ')}`)
      check(`${at} each has a visible 2 px focus ring`, rings.length === expected.length && rings.every(Boolean))
      if (size.w === 390) {
        await page.reload()
        await page.waitForSelector('.cv-stories')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        await page.waitForTimeout(200)
        await page.screenshot({ path: path.join(OUT, 'x-stories-focus-390.png') })
        console.log(`shot ${path.join(OUT, 'x-stories-focus-390.png')}`)
      }
      await page.context().close()
    }
  })
  console.log(`\nwalk: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  if (failures) process.exitCode = 1
}

const phases = { seed, shoot, walk }
if (!phases[PHASE]) {
  console.error(`unknown phase ${PHASE}`)
  process.exit(2)
}
await phases[PHASE]()
