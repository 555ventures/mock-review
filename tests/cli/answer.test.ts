import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

function seedNotes(host: string, notes: unknown, journeys: unknown, contractVersion = 1) {
  mkdirSync(path.join(host, 'design'), { recursive: true })
  writeFileSync(path.join(host, 'design', 'notes.json'), JSON.stringify({ contractVersion, notes, journeys }))
}

describe('mock-review answer (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-01-16: answer --note flips an open note to answered and appends the thread entry, leaving other notes untouched', () => {
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

    const r = run(host, ['answer', '--note', 'N1', '--text', 'moved it'])
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

  it('AC-20260917-01-4: answer --note on a v1 notes.json exits 0, rewrites contractVersion to 2, and leaves every other key as expected', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
      1,
    )

    const r = run(host, ['answer', '--note', 'N1', '--text', 'use the card'])
    expect(r.status).toBe(0)

    const notes = JSON.parse(readFileSync(path.join(host, 'design', 'notes.json'), 'utf8')) as {
      contractVersion: number
      notes: Array<{ id: string; status: string; thread: Array<{ by: string; text: string }> }>
      journeys: Record<string, unknown>
    }
    expect(notes.contractVersion).toBe(2)
    const n1 = notes.notes.find((n) => n.id === 'N1')
    expect(n1?.status).toBe('answered')
    expect(n1?.thread).toEqual([{ by: 'session', text: 'use the card' }])
    expect(notes.journeys).toEqual({})
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

  it('AC-20260917-01-11 (rewrites AC-20260915-01-17: answer --decision appends): creates design/decisions.json at contractVersion 2 with the appended decision, when absent', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
    )
    expect(existsSync(path.join(host, 'design', 'decisions.json'))).toBe(false)

    const r = run(host, ['answer', '--note', 'N1', '--text', 'x', '--decision', 'cards, not tables'])
    expect(r.status).toBe(0)

    const decisions = JSON.parse(readFileSync(path.join(host, 'design', 'decisions.json'), 'utf8')) as {
      contractVersion: number
      decisions: Array<{ screen: string | null; text: string; at: string }>
    }
    expect(decisions).toEqual({
      contractVersion: 2,
      decisions: [{ screen: 'home', text: 'cards, not tables', at: decisions.decisions[0]?.at }],
    })
    expect(() => new Date(decisions.decisions[0]?.at ?? '').toISOString()).not.toThrow()
  })

  it('AC-20260917-01-5 (rewrites AC-20260915-01-17: answer --decision refuses): refuses an unknown contractVersion 3, leaving both files byte-identical', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
    )
    const decisionsPath = path.join(host, 'design', 'decisions.json')
    const invalidDecisions = JSON.stringify({ contractVersion: 3, decisions: [] })
    writeFileSync(decisionsPath, invalidDecisions)
    const notesPath = path.join(host, 'design', 'notes.json')
    const notesBefore = readFileSync(notesPath, 'utf8')

    const r = run(host, ['answer', '--note', 'N1', '--text', 'x', '--decision', 'd'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: design/decisions.json is invalid')

    expect(readFileSync(decisionsPath, 'utf8')).toBe(invalidDecisions)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)
  })

  it.each([1, 2])(
    'AC-20260917-01-5: answer --decision exits 0 and writes the appended decision at contractVersion 2 when decisions.json reads contractVersion %i',
    (existingVersion) => {
      const host = copyFixtureHost(greenHost, 'mock-review-answer-')
      seedNotes(
        host,
        [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
        {},
      )
      const decisionsPath = path.join(host, 'design', 'decisions.json')
      writeFileSync(decisionsPath, JSON.stringify({ contractVersion: existingVersion, decisions: [] }))

      const r = run(host, ['answer', '--note', 'N1', '--text', 'x', '--decision', 'cards, not tables'])
      expect(r.status).toBe(0)

      const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8')) as {
        contractVersion: number
        decisions: Array<{ screen: string | null; text: string; at: string }>
      }
      expect(decisions.contractVersion).toBe(2)
      expect(decisions.decisions).toHaveLength(1)
      expect(decisions.decisions[0]?.text).toBe('cards, not tables')
    },
  )

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
})
