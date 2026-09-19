import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

function seedNotes(host: string, notes: unknown, journeys: unknown, contractVersion = 3) {
  mkdirSync(path.join(host, 'design'), { recursive: true })
  writeFileSync(path.join(host, 'design', 'notes.json'), JSON.stringify({ contractVersion, notes, journeys }))
}

describe('mock-review answer (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  // AC-20260918-02-8 (D6, rewrites AC-20260915-01-16): `answer` no longer hand-mutates
  // `notes.json` — it builds `{op:'reply', id, entry:{by:'session', text}}` and parses it through
  // `NotesPatchSchema` exactly like the page, so the wire's `text.trim().min(1)` rule applies to
  // the CLI too. The padded input is trimmed before it reaches the thread — the pre-image kept the
  // padding verbatim, having never parsed the wire schema at all.
  it('AC-20260918-02-8: answer --note trims padded text through the shared reducer, flips an open note to answered, and leaves other notes untouched', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    const otherNote = {
      id: 'N2',
      screen: 'account',
      state: 'default',
      component: null,
      key: null,
      snippet: null,
      status: 'answered',
      thread: [{ by: 'session', text: 'earlier' }],
    }
    seedNotes(
      host,
      [
        { id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] },
        otherNote,
      ],
      {},
    )

    const r = run(host, ['answer', '--note', 'N1', '--text', '  moved it  '])
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('answered N1')

    const notes = JSON.parse(readFileSync(path.join(host, 'design', 'notes.json'), 'utf8')) as {
      notes: Array<{ id: string; status: string; thread: Array<{ by: string; text: string }> }>
    }
    const n1 = notes.notes.find((n) => n.id === 'N1')
    expect(n1?.status).toBe('answered')
    expect(n1?.thread).toEqual([{ by: 'session', text: 'moved it' }])
    expect(notes.notes.find((n) => n.id === 'N2')).toEqual(otherNote)
  })

  // AC-20260918-02-8 (D6): the shared reducer's `ReplyEntrySchema.text` refuses a whitespace-only
  // reply — `answer` must exit 2 on it just as the page's schema-level refusal would, rather than
  // pushing an empty-looking entry onto the thread.
  it('AC-20260918-02-8: answer --note --text "   " (whitespace only) exits 2 and leaves notes.json byte-identical', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
    )
    const notesPath = path.join(host, 'design', 'notes.json')
    const before = readFileSync(notesPath, 'utf8')

    const r = run(host, ['answer', '--note', 'N1', '--text', '   '])
    expect(r.status).toBe(2)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)
  })

  it('AC-20260918-04-2 (rewrites AC-20260917-01-4): answer --note on a v1 notes.json exits 2, reporting it unreadable, and leaves the file byte-identical', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
      1,
    )
    const notesPath = path.join(host, 'design', 'notes.json')
    const before = readFileSync(notesPath, 'utf8')

    const r = run(host, ['answer', '--note', 'N1', '--text', 'use the card'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('design/notes.json')
    expect(readFileSync(notesPath, 'utf8')).toBe(before)
  })

  it('AC-20260915-01-16: answer --journey flips an open journey conversation to answered', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(host, [], { 'first-visit': { status: 'open', thread: [] } })

    const r = run(host, ['answer', '--journey', 'first-visit', '--text', 'ok'])
    expect(r.status).toBe(0)

    const notes = JSON.parse(readFileSync(path.join(host, 'design', 'notes.json'), 'utf8')) as {
      journeys: Record<string, { status: string; thread: Array<{ by: string; text: string }> }>
    }
    expect(notes.journeys['first-visit']).toEqual({ status: 'answered', thread: [{ by: 'session', text: 'ok' }] })
  })

  // AC-20260918-04-3 (D3): `--decision` no longer exists — `parseArgs` collects any `--name value`
  // with no per-verb allow-list, so the `answer` dispatch branch refuses it explicitly rather than
  // silently accepting and ignoring it. Exit 2 with the exact usage sentence, and no
  // design/decisions.json is created.
  it('AC-20260918-04-3: answer --note N1 --text t --decision d exits 2 with the unknown-flag usage refusal and creates no design/decisions.json', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
    )
    expect(existsSync(path.join(host, 'design', 'decisions.json'))).toBe(false)

    const r = run(host, ['answer', '--note', 'N1', '--text', 't', '--decision', 'd'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: usage: answer (--note <id> | --journey <id>) --text <t>')
    expect(existsSync(path.join(host, 'design', 'decisions.json'))).toBe(false)
  })

  it('AC-20260918-04-3: answer --note N1 --text t --decision (bare, no value) also exits 2 with the unknown-flag usage refusal', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
    )

    const r = run(host, ['answer', '--note', 'N1', '--text', 't', '--decision'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: usage: answer (--note <id> | --journey <id>) --text <t>')
    expect(existsSync(path.join(host, 'design', 'decisions.json'))).toBe(false)
  })

  // D5: `answer` stops crashing with a raw zod stack on an unreadable design/notes.json — it
  // refuses with the shared sentence on stderr at exit 2, leaving the file byte-identical.
  it('AC-20260917-04-7: answer --note N1 --text x on a truncated design/notes.json exits 2 with stderr naming the file and no zod stack on stdout, leaving it byte-identical', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-corrupt-')
    mkdirSync(path.join(host, 'design'), { recursive: true })
    const notesPath = path.join(host, 'design', 'notes.json')
    writeFileSync(notesPath, '{"contractVersion":')
    const before = readFileSync(notesPath, 'utf8')

    const r = run(host, ['answer', '--note', 'N1', '--text', 'x'])

    expect(r.status).toBe(2)
    expect(r.stderr).toContain('design/notes.json exists but does not parse')
    expect(r.stdout).toBe('')
    expect(r.stderr).not.toMatch(/ZodError|node_modules[\\/]zod|at Object\.<anonymous>/)
    expect(readFileSync(notesPath, 'utf8')).toBe(before)
  })

  it('AC-20260915-01-17: answer on an unknown note id exits 2 with "mock-review: no note NOPE"', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(host, [], {})

    const r = run(host, ['answer', '--note', 'NOPE', '--text', 'x'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: no note NOPE')
  })

  it('AC-20260915-01-17: answer with neither --note nor --journey exits 2 (usage)', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(host, [], {})

    const r = run(host, ['answer', '--text', 'x'])
    expect(r.status).toBe(2)
  })

  // AC-20260918-02-12 (D6, reuses AC-20260915-01-17: answer on): a journey id with no
  // conversation yet still exits 2 — `answer` has no Vite and cannot ask whether a journey id is
  // real, so it cannot seed a default conversation the way `POST notes` does for `close`/`reply`.
  it('AC-20260918-02-12: answer --journey on a journey with no conversation exits 2 with "mock-review: no conversation for journey J"', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(host, [], {})

    const r = run(host, ['answer', '--journey', 'first-visit', '--text', 'x'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: no conversation for journey first-visit')
  })
})
