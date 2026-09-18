// AC-20260915-02-8, -9, -10, -13, -14: D6's server API (GET state, POST notes, POST approval,
// GET events/SSE), D9's viewport-driven device captions.
// AC-20260915-03-1, -3, -4, -7: specs/20260915/03's collapse onto one document/one entry — the
// page/frame-serving and D24-cookie assertions below are rewritten for the single `GET /`
// template (D1) and the `/@id/__x00__mock-review:entry` virtual module (D1), replacing spec 02's
// `/__mock-review/page/*` static asset route and the frame's `/@fs/<frame entry>` script tag.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, installPackageInto, run } from '../helpers/cli.js'
import { startServe, startServeIn, stopServe, type Serve } from '../helpers/serve.js'
import { ServerStateSchema } from '../../src/schemas/patches.js'
import { EMPTY_APPROVAL } from '../../src/schemas/index.js'

const ENTRY_URL = '/@id/__x00__mock-review:entry'

let serve: Serve | undefined

afterEach(async () => {
  await stopServe(serve)
  serve = undefined
})

type ServerState = {
  screens: { name: string }[]
  journeys: {
    id: string
    beats: string | null
    persona?: string
    steps: { screen: string; beat?: string; state?: string }[]
    edges: { from: number; to: number; label?: string; say?: string }[]
  }[]
  inventory: { name: string }[]
  notes: { notes: unknown[]; journeys: Record<string, unknown> }
  approval: { screens: Record<string, unknown>; journeys: Record<string, unknown>; theme: string | null }
  role: 'owner' | 'client'
}

async function getState(url: string, init?: RequestInit): Promise<ServerState> {
  const res = await fetch(`${url}/__mock-review/state`, init)
  expect(res.status).toBe(200)
  return (await res.json()) as ServerState
}

