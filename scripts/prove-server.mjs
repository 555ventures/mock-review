#!/usr/bin/env node
// walkthrough prototype: proves the server over HTTP only (never the page). Starts nothing —
// talks to a server already running on WALKTHROUGH_PORT (`npm run walkthrough`). Each run uses a
// fresh project id, so it can be re-run against the same database.
/* global fetch */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const BASE = process.env.WALKTHROUGH_BASE ?? `http://127.0.0.1:${process.env.WALKTHROUGH_PORT}`
const API = process.env.WALKTHROUGH_API_TOKEN
const CLIENT = process.env.WALKTHROUGH_CLIENT_TOKEN
const project = `proof-${Date.now().toString(36)}`

let failures = 0
function check(label, ok, extra = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  — ${extra}` : ''}`)
}

async function call(method, url, { body, auth = true, raw, headers = {} } = {}) {
  const h = { ...headers }
  if (auth) h.authorization = `Bearer ${API}`
  let payload
  if (raw !== undefined) {
    payload = raw
    h['content-type'] = 'image/png'
  } else if (body !== undefined) {
    payload = JSON.stringify(body)
    h['content-type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${url}`, { method, headers: h, body: payload })
  const type = res.headers.get('content-type') ?? ''
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer())
  return { status: res.status, data, type }
}

/** src/analysis/beats.ts `beatHash`, byte for byte. */
function beatHash(steps) {
  if (steps.length === 0) return null
  if (steps.some((s) => s.beat === undefined)) return null
  const canonical = steps.map((s) => `${s.beat} -> ${s.screen}` + (s.state ? `@${s.state}` : '')).join('\n')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

/** A real, decodable w×h gray PNG (8-bit grayscale, no filter). */
function png(w, h, shade) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // grayscale
  const rows = Buffer.alloc((w + 1) * h, shade)
  for (let y = 0; y < h; y++) rows[y * (w + 1)] = 0 // filter byte
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const P = `/p/${project}/__mock-review`

// ------------------------------------------------------------------ 0. API reachable + auth
{
  const r = await call('GET', '/v1', { auth: false })
  check('GET /v1 answers {apiVersion:1}', r.status === 200 && r.data.apiVersion === 1, JSON.stringify(r.data))
  const u = await call('GET', `/v1/projects/${project}/notes`, { auth: false })
  check('API without bearer → 401 unauthorized', u.status === 401 && u.data.error === 'unauthorized', `${u.status} ${JSON.stringify(u.data)}`)
}

// ------------------------------------------------------------------ 1. push a wireframe round
const steps = [
  { beat: 'I open the invite and see who asked me to join', screen: 'welcome', state: 'default' },
  { beat: 'I fill in my practice name', screen: 'details', state: 'default' },
  { beat: 'I see my practice is ready', screen: 'done', state: 'default' },
]
const beats = beatHash(steps)
const spec = (heading, body, next) => ({
  root: 'page',
  elements: {
    page: { type: 'Stack', props: { gap: 16 }, children: next ? ['title', 'body', 'cta'] : ['title', 'body'] },
    title: { type: 'Heading', props: { text: heading, level: 1 } },
    body: { type: 'Text', props: { text: body } },
    ...(next ? { cta: { type: 'Button', props: { label: 'Continue' }, on: { press: { action: 'navigate', params: { to: next } } } } } : {}),
  },
})
const wireframe = {
  round: 1,
  kind: 'wireframe',
  name: 'Proof project',
  journeys: [{ id: 'onboarding', title: 'Owner onboarding', persona: 'A clinic owner', beats, steps }],
  screens: [
    { name: 'welcome', state: 'default', spec: spec('Welcome', 'Dr Lee invited you.', 'details') },
    { name: 'details', state: 'default', spec: spec('Your practice', 'Tell us its name.', 'done') },
    { name: 'done', state: 'default', spec: spec('All set', 'Your practice is ready.', null) },
  ],
}
{
  const r = await call('POST', `/v1/projects/${project}/rounds`, { body: wireframe })
  check('push wireframe round 1 → 201', r.status === 201 && r.data.round === 1 && r.data.kind === 'wireframe', `${r.status} ${JSON.stringify(r.data)}`)
}

// ------------------------------------------------------------------ 2. read state
let state
{
  const r = await call('GET', `${P}/state`, { auth: false })
  state = r.data
  const j = state.journeys?.[0]
  check('GET state → 200, round {n:1, kind:wireframe, status:open}', r.status === 200 && state.round?.n === 1 && state.round.kind === 'wireframe' && state.round.status === 'open', JSON.stringify(state.round))
  check('state.screens = welcome, details, done (examples = states)', state.screens.map((s) => s.name).join(',') === 'welcome,details,done' && state.screens[0].examples[0] === 'default')
  check('state.role = owner on loopback', state.role === 'owner')
  check(`journey beats = client-computed ${beats}`, j?.beats === beats, `server ${j?.beats}`)
  check('journey edges derived and resolved (Continue buttons navigate)', j?.edges.length === 2 && j.resolved === true && j.unresolved.length === 0, JSON.stringify(j?.edges))
  check('config.targets.viewports default', JSON.stringify(state.config.targets.viewports) === '["1280x800","390x844"]')
}

// ------------------------------------------------------------------ 3. client adds an anchored note
let noteId
const anchor = { node: 'cta', index: 0, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, viewport: 'desktop' }
{
  const r = await call('POST', `${P}/notes?client=${encodeURIComponent(CLIENT)}`, {
    auth: false,
    body: {
      op: 'add',
      note: { screen: 'welcome', state: 'default', component: 'cta', key: '0', snippet: 'Continue', status: 'open', thread: [{ by: 'owner', text: 'Should this say Join?' }], anchor },
    },
  })
  const n = r.data.notes?.[r.data.notes.length - 1]
  noteId = n?.id
  check('client POST notes add → 200, new note N001', r.status === 200 && noteId === 'N001', `${r.status} ${JSON.stringify(n)}`)
  check('the thread entry was rewritten to by:client (role rule)', n?.thread?.[0]?.by === 'client')
  check('note carries round 1, component=anchor.node, key=String(anchor.index)', n?.round === 1 && n.component === 'cta' && n.key === '0')
}

// ------------------------------------------------------------------ 4. read it back through the API
{
  const r = await call('GET', `/v1/projects/${project}/notes?round=1`)
  const n = r.data.notes?.find((x) => x.id === noteId)
  check('GET /v1 notes?round=1 returns the note', r.status === 200 && r.data.apiVersion === 1 && !!n, JSON.stringify(n))
  // jsonb does not keep key order, so compare by value
  check('anchor round-trips exactly (deep equal)', isDeepStrictEqual(n?.anchor, anchor))
  check('text/author = first thread entry', n?.text === 'Should this say Join?' && n.author === 'client' && n.status === 'open')
}

// ------------------------------------------------------------------ 5. reply through the API
{
  const r = await call('POST', `/v1/projects/${project}/notes/${noteId}/reply`, { body: { text: 'Changed to "Join the practice".' } })
  check('POST /v1 notes/N001/reply → 200, status answered', r.status === 200 && r.data.note?.status === 'answered', `${r.status} ${JSON.stringify(r.data.note)}`)
  const s = await call('GET', `${P}/state`, { auth: false })
  const n = s.data.notes.notes.find((x) => x.id === noteId)
  check('reviewer state shows the session reply in the thread', n?.status === 'answered' && n.thread.at(-1)?.by === 'session', JSON.stringify(n?.thread))
  const bad = await call('POST', `/v1/projects/${project}/notes/N999/reply`, { body: { text: 'x' } })
  check('reply to an unknown id → 404 unknown-note', bad.status === 404 && bad.data.error === 'unknown-note', `${bad.status} ${JSON.stringify(bad.data)}`)
}

// ------------------------------------------------------------------ 6. client role rules on notes
{
  const r = await call('POST', `${P}/notes?client=${encodeURIComponent(CLIENT)}`, { auth: false, body: { op: 'remove', id: noteId } })
  check('client may not remove a note → 403', r.status === 403, `${r.status}`)
}

// ------------------------------------------------------------------ 7. clientOk right and wrong beats
{
  const wrong = await call('POST', `/p/${project}/__mock-review/approval?client=${encodeURIComponent(CLIENT)}`, {
    auth: false,
    body: { op: 'clientOk', id: 'onboarding', beats: 'deadbeef0000' },
  })
  check('clientOk with wrong beats → 409', wrong.status === 409, `${wrong.status} ${JSON.stringify(wrong.data)}`)
  const unknown = await call('POST', `/p/${project}/__mock-review/approval?client=${encodeURIComponent(CLIENT)}`, {
    auth: false,
    body: { op: 'clientOk', id: 'nope', beats },
  })
  check('clientOk on an unknown journey → 400', unknown.status === 400, `${unknown.status} ${JSON.stringify(unknown.data)}`)
  const right = await call('POST', `/p/${project}/__mock-review/approval?client=${encodeURIComponent(CLIENT)}`, {
    auth: false,
    body: { op: 'clientOk', id: 'onboarding', beats },
  })
  check('clientOk with right beats → 200, approval.journeys.onboarding.client = ok', right.status === 200 && right.data.journeys?.onboarding?.client === 'ok', `${right.status} ${JSON.stringify(right.data)}`)
  const list = await call('GET', `/v1/projects/${project}/approvals`)
  const a = list.data.approvals?.[0]
  check('GET /v1 approvals → {journey, by:client, round:1, beats}', a?.journey === 'onboarding' && a.by === 'client' && a.round === 1 && a.beats === beats, JSON.stringify(a))
}

// ------------------------------------------------------------------ 8. screenshots round: hidden until complete
{
  const pics = [
    { name: 'welcome', state: 'default', width: 1280 },
    { name: 'welcome', state: 'default', width: 390 },
  ]
  const r = await call('POST', `/v1/projects/${project}/rounds`, {
    body: {
      round: 2,
      kind: 'screenshots',
      journeys: [{ id: 'onboarding', title: 'Owner onboarding', beats: beatHash([{ beat: 'I open the invite', screen: 'welcome', state: 'default' }]), steps: [{ beat: 'I open the invite', screen: 'welcome', state: 'default' }] }],
      screens: pics,
    },
  })
  check('push screenshots round 2 → 201 status uploading', r.status === 201 && r.data.status === 'uploading', `${r.status} ${JSON.stringify(r.data)}`)

  const latest0 = await call('GET', `${P}/state`, { auth: false })
  check('before any picture: reviewer still sees round 1', latest0.data.round?.n === 1, JSON.stringify(latest0.data.round))

  const up1 = await call('PUT', `/v1/projects/${project}/rounds/2/images/welcome--default--1280`, { raw: png(1280, 800, 200) })
  check('PUT picture 1 of 2 → 200 remaining 1', up1.status === 200 && up1.data.remaining === 1 && up1.data.status === 'uploading', JSON.stringify(up1.data))

  const latest1 = await call('GET', `${P}/state`, { auth: false })
  const explicit1 = await call('GET', `${P}/state?round=2`, { auth: false })
  const frame1 = await call('GET', `/p/${project}/__walkthrough/frame?screen=welcome&state=default&round=2`, { auth: false })
  check('after picture 1: latest round is still 1', latest1.data.round?.n === 1, JSON.stringify(latest1.data.round))
  check('after picture 1: ?round=2 → 404 (hidden)', explicit1.status === 404 && frame1.status === 404, `state ${explicit1.status}, frame ${frame1.status}`)

  const notPng = await call('PUT', `/v1/projects/${project}/rounds/2/images/welcome--default--390`, { raw: Buffer.from('not a png') })
  check('PUT non-PNG bytes → 400 not-png', notPng.status === 400 && notPng.data.error === 'not-png')

  const up2 = await call('PUT', `/v1/projects/${project}/rounds/2/images/welcome--default--390`, { raw: png(390, 844, 120) })
  check('PUT picture 2 of 2 → 200 remaining 0, status open', up2.status === 200 && up2.data.remaining === 0 && up2.data.status === 'open', JSON.stringify(up2.data))

  const latest2 = await call('GET', `${P}/state`, { auth: false })
  check('after picture 2: reviewer sees round 2 screenshots', latest2.data.round?.n === 2 && latest2.data.round.kind === 'screenshots', JSON.stringify(latest2.data.round))
  const j = latest2.data.journeys[0]
  check('screenshots round viewports = pushed widths', JSON.stringify(latest2.data.config.targets.viewports) === '["1280x0","390x0"]', JSON.stringify(latest2.data.config.targets.viewports))
  check('approval from round 1 is still there (the page can show it stale: beats differ)', latest2.data.approval.journeys.onboarding?.beats === beats && j.beats !== beats)

  const frame2 = await call('GET', `/p/${project}/__walkthrough/frame?screen=welcome&state=default`, { auth: false })
  check('frame → {kind:screenshots, images:[1280, 390]}', frame2.data.kind === 'screenshots' && frame2.data.images.map((i) => i.width).join(',') === '1280,390', JSON.stringify(frame2.data))
  const img = await call('GET', frame2.data.images[1].url, { auth: false })
  check('image URL serves the PNG bytes', img.status === 200 && img.type === 'image/png' && img.data.subarray(1, 4).toString() === 'PNG', `${img.status} ${img.type} ${img.data.length} bytes`)

  const wfFrame = await call('GET', `/p/${project}/__walkthrough/frame?screen=details&round=1`, { auth: false })
  check('frame ?round=1 → {kind:wireframe, spec}', wfFrame.data.kind === 'wireframe' && wfFrame.data.spec?.root === 'page')

  const shotNote = await call('POST', `${P}/notes`, {
    auth: false,
    body: {
      op: 'add',
      note: { screen: 'welcome', state: 'default', component: '__screen', key: '0', snippet: null, status: 'open', thread: [{ by: 'owner', text: 'Logo is blurry' }], anchor: { x: 0.2, y: 0.1, w: 0.1, h: 0.05, width: 390 } },
    },
  })
  const sn = shotNote.data.notes?.at(-1)
  check('owner note on a picture keeps its width and lands in round 2', sn?.anchor?.width === 390 && sn.round === 2, JSON.stringify(sn?.anchor))
}

// ------------------------------------------------------------------ 9. refusals: bad spec, duplicate round
{
  const bad = await call('POST', `/v1/projects/${project}/rounds`, {
    body: {
      round: 3,
      kind: 'wireframe',
      screens: [
        {
          name: 'broken',
          state: 'default',
          spec: {
            root: 'page',
            elements: {
              page: { type: 'Stack', props: {}, children: ['cta', 'ghost', 'wheel'] },
              cta: { type: 'Button', props: { text: 'Go' }, on: { press: { action: 'navigate', params: { to: 'nowhere' } } } },
              wheel: { type: 'Carousel', props: {} },
            },
          },
        },
      ],
    },
  })
  const codes = (bad.data.detail?.issues ?? []).map((i) => i.code)
  check('bad spec → 400 bad-spec', bad.status === 400 && bad.data.error === 'bad-spec' && bad.data.apiVersion === 1, `${bad.status} ${bad.data.error}`)
  check('issues include json-render missing_child + our unknown_component, bad_props, unknown_screen', ['missing_child', 'unknown_component', 'bad_props', 'unknown_screen'].every((c) => codes.includes(c)), codes.join(','))
  console.log(`      propCheck: ${bad.data.detail?.propCheck}`)
  for (const i of bad.data.detail?.issues ?? []) console.log(`      - [${i.code}] ${i.message}`)

  const dup = await call('POST', `/v1/projects/${project}/rounds`, { body: { ...wireframe, round: 1 } })
  check('duplicate round number → 409 round-exists', dup.status === 409 && dup.data.error === 'round-exists', `${dup.status} ${JSON.stringify(dup.data)}`)

  const beatsOff = await call('POST', `/v1/projects/${project}/rounds`, { body: { ...wireframe, round: 4, journeys: [{ ...wireframe.journeys[0], beats: 'aaaaaaaaaaaa' }] } })
  check('journey beats that do not match its steps → 400 beats-mismatch', beatsOff.status === 400 && beatsOff.data.error === 'beats-mismatch', `${beatsOff.status}`)
}

// ------------------------------------------------------------------ 10. mark + shell
{
  const m = await call('POST', `/v1/projects/${project}/rounds/1/mark`, { body: { status: 'answered' } })
  check('mark round 1 answered → 200', m.status === 200 && m.data.status === 'answered', JSON.stringify(m.data))
  const html = await fetch(`${BASE}/p/${project}/`)
  const text = await html.text()
  check('GET /p/<project>/ serves the reviewer shell (virtual entry)', html.status === 200 && text.includes('/@id/__x00__walkthrough:entry') && text.includes('/@vite/client'))
  const frameDoc = await fetch(`${BASE}/p/${project}/?frame=1`)
  check('GET /p/<project>/?frame=1 serves the same document', frameDoc.status === 200 && (await frameDoc.text()).includes('walkthrough:entry'))
}

console.log(`\nproject ${project}: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