describe('mock-review server API (D6)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-03-1: GET / and GET /?frame=1 answer one HTML document through the entry id, with no page/@fs leftovers, and the entry module is one import ending src/ui/main.tsx', async () => {
    serve = await startServe(greenHost)

    for (const suffix of ['/', '/?frame=1']) {
      const res = await fetch(`${serve.url}${suffix}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      const html = await res.text()
      const scriptMatches = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)]
      const entryScriptMatches = scriptMatches.filter((match) => match[1] === ENTRY_URL)
      expect(entryScriptMatches).toHaveLength(1)
      expect(html).toContain('/@vite/client')
      expect(html).not.toContain('/__mock-review/page/')
      expect(html).not.toContain('/@fs/')
    }

    const entryRes = await fetch(`${serve.url}${ENTRY_URL}`)
    expect(entryRes.status).toBe(200)
    expect(entryRes.headers.get('content-type') ?? '').toMatch(/javascript/)
    const entryBody = (await entryRes.text()).trim()
    const importLines = entryBody
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => !/^\/\/# sourceMappingURL=/.test(line.trim()))
      .filter((line) => !/^\/\/# sourceURL=/.test(line.trim()))
    expect(importLines).toHaveLength(1)
    expect(importLines[0]).toMatch(/^import\s+["'][^"']+src\/ui\/main\.tsx["']/)
    expect(importLines[0]).toMatch(/src\/ui\/main\.tsx["']\s*$/)
  })

  it('AC-20260915-02-8: GET state reports screens/journeys/inventory/notes/approval and role owner, client when the mock-review-client cookie matches the config token', async () => {
    serve = await startServe(greenHost)
    const state = await getState(serve.url)
    expect(state.screens.map((s) => s.name)).toEqual(['account', 'home'])
    expect(state.journeys[0]?.id).toBe('first-visit')
    expect(state.inventory.map((i) => i.name)).toContain('WalletSummary')
    expect(state.notes).toBeDefined()
    expect(state.approval).toBeDefined()
    expect(state.role).toBe('owner')

    // AC-20260917-02-12 (D8): ApprovalSchema keeps `theme` — a document carrying a `theme` must
    // survive the schema and GET state must serve it back on `state.approval.theme`.
    const approvalPath = path.join(serve.host, 'design', 'approval.json')
    writeFileSync(
      approvalPath,
      JSON.stringify({ contractVersion: 2, screens: {}, journeys: {}, theme: 'nova' }),
    )
    const themedState = await getState(serve.url)
    expect(themedState.approval.theme).toBe('nova')

    // D24 (redesigned): the role travels in the `mock-review-client` cookie, not the Referer —
    // the frame's own sub-requests all carry the frame's URL as Referer with no token, so a
    // Referer-based rule would 403 a real remote client into a blank mock.
    const clientState = await getState(serve.url, {
      headers: { Cookie: 'mock-review-client=replace-me' },
    })
    expect(clientState.role).toBe('client')
  })

  // D2/D3: `documents` is a required, always-emitted field on `GET state` — one verdict per
  // design document, never a claim buried in whether `notes`/`approval` look empty.
  it('AC-20260917-04-3: GET state on the green fixture host includes documents {notes:{ok:true},approval:{ok:true}}; ServerStateSchema.parse succeeds on it, and fails when documents is omitted (required, not optional)', async () => {
    serve = await startServe(greenHost)
    const res = await fetch(`${serve.url}/__mock-review/state`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>

    expect(body.documents).toEqual({ notes: { ok: true }, approval: { ok: true } })
    expect(() => ServerStateSchema.parse(body)).not.toThrow()

    const withoutDocuments = { ...body }
    delete withoutDocuments.documents
    expect(() => ServerStateSchema.parse(withoutDocuments)).toThrow()
  })

  // D3: a failed read is reported through `documents`, and the served `approval`/`notes` stay the
  // documented EMPTY_* placeholder — never a claim the file itself is empty — while the sibling
  // document's own verdict and content are untouched.
  it('AC-20260917-04-4: a truncated design/approval.json reports documents.approval.ok false with a non-empty error naming the file, approval falls back to EMPTY_APPROVAL, and notes stays ok:true with the real on-disk document served', async () => {
    serve = await startServe(greenHost)
    const approvalPath = path.join(serve.host, 'design', 'approval.json')
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const realNotes = JSON.parse(readFileSync(notesPath, 'utf8')) as unknown
    writeFileSync(approvalPath, '{"contractVersion":')

    const state = await getState(serve.url)
    const anyState = state as unknown as {
      documents: { notes: { ok: boolean }; approval: { ok: boolean; error?: string } }
    }
    expect(anyState.documents.approval.ok).toBe(false)
    expect(anyState.documents.approval.error).toBeTruthy()
    expect(anyState.documents.approval.error).toContain('design/approval.json')
    expect(state.approval).toEqual(EMPTY_APPROVAL)
    expect(anyState.documents.notes.ok).toBe(true)
    expect(state.notes).toEqual(realNotes)
  })

  // D3: a failed design-document read must never empty an analysis-derived field — screens,
  // shells, journeys and config all come from the discovery/analysis layer, not from
  // design/notes.json or design/approval.json.
  it('AC-20260917-04-5: an unreadable design/notes.json never empties screens, shells, journeys or config on the green fixture host', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    writeFileSync(notesPath, '{"contractVersion":')

    const state = await getState(serve.url)
    const anyState = state as unknown as { shells: unknown[]; config: { name: string | null } }
    expect(state.screens).toHaveLength(2)
    expect(anyState.shells.length).toBeGreaterThan(0)
    expect(state.journeys).toHaveLength(1)
    expect(anyState.config.name).not.toBeNull()
  })

  it('AC-20260915-02-9 / AC-20260918-01-7: POST notes {op:add} persists to design/notes.json with no leftover .tmp, emits exactly one notes SSE event for that write, and answer over the CLI reaches an SSE notes event within 2s', async () => {
    serve = await startServe(greenHost)

    // Open the event stream BEFORE the POST so the POST's own `notes` event is observable,
    // and count every `notes` event seen over a 2s window rather than returning on the first.
    const preRes = await fetch(`${serve.url}/__mock-review/events`)
    expect(preRes.status).toBe(200)
    const preReader = preRes.body?.getReader()
    expect(preReader).toBeDefined()

    let notesEventsFromPost = 0
    const readLoop = (async () => {
      if (!preReader) return
      const decoder = new TextDecoder()
      let buf = ''
      try {
        while (true) {
          const { value, done } = await preReader.read()
          if (done) return
          buf += decoder.decode(value, { stream: true })
          notesEventsFromPost = (buf.match(/event: notes/g) ?? []).length
        }
      } catch {
        // reader cancelled below once the counting window closes
      }
    })()

    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: 'home',
          state: 'Default',
          component: 'WalletSummary',
          key: '0',
          snippet: 'Balance',
          status: 'open',
          thread: [{ by: 'owner', text: 'bigger' }],
        },
      }),
    })
    expect(addRes.status).toBe(200)
    const addedDoc = (await addRes.json()) as { notes: { id: string }[] }
    expect(addedDoc.notes.some((n) => n.id === 'N001')).toBe(true)

    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const onDisk = JSON.parse(readFileSync(notesPath, 'utf8'))
    expect(onDisk).toEqual(addedDoc)

    // D1 retired the fixed `notes.json.tmp` name in favour of `notes.json.<pid>.<hex>.tmp`;
    // scan the directory rather than checking a name that can never be observed leftover.
    const designFiles = readdirSync(path.join(serve.host, 'design'))
    expect(designFiles.some((f) => f.endsWith('.tmp'))).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 2000))
    await preReader?.cancel()
    await readLoop
    expect(notesEventsFromPost).toBe(1)

    const eventsRes = await fetch(`${serve.url}/__mock-review/events`)
    expect(eventsRes.status).toBe(200)
    const reader = eventsRes.body?.getReader()
    expect(reader).toBeDefined()

    const waitForNotesEvent = (async () => {
      const decoder = new TextDecoder()
      let buf = ''
      while (reader) {
        const { value, done } = await reader.read()
        if (done) throw new Error('SSE stream ended before a notes event')
        buf += decoder.decode(value, { stream: true })
        if (buf.includes('event: notes')) return
      }
    })()

    const answerResult = run(serve.host, ['answer', '--note', 'N001', '--text', 'done'])
    expect(answerResult.status).toBe(0)

    await Promise.race([
      waitForNotesEvent,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no notes SSE event within 2s')), 2000)),
    ])
    reader?.cancel()

    const after = await getState(serve.url)
    const n1 = (after.notes.notes as { id: string; status: string }[]).find((n) => n.id === 'N001')
    expect(n1?.status).toBe('answered')
  }, 20_000)

  // AC-20260918-01-8, tagged [pre-green: absence-invariant]: a project note (no screen, so rule 6
  // — which un/re-approves a screen a note targets — can never fire for it) must never touch
  // design/approval.json. True before this spec (rule 6 already only fires for a screen-anchored
  // note) and stays true after — kept as a named invariant, not dropped, because D2's lock wraps
  // this exact write and must not start touching approval.json as a side effect of taking it.
  it('AC-20260918-01-8 [pre-green: absence-invariant]: a project:true note add leaves design/approval.json byte-identical when a screen is already approved', async () => {
    serve = await startServe(greenHost)
    const approvalPath = path.join(serve.host, 'design', 'approval.json')

    const approveRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'approveScreen', name: 'home' }),
    })
    expect(approveRes.status).toBe(200)
    const before = readFileSync(approvalPath, 'utf8')

    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: null,
          state: null,
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'project-wide note' }],
          project: true,
        },
      }),
    })
    expect(addRes.status).toBe(200)

    expect(readFileSync(approvalPath, 'utf8')).toBe(before)
  })

  // AC-20260918-01-9: a POST that cannot acquire `design/.lock` within the acquire window answers
  // 503 with the lock sentence as its `error` body — distinct from the 409 an unreadable document
  // already uses. The lock file's holder is this test process's own pid (alive — `process.kill(pid,
  // 0)` never throws ESRCH for it) with a fresh mtime (not stale), so the server can neither break
  // it nor ever see it released; it must retry for ~2s and then refuse rather than hang.
  it('AC-20260918-01-9: POST notes answers 503 with the lock sentence when design/.lock stays held past the acquire window', async () => {
    serve = await startServe(greenHost)
    const lockPath = path.join(serve.host, 'design', '.lock')
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))

    const res = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'locked out' }],
        },
      }),
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/^design\/ is locked by pid \d+ — another mock-review write is in progress; retry$/)
  }, 10_000)

  it('AC-20260915-02-10: a client-role request may only add notes / clientOk approval; anything else is 403', async () => {
    serve = await startServe(greenHost)
    const clientUrl = `${serve.url}/__mock-review/notes?client=replace-me`

    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const before = readFileSync(notesPath, 'utf8')

    const removeRes = await fetch(clientUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'remove', id: 'N001' }),
    })
    expect(removeRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

    const addRes = await fetch(clientUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'x' }],
        },
      }),
    })
    expect(addRes.status).toBe(200)
    const doc = (await addRes.json()) as { notes: { thread: { by: string }[] }[] }
    expect(doc.notes[doc.notes.length - 1]?.thread[0]?.by).toBe('client')

    const approveScreenRes = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'approveScreen', name: 'home' }),
    })
    expect(approveScreenRes.status).toBe(403)

    // AC-20260917-02-7/-9/-10 (D7): `clientOk` now requires the story hash `GET state` served —
    // fetch it first rather than hand-typing a literal that would drift from the fixture's beats.
    const state = await getState(serve.url)
    const beats = (state.journeys[0] as unknown as { beats: string | null })?.beats
    expect(typeof beats).toBe('string')
    const clientOkRes = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'clientOk', id: 'first-visit', beats }),
    })
    expect(clientOkRes.status).toBe(200)
    const approval = (await clientOkRes.json()) as { journeys: Record<string, { client: string | null }> }
    expect(approval.journeys['first-visit']?.client).toBe('ok')
  })

  // AC-20260917-02-15/-16 (D10, D11): the narrow `close` op — a client may end a note or journey
  // conversation THEY THEMSELVES opened; the 404 unknown-id pre-check runs before any ownership
  // check; a client may never set a journey status directly through `op:'journey'`.
  it('AC-20260917-02-15: close op — client owns their own note, is refused another\'s, unknown id is 404 before ownership, owner may close any note', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')

    // A note whose thread[0].by is 'client' (added by the client, forced by clientNotesPatch).
    const clientAddRes = await fetch(`${serve.url}/__mock-review/notes?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: { screen: 'home', state: 'Default', component: null, key: null, snippet: null, status: 'open', thread: [{ by: 'owner', text: 'mine' }] },
      }),
    })
    expect(clientAddRes.status).toBe(200)
    const clientDoc = (await clientAddRes.json()) as { notes: { id: string; thread: { by: string }[] }[] }
    const clientNoteId = clientDoc.notes[clientDoc.notes.length - 1]?.id as string
    expect(clientDoc.notes.find((n) => n.id === clientNoteId)?.thread[0]?.by).toBe('client')

    // A note whose thread[0].by is 'session' (owner-added).
    const ownerAddRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: { screen: 'home', state: 'Default', component: null, key: null, snippet: null, status: 'open', thread: [{ by: 'session', text: 'not yours' }] },
      }),
    })
    expect(ownerAddRes.status).toBe(200)
    const ownerDoc = (await ownerAddRes.json()) as { notes: { id: string }[] }
    const sessionNoteId = ownerDoc.notes[ownerDoc.notes.length - 1]?.id as string

    // Client closes their own note: 200, status persisted deferred.
    const closeOwnRes = await fetch(`${serve.url}/__mock-review/notes?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'close', id: clientNoteId, status: 'deferred' }),
    })
    expect(closeOwnRes.status).toBe(200)
    const afterOwn = JSON.parse(readFileSync(notesPath, 'utf8')) as { notes: { id: string; status: string }[] }
    expect(afterOwn.notes.find((n) => n.id === clientNoteId)?.status).toBe('deferred')

    // Client tries to close a session-raised note: 403, file byte-identical.
    const beforeSession = readFileSync(notesPath, 'utf8')
    const closeOthersRes = await fetch(`${serve.url}/__mock-review/notes?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'close', id: sessionNoteId, status: 'deferred' }),
    })
    expect(closeOthersRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(beforeSession)

    // Unknown id: 404 before any ownership check, file byte-identical.
    const beforeUnknown = readFileSync(notesPath, 'utf8')
    const closeUnknownRes = await fetch(`${serve.url}/__mock-review/notes?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'close', id: 'N999', status: 'deferred' }),
    })
    expect(closeUnknownRes.status).toBe(404)
    expect(readFileSync(notesPath, 'utf8')).toBe(beforeUnknown)

    // Owner-role may close any note, regardless of who raised it.
    const ownerCloseSessionRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'close', id: sessionNoteId, status: 'approved' }),
    })
    expect(ownerCloseSessionRes.status).toBe(200)
  })

  // AC-20260917-02-16 (D11): a client may never set a journey status directly through
  // `op:'journey'`; an owner may `close` a journey conversation instead, and its status lands
  // in notes.journeys[id].status, the key `--mark approved` reads for its exclusion rows.
  it('AC-20260917-02-16: op:\'journey\' is refused for a client (403, no entry point), owner close on a journey persists notes.journeys[id].status', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')

    // AC-16: a client may not set a journey status directly with op:'journey' (no entry) — 403.
    const clientJourneyRes = await fetch(`${serve.url}/__mock-review/notes?client=replace-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'journey', id: 'first-visit', status: 'deferred' }),
    })
    expect(clientJourneyRes.status).toBe(403)

    // AC-16: an owner may `close` a journey conversation; its status lands in
    // notes.journeys[id].status, the key `--mark approved` reads for its exclusion rows.
    const ownerCloseJourneyRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'close', id: 'first-visit', status: 'deferred' }),
    })
    expect(ownerCloseJourneyRes.status).toBe(200)
    const afterJourney = JSON.parse(readFileSync(notesPath, 'utf8')) as { journeys: Record<string, { status: string }> }
    expect(afterJourney.journeys['first-visit']?.status).toBe('deferred')
  })

  // AC-20260917-02-6 (D5/D6): GET state's journeys carry the story fields, and `beats` is a
  // 12-character hex string computed over the RAW steps — never `undefined`/missing.
  it('AC-20260917-02-6: GET state includes journeys[0].beats (12-hex), persona, steps[*].beat and edges[*].say', async () => {
    serve = await startServe(greenHost)
    const state = await getState(serve.url)
    const journey = state.journeys[0]
    expect(journey?.beats).toMatch(/^[0-9a-f]{12}$/)
    expect(journey?.persona).toBe('a new customer')
    expect(journey?.steps[0]?.beat).toBe('I open the app')
    expect(journey?.steps[1]?.beat).toBe('I land on my account')
    expect(journey?.edges[0]?.say).toBe('I tap Account')
  })

  it('AC-20260917-02-6: a journey with a beat-less step serves journeys[0].beats === null', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-serve-beatless-')
    const journeysFile = path.join(host, 'src', 'journeys.ts')
    const journeysSrc = readFileSync(journeysFile, 'utf8')
    const beatless = journeysSrc.replace(
      "{ screen: 'account', beat: 'I land on my account', state: 'default' }",
      "{ screen: 'account' }",
    )
    expect(beatless).not.toBe(journeysSrc)
    writeFileSync(journeysFile, beatless)

    serve = await startServeIn(host)
    const state = await getState(serve.url)
    expect(state.journeys[0]?.beats).toBeNull()
  })

  // AC-20260917-02-7/-9/-10 (D7): the confirm round trip's three refusals and its success, in
  // full — this is the whole If-Match hazard the spec exists to close.
  describe('AC-20260917-02-7/-9/-10: POST approval clientOk (D7)', () => {
    it('AC-20260917-02-7: a client posting the hash GET state served gets 200 and design/approval.json carries exactly client/beats/at (no approvedAt)', async () => {
      serve = await startServe(greenHost)
      const state = await getState(serve.url)
      const beats = state.journeys[0]?.beats
      expect(typeof beats).toBe('string')

      const res = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'clientOk', id: 'first-visit', beats }),
      })
      expect(res.status).toBe(200)

      const approvalPath = path.join(serve.host, 'design', 'approval.json')
      const onDisk = JSON.parse(readFileSync(approvalPath, 'utf8')) as { journeys: Record<string, Record<string, unknown>> }
      const entry = onDisk.journeys['first-visit']
      expect(entry).toBeDefined()
      expect(Object.keys(entry ?? {}).sort()).toEqual(['at', 'beats', 'client'])
      expect(entry?.client).toBe('ok')
      expect(entry?.beats).toBe(beats)
    })

    it('AC-20260917-02-9: a stale beats value is refused 409 with the exact reload message, and the file is left byte-identical', async () => {
      serve = await startServe(greenHost)
      const approvalPath = path.join(serve.host, 'design', 'approval.json')
      const before = readFileSync(approvalPath, 'utf8')

      const res = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'clientOk', id: 'first-visit', beats: 'deadbeef0000' }),
      })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'story changed since it was shown — reload' })
      expect(readFileSync(approvalPath, 'utf8')).toBe(before)
    })

    it('AC-20260917-02-10: unknown journey id, null-beats journey, and a missing beats field are each refused 400 with the exact bodies, file byte-identical throughout', async () => {
      serve = await startServe(greenHost)
      const approvalPath = path.join(serve.host, 'design', 'approval.json')

      const beforeGhost = readFileSync(approvalPath, 'utf8')
      const ghostRes = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'clientOk', id: 'ghost', beats: 'deadbeef0000' }),
      })
      expect(ghostRes.status).toBe(400)
      expect(await ghostRes.json()).toEqual({ error: 'unknown journey ghost' })
      expect(readFileSync(approvalPath, 'utf8')).toBe(beforeGhost)

      // A beat-less host's journey serves `beats: null` — confirming it is refused.
      const beatlessHost = copyFixtureHost(greenHost, 'mock-review-serve-confirm-beatless-')
      const journeysFile = path.join(beatlessHost, 'src', 'journeys.ts')
      const journeysSrc = readFileSync(journeysFile, 'utf8')
      const beatless = journeysSrc.replace(
        "{ screen: 'account', beat: 'I land on my account', state: 'default' }",
        "{ screen: 'account' }",
      )
      expect(beatless).not.toBe(journeysSrc)
      writeFileSync(journeysFile, beatless)
      let beatlessServe: Serve | undefined
      try {
        beatlessServe = await startServeIn(beatlessHost)
        const beatlessApprovalPath = path.join(beatlessHost, 'design', 'approval.json')
        const beforeBeatless = readFileSync(beatlessApprovalPath, 'utf8')
        const beatlessRes = await fetch(`${beatlessServe.url}/__mock-review/approval?client=replace-me`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'clientOk', id: 'first-visit', beats: 'deadbeef0000' }),
        })
        expect(beatlessRes.status).toBe(400)
        expect(await beatlessRes.json()).toEqual({
          error: 'journey first-visit has no beats — every step needs a sentence before a client can confirm it',
        })
        expect(readFileSync(beatlessApprovalPath, 'utf8')).toBe(beforeBeatless)
      } finally {
        await stopServe(beatlessServe)
      }

      const beforeMissing = readFileSync(approvalPath, 'utf8')
      const missingRes = await fetch(`${serve.url}/__mock-review/approval?client=replace-me`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'clientOk', id: 'first-visit' }),
      })
      expect(missingRes.status).toBe(400)
      expect(await missingRes.json()).toEqual({ error: 'invalid approval patch' })
      expect(readFileSync(approvalPath, 'utf8')).toBe(beforeMissing)
    })
  })

  // AC-20260917-02-11 (D8): the exact document the plugin's shipped `client waive` writes — no
  // `approvedAt` — must parse, serve intact, and survive an unrelated theme patch unchanged.
  it('AC-20260917-02-11: a waived journey entry with no approvedAt parses, serves intact from GET state, and survives an unrelated theme patch', async () => {
    serve = await startServe(greenHost)
    const approvalPath = path.join(serve.host, 'design', 'approval.json')
    const waived = {
      contractVersion: 2,
      screens: {},
      journeys: {
        'first-visit': { client: 'waived', reason: 'no client', at: '2026-09-17T00:00:00.000Z', beats: '7c0be20327a0' },
      },
      theme: null,
    }
    writeFileSync(approvalPath, JSON.stringify(waived))

    const state = await getState(serve.url)
    expect(state.approval.journeys['first-visit']).toEqual(waived.journeys['first-visit'])
    expect(state.approval.journeys).not.toEqual({})

    const themeRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'theme', key: 'nova' }),
    })
    expect(themeRes.status).toBe(200)
    const themed = (await themeRes.json()) as { journeys: Record<string, unknown>; theme: string | null }
    expect(themed.theme).toBe('nova')
    expect(themed.journeys['first-visit']).toEqual(waived.journeys['first-visit'])
  })

  it('AC-20260915-03-7 (AC-20260915-02-8/-10, D24): ?client= sets a Set-Cookie, the cookie alone grants client from a forwarded request across every gated route including the entry and its module import, and a Referer-only token or a stale/missing cookie is 403 with no file changed', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const before = readFileSync(notesPath, 'utf8')
    // `X-Forwarded-For` is how a remote client is imitated while every request still physically
    // arrives over loopback (D24: otherwise `owner` only for a loopback socket with none of
    // X-Forwarded-For/Forwarded/Cf-Connecting-Ip present).
    const forwarded = { 'x-forwarded-for': '203.0.113.9' }

    // A ?client= request (even forwarded) that matches the token is `client`, answers the entry
    // document, and sets the cookie.
    const setCookieRes = await fetch(`${serve.url}/?client=replace-me`, { headers: forwarded })
    expect(setCookieRes.status).toBe(200)
    expect(setCookieRes.headers.get('set-cookie')).toBe('mock-review-client=replace-me; Path=/; HttpOnly; SameSite=Lax')
    expect(await setCookieRes.text()).toContain(ENTRY_URL)

    // The cookie alone (no ?client=, still forwarded) is enough for every gated route the D1
    // single-document design makes: `/`, `/?frame=1`, the entry module, the module URL that entry
    // imports, `state` (role: client), and `events` — the mechanism a remote client's browser
    // actually uses once the cookie is set, and the exact case the plugin's earlier Referer-based
    // draft failed (the frame's sub-requests carry the frame's own URL as Referer, never the
    // token).
    const cookieHeaders = { ...forwarded, Cookie: 'mock-review-client=replace-me' }

    const ownerRes = await fetch(`${serve.url}/`, { headers: cookieHeaders })
    expect(ownerRes.status).toBe(200)

    const frameRes = await fetch(`${serve.url}/?frame=1`, { headers: cookieHeaders })
    expect(frameRes.status).toBe(200)

    const entryRes = await fetch(`${serve.url}${ENTRY_URL}`, { headers: cookieHeaders })
    expect(entryRes.status).toBe(200)
    const entryBody = await entryRes.text()
    const importMatch = /import\s+["']([^"']+)["']/.exec(entryBody)
    expect(importMatch).not.toBeNull()
    const importedModuleUrl = importMatch?.[1] ?? ''
    const importedModuleRes = await fetch(`${serve.url}${importedModuleUrl}`, { headers: cookieHeaders })
    expect(importedModuleRes.status).toBe(200)

    const cookieStateRes = await fetch(`${serve.url}/__mock-review/state`, { headers: cookieHeaders })
    expect(cookieStateRes.status).toBe(200)
    const cookieState = (await cookieStateRes.json()) as ServerState
    expect(cookieState.role).toBe('client')

    const cookieEventsRes = await fetch(`${serve.url}/__mock-review/events`, { headers: cookieHeaders })
    expect(cookieEventsRes.status).toBe(200)
    await cookieEventsRes.body?.cancel()

    // A forwarded request with no cookie and no ?client= is refused for `state`.
    const noCookieStateRes = await fetch(`${serve.url}/__mock-review/state`, { headers: forwarded })
    expect(noCookieStateRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

    // A forwarded request whose only token carrier is the Referer (no cookie, no ?client=) is
    // refused — the Referer is never consulted (D24's rationale: the spike that killed the first
    // draft).
    const refererOnlyRes = await fetch(`${serve.url}/__mock-review/state`, {
      headers: { ...forwarded, Referer: `${serve.url}/?client=replace-me` },
    })
    expect(refererOnlyRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

    // A forwarded request with a stale/wrong cookie value is refused too.
    const staleCookieRes = await fetch(`${serve.url}/__mock-review/state`, {
      headers: { ...forwarded, Cookie: 'mock-review-client=stale' },
    })
    expect(staleCookieRes.status).toBe(403)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)

    // Plain loopback (no forwarding header, no token) keeps working exactly as before.
    const loopbackRes = await fetch(`${serve.url}/`)
    expect(loopbackRes.status).toBe(200)

    // `ping` stays open regardless.
    const pingRes = await fetch(`${serve.url}/__mock-review/ping`, { headers: forwarded })
    expect(pingRes.status).toBe(200)
  })

  it('AC-20260915-02-8/-9/-11 (D23) / AC-20260917-03-17: approveScreen for an unknown screen is 400 and writes nothing; a non-JSON body is 400, not 500; add ignores a caller id; update/remove of an unknown id is 404', async () => {
    serve = await startServe(greenHost)
    const approvalPath = path.join(serve.host, 'design', 'approval.json')
    const notesPath = path.join(serve.host, 'design', 'notes.json')

    const approvalBefore = readFileSync(approvalPath, 'utf8')
    const unknownScreenRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'approveScreen', name: 'does-not-exist' }),
    })
    expect(unknownScreenRes.status).toBe(400)
    expect(readFileSync(approvalPath, 'utf8')).toBe(approvalBefore)

    const notesBefore = readFileSync(notesPath, 'utf8')
    const nonJsonRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all {{{',
    })
    expect(nonJsonRes.status).toBe(400)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)

    const callerIdRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          id: 'N999',
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'ignored id' }],
        },
      }),
    })
    // NotesPatchSchema's `add.note` is `NoteSchema.omit({id:true}).strict()` — a caller-supplied
    // `id` is an unrecognized key, so the whole patch is refused rather than silently honored.
    expect(callerIdRes.status).toBe(400)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)

    const updateUnknownRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'update', id: 'N999', fields: { status: 'approved' } }),
    })
    expect(updateUnknownRes.status).toBe(404)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)

    const removeUnknownRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'remove', id: 'N999' }),
    })
    expect(removeUnknownRes.status).toBe(404)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)
  })

  it('review pass 3: an unparseable design file answers 409 (a conflict with on-disk state, not a bad request) and is left byte-identical', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const approvalPath = path.join(serve.host, 'design', 'approval.json')

    const corruptNotes = '{ not valid json at all'
    writeFileSync(notesPath, corruptNotes)
    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: { screen: 'home', state: 'Default', component: null, key: null, snippet: null, status: 'open', thread: [{ by: 'owner', text: 'x' }] },
      }),
    })
    expect(addRes.status).toBe(409)
    expect(readFileSync(notesPath, 'utf8')).toBe(corruptNotes)

    const corruptApproval = '{ also not valid json'
    writeFileSync(approvalPath, corruptApproval)
    const approveRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'theme', key: 'nova' }),
    })
    expect(approveRes.status).toBe(409)
    expect(readFileSync(approvalPath, 'utf8')).toBe(corruptApproval)
  })

  it('AC-20260917-01-12: a note patch migrates v1 notes.json to contractVersion 2 with notes/journeys intact and leaves approval.json byte-identical at 1; a theme patch migrates approval.json to 2; a v3 approval.json is refused 409 byte-identical', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')
    const approvalPath = path.join(serve.host, 'design', 'approval.json')

    const v1Notes = {
      contractVersion: 1,
      notes: [
        {
          id: 'N001',
          screen: 'home',
          state: 'Default',
          component: 'WalletSummary',
          key: '0',
          snippet: 'Balance',
          status: 'open',
          thread: [{ by: 'owner', text: 'bigger' }],
        },
      ],
      journeys: {
        'first-visit': { status: 'open', thread: [{ by: 'owner', text: 'looks right' }] },
      },
    }
    const v1Approval = {
      contractVersion: 1,
      screens: {},
      journeys: {},
      theme: null,
    }
    writeFileSync(notesPath, JSON.stringify(v1Notes))
    writeFileSync(approvalPath, JSON.stringify(v1Approval))
    const approvalBefore = readFileSync(approvalPath, 'utf8')

    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'migrate on write' }],
        },
      }),
    })
    expect(addRes.status).toBe(200)
    const addedDoc = (await addRes.json()) as {
      contractVersion: number
      notes: { id: string }[]
      journeys: Record<string, unknown>
    }
    expect(addedDoc.contractVersion).toBe(2)
    const carriedNote = addedDoc.notes.find((n) => n.id === 'N001') as { thread: { text: string }[] } | undefined
    expect(carriedNote?.thread[0]?.text).toBe('bigger')
    expect(addedDoc.journeys['first-visit']).toEqual(v1Notes.journeys['first-visit'])

    const onDiskNotes = JSON.parse(readFileSync(notesPath, 'utf8'))
    expect(onDiskNotes.contractVersion).toBe(2)
    expect(onDiskNotes).toEqual(addedDoc)

    // The add patch never touches approval (`result.approval !== approval` guard) — the v1 file
    // is left byte-identical, not merely equal after a round-trip through the same version.
    expect(readFileSync(approvalPath, 'utf8')).toBe(approvalBefore)

    const themeRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'theme', key: 'nova' }),
    })
    expect(themeRes.status).toBe(200)
    const themedDoc = (await themeRes.json()) as { contractVersion: number; theme: string | null }
    expect(themedDoc.contractVersion).toBe(2)
    expect(themedDoc.theme).toBe('nova')

    const onDiskApproval = JSON.parse(readFileSync(approvalPath, 'utf8'))
    expect(onDiskApproval.contractVersion).toBe(2)
    expect(onDiskApproval).toEqual(themedDoc)

    const v3Approval = { contractVersion: 3, screens: {}, journeys: {}, theme: 'nova' }
    writeFileSync(approvalPath, JSON.stringify(v3Approval))
    const v3Before = readFileSync(approvalPath, 'utf8')
    const refusedRes = await fetch(`${serve.url}/__mock-review/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'theme', key: 'classic' }),
    })
    expect(refusedRes.status).toBe(409)
    expect(readFileSync(approvalPath, 'utf8')).toBe(v3Before)
  })

  it('AC-20260915-02-9 (D23): the SSE stream disposes itself when the client connection drops, without breaking later connections or notes writes', async () => {
    serve = await startServe(greenHost)

    const controller = new AbortController()
    const droppedRes = await fetch(`${serve.url}/__mock-review/events`, { signal: controller.signal })
    expect(droppedRes.status).toBe(200)
    // Read the stream's opening blank line (handleEvents' `res.write('\n')`) so the connection is
    // fully established before it's dropped — aborting before any bytes arrive would test
    // connection setup racing teardown, not the dispose path this AC is about.
    const reader = droppedRes.body?.getReader()
    await reader?.read()
    controller.abort()
    // `req.on('close', dispose)` / `res.on('error', dispose)` run on the server's own event loop
    // tick, not synchronously with the client's abort.
    await new Promise((resolve) => setTimeout(resolve, 300))

    // A write that would otherwise reach the dropped connection's watcher listener (an `add`
    // reaching design/notes.json) must not crash the server — `handleEvents`' own `if
    // (res.writableEnded) return` guard, plus the dispose above, both exist for exactly this.
    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: { screen: 'home', state: 'Default', component: null, key: null, snippet: null, status: 'open', thread: [{ by: 'owner', text: 'sse dispose' }] },
      }),
    })
    expect(addRes.status).toBe(200)
    const addedDoc = (await addRes.json()) as { notes: { id: string }[] }
    const noteId = addedDoc.notes[addedDoc.notes.length - 1]?.id as string

    // Let that write's own filesystem event (and the (harmlessly ignored) attempt to reach the
    // now-disposed watcher) fully settle before opening a second connection, so the CLI `answer`
    // below produces one unambiguous `change` for the fresh listener to catch, not one racing the
    // tail of the previous write.
    await new Promise((resolve) => setTimeout(resolve, 300))

    // A fresh SSE connection opened after the dropped one still receives events normally — the
    // disposed watcher's listeners were actually removed (D23's own doc: "or they leak for the
    // rest of the serve process's life"), not merely ignored by a lingering broken listener. Same
    // trigger (CLI `answer` over the built binary) and window as AC-9's own already-proven SSE
    // check above.
    const freshRes = await fetch(`${serve.url}/__mock-review/events`)
    expect(freshRes.status).toBe(200)
    const freshReader = freshRes.body?.getReader()

    const waitForNotesEvent = (async () => {
      const decoder = new TextDecoder()
      let buf = ''
      while (freshReader) {
        const { value, done } = await freshReader.read()
        if (done) throw new Error('SSE stream ended before a notes event')
        buf += decoder.decode(value, { stream: true })
        if (buf.includes('event: notes')) return
      }
    })()

    const answerResult = run(serve.host, ['answer', '--note', noteId, '--text', 'after dispose'])
    expect(answerResult.status).toBe(0)

    await Promise.race([
      waitForNotesEvent,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no notes SSE event within 5s on the fresh connection')), 5000)),
    ])
    freshReader?.cancel()
  }, 20_000)

  describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-03-3/-4: one document, one entry, CSS isolation and production safety [env: SKIP_BROWSER]', () => {
    it('AC-20260915-03-3 / AC-20260915-04-10: serves the frame with the shell rendered, no reviewer chrome or sidebar CSS, exactly the entry + frame/mount URLs under src/ui/, and toggles html.dark on &scheme=dark', async () => {
      serve = await startServe(greenHost)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${serve.url}/?frame=1#/home?state=Default`, { waitUntil: 'networkidle' })
        await expect.poll(() => page.locator('[data-component="ConsoleShell"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[data-component="ConsoleShell"] button[data-to="Account"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[data-sidebar]').count()).toBe(0)

        // D2/D3: the frame's own module graph never loads the reviewer's index.css, so no
        // stylesheet in this document defines the reviewer's `--sidebar-width` token.
        const hasSidebarWidthRule = await page.evaluate(() => {
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              for (const rule of Array.from(sheet.cssRules)) {
                if (rule.cssText.includes('--sidebar-width')) return true
              }
            } catch {
              // a cross-origin stylesheet throws on .cssRules; none exist in this document.
            }
          }
          return false
        })
        expect(hasSidebarWidthRule).toBe(false)

        // AC-3: resource timing carries exactly one src/ui/main.tsx URL (the entry, loaded once
        // by the outer reviewer document, visible here because same-origin timing entries include
        // cross-frame navigations within the same top-level browsing context in this Playwright
        // page), one src/ui/frame/mount.tsx URL (D2's frame branch), one src/ui/frame/frameRoute.ts
        // URL (specs/20260915/04 D9 — the import-free hash grammar mount.tsx parses with) and —
        // since specs/20260916/03 D10 — one src/ui/frame/stateKey.ts URL (mount.tsx's `pickExample`
        // now resolves through the shared `resolveState`, so the frame's module graph legitimately
        // pulls in the state-key resolver too), and no other src/ui/ URL.
        const srcUiUrls = await page.evaluate(() =>
          performance.getEntriesByType('resource').map((e) => e.name).filter((name) => name.includes('src/ui/')),
        )
        const allowed = [
          'src/ui/main.tsx',
          'src/ui/frame/mount.tsx',
          'src/ui/frame/frameRoute.ts',
          'src/ui/frame/stateKey.ts',
        ]
        expect(srcUiUrls.filter((u) => u.endsWith('src/ui/main.tsx'))).toHaveLength(1)
        expect(srcUiUrls.filter((u) => u.endsWith('src/ui/frame/mount.tsx'))).toHaveLength(1)
        expect(srcUiUrls.filter((u) => u.endsWith('src/ui/frame/frameRoute.ts'))).toHaveLength(1)
        expect(srcUiUrls.filter((u) => u.endsWith('src/ui/frame/stateKey.ts'))).toHaveLength(1)
        expect(srcUiUrls.filter((u) => !allowed.some((a) => u.endsWith(a)))).toEqual([])

        await page.goto(`${serve.url}/?frame=1#/home?state=Default&scheme=dark`, { waitUntil: 'networkidle' })
        const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        expect(hasDark).toBe(true)
      } finally {
        await browser.close()
      }
    }, 30_000)

    it('AC-20260915-03-4: a host mounting mockReview() in its own vite.config.ts builds clean with no reviewer marker, and serve still answers the entry (double mount)', async () => {
      // D18/D5: the fixture host ships no package.json or index.html (it is only ever loaded
      // through the reviewer's own routes, never as a standalone Vite app). Give the *scratch
      // copy only* (never the committed fixture) an ESM package.json, a minimal HTML entry
      // pointing at a real host module, and a vite.config.ts that also mounts mockReview() —
      // exactly D5's documented host requirements and D4's double-mount case.
      // A JSX dev-source annotation embeds the *absolute* scratch path, which (per this repo's
      // own directory name) can itself contain the literal "mock-review" — strip every literal
      // occurrence of the scratch host's own absolute path out of each file's content before
      // searching, so the assertion is immune to *where* the OS happens to put temp files.
      const host = copyFixtureHost(greenHost, 'reviewer-vitebuild-')
      writeFileSync(path.join(host, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }))
      writeFileSync(
        path.join(host, 'index.html'),
        [
          '<!doctype html>',
          '<html>',
          '  <body>',
          '    <script type="module" src="/src/screens/home.tsx"></script>',
          '  </body>',
          '</html>',
          '',
        ].join('\n'),
      )
      writeFileSync(
        path.join(host, 'vite.config.ts'),
        [
          "import { defineConfig } from 'vite'",
          "import react from '@vitejs/plugin-react'",
          "import tailwindcss from '@tailwindcss/vite'",
          "import { mockReview } from '@555-ventures/mock-review/vite'",
          '',
          'export default defineConfig({',
          '  plugins: [react(), tailwindcss(), mockReview()],',
          '})',
          '',
        ].join('\n'),
      )
      // D7/D8: materialises the package under this scratch host's own `node_modules/@555-ventures/mock-review/`
      // exactly as a real install would (`.test-dist/` as `dist/`, `src/ui/` as source, its own
      // `package.json` so the `exports` map's `"./vite"` entry resolves `@555-ventures/mock-review/vite` to
      // `dist/vite.js`) — the host's `vite.config.ts` above imports it by its real package
      // specifier, not a hand-rolled path, so this exercises the same resolution a published
      // install would.
      installPackageInto(host)

      const result = spawnSync('npx', ['vite', 'build', '--outDir', 'dist'], { cwd: host, encoding: 'utf8' })
      expect(result.status).toBe(0)
      const outDir = path.join(host, 'dist')
      const files = existsSync(outDir) ? (readdirSync(outDir, { recursive: true }) as string[]) : []
      const textFiles = files.filter((f) => /\.(js|css|html)$/.test(f))
      expect(textFiles.length).toBeGreaterThan(0)
      const offending = textFiles.filter((f) => {
        const raw = readFileSync(path.join(outDir, f), 'utf8')
        const withoutScratchPath = raw.split(host).join('')
        return ['data-sidebar', 'Geist', 'mock-review'].some((marker) => withoutScratchPath.includes(marker))
      })
      expect(offending).toEqual([])

      let liveServe: Serve | undefined
      try {
        liveServe = await startServeIn(host)
        const rootRes = await fetch(`${liveServe.url}/`)
        expect(rootRes.status).toBe(200)
        expect(await rootRes.text()).toContain(ENTRY_URL)
        const stateRes = await fetch(`${liveServe.url}/__mock-review/state`)
        expect(stateRes.status).toBe(200)
      } finally {
        await stopServe(liveServe)
      }
    }, 60_000)
  })

  it('AC-20260916-03-10: a journey step state written in meta.states spelling resolves to its example key server-side (D8), no "has no example" violation', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-serve-nophone-')
    const accountFile = path.join(host, 'src', 'screens', 'account.tsx')
    const accountSource = readFileSync(accountFile, 'utf8')
    writeFileSync(
      accountFile,
      accountSource
        .replace(`states: ['default'],`, `states: ['default', 'no-phone'],`)
        .replace(
          'export const examples = {\n  Default: <Account />,\n}',
          'export const examples = {\n  Default: <Account />,\n  NoPhone: <Account />,\n}',
        ),
    )
    // D13/Gotchas: anchored on the fixture's own beat-bearing account step's `state` value
    // (`default`), not a whole-line source literal that breaks the moment the fixture's shape
    // changes — the fixture's account step already carries a `state`, so this only needs to
    // change its spelling.
    const journeysFile = path.join(host, 'src', 'journeys.ts')
    const journeysSrc = readFileSync(journeysFile, 'utf8')
    const editedJourneys = journeysSrc.replace(
      "{ screen: 'account', beat: 'I land on my account', state: 'default' }",
      "{ screen: 'account', beat: 'I land on my account', state: 'no-phone' }",
    )
    expect(editedJourneys).not.toBe(journeysSrc)
    writeFileSync(journeysFile, editedJourneys)

    serve = await startServeIn(host)
    const res = await fetch(`${serve.url}/__mock-review/state`)
    expect(res.status).toBe(200)
    const state = (await res.json()) as {
      journeys: { id: string; steps: { screen: string; state?: string }[] }[]
      violations: string[]
    }

    expect(state.journeys[0]?.steps[1]?.state).toBe('NoPhone')
    expect(state.violations).not.toContain('state no-phone has no example')
  })

  it('AC-20260916-03-11: a scaffold-owned src/components/theme-provider.tsx is invisible to the state endpoint inventory (D1), WalletSummary stays', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-serve-scaffold-')
    writeFileSync(
      path.join(host, 'src', 'components', 'theme-provider.tsx'),
      'import * as React from "react"\nexport function ThemeProvider({ children }: { children: React.ReactNode }) {\n  return <>{children}</>\n}\n',
    )

    serve = await startServeIn(host)
    const res = await fetch(`${serve.url}/__mock-review/state`)
    expect(res.status).toBe(200)
    const state = (await res.json()) as { inventory: { name: string; examples: string[] }[] }

    expect(state.inventory.some((row) => row.name === 'ThemeProvider')).toBe(false)
    expect(state.inventory.some((row) => row.name === 'WalletSummary')).toBe(true)
  })

  // AC-20260917-03-11 (D6): the write-path scope invariant runs on `op:'update'` too, against the
  // MERGED note (existing + patch fields) — a patch that would leave an existing screen note
  // claiming `project: true` is refused 400, after the 404 pre-check, before the write lands.
  it('AC-20260917-03-11: an update that would merge project:true onto an existing screen note is refused 400, and design/notes.json is left byte-identical', async () => {
    serve = await startServe(greenHost)
    const notesPath = path.join(serve.host, 'design', 'notes.json')

    const addRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'add',
        note: {
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [{ by: 'owner', text: 'a real screen note' }],
        },
      }),
    })
    expect(addRes.status).toBe(200)
    const addedDoc = (await addRes.json()) as { notes: { id: string; screen: string | null }[] }
    const id = addedDoc.notes.find((n) => n.screen === 'home')?.id as string
    expect(id).toBeDefined()

    const before = readFileSync(notesPath, 'utf8')
    const updateRes = await fetch(`${serve.url}/__mock-review/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'update', id, fields: { project: true } }),
    })
    expect(updateRes.status).toBe(400)
    expect(await updateRes.json()).toEqual({ error: 'invalid notes patch' })
    expect(readFileSync(notesPath, 'utf8')).toBe(before)
  })

  describe.skipIf(process.env.SKIP_BROWSER === '1')('AC-20260915-02-14: viewport-driven device captions (D9) [env: SKIP_BROWSER]', () => {
    it('defaults to the Desktop view (D18a), and captions Desktop 1280 / Mobile 360 from config.targets.viewports once Both is chosen', async () => {
      serve = await startServe(greenHost)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })

        // D18a: the page never defaults to `both` — only the Desktop frame shows at first.
        await expect.poll(() => page.getByText('Desktop 1280').count()).toBeGreaterThan(0)
        expect(await page.getByText('Mobile 360').count()).toBe(0)

        await page.locator('[aria-label="Both"]').click()
        await expect.poll(() => page.getByText('Mobile 360').count()).toBeGreaterThan(0)
        expect(await page.getByText('Desktop 1280').count()).toBeGreaterThan(0)
        // Reference §3: the desktop iframe is sized at the device's raw CSS width (1280px)
        // before the workspace's fit-to-width scale transform is applied.
        const iframeWidthAttr = await page
          .locator('iframe')
          .first()
          .evaluate((el: HTMLIFrameElement) => el.style.width || el.getAttribute('width'))
        expect(iframeWidthAttr).toContain('1280')
      } finally {
        await browser.close()
      }
    }, 30_000)

    it('a single-viewport config hides the Mobile/Both device toggle items, leaving only Desktop', async () => {
      const host = copyFixtureHost(greenHost, 'mock-review-oneviewport-')
      writeFileSync(
        path.join(host, 'mock.config.ts'),
        [
          "export default {",
          "  name: 'app',",
          "  port: 5180,",
          "  targets: { viewports: ['1280x800'], schemes: ['light', 'dark'] },",
          "  theme: null,",
          "  client: { token: 'replace-me' },",
          "}",
          '',
        ].join('\n'),
      )
      serve = await startServeIn(host)
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`${serve.url}/#/home`, { waitUntil: 'networkidle' })
        await expect.poll(() => page.locator('[aria-label="Desktop"]').count()).toBeGreaterThan(0)
        expect(await page.locator('[aria-label="Mobile"]').count()).toBe(0)
        expect(await page.locator('[aria-label="Both"]').count()).toBe(0)
      } finally {
        await browser.close()
      }
    }, 30_000)
  })
})
