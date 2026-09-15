import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

function seedNotes(host: string, notes: unknown, journeys: unknown) {
  mkdirSync(path.join(host, 'design'), { recursive: true })
  writeFileSync(path.join(host, 'design', 'notes.json'), JSON.stringify({ contractVersion: 1, notes, journeys }))
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

  it('AC-20260915-01-17: answer --decision appends to design/decisions.json, creating it if absent', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
    )
    expect(existsSync(path.join(host, 'design', 'decisions.json'))).toBe(false)

    const r = run(host, ['answer', '--note', 'N1', '--text', 'use the card', '--decision', 'cards, not tables'])
    expect(r.status).toBe(0)

    const decisions = JSON.parse(readFileSync(path.join(host, 'design', 'decisions.json'), 'utf8')) as {
      contractVersion: number
      decisions: Array<{ screen: string | null; text: string; at: string }>
    }
    expect(decisions.contractVersion).toBe(1)
    expect(decisions.decisions).toHaveLength(1)
    expect(decisions.decisions[0]?.screen).toBe('home')
    expect(decisions.decisions[0]?.text).toBe('cards, not tables')
    expect(() => new Date(decisions.decisions[0]?.at ?? '').toISOString()).not.toThrow()
  })

  it('AC-20260915-01-17: answer --decision refuses when design/decisions.json exists but fails the decisions schema, leaving both files byte-identical (D19)', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-answer-')
    seedNotes(
      host,
      [{ id: 'N1', screen: 'home', state: 'default', component: null, key: null, snippet: null, status: 'open', thread: [] }],
      {},
    )
    const decisionsPath = path.join(host, 'design', 'decisions.json')
    const invalidDecisions = JSON.stringify({ contractVersion: 2, decisions: [] })
    writeFileSync(decisionsPath, invalidDecisions)
    const notesPath = path.join(host, 'design', 'notes.json')
    const notesBefore = readFileSync(notesPath, 'utf8')

    const r = run(host, ['answer', '--note', 'N1', '--text', 'x', '--decision', 'd'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: design/decisions.json is invalid')

    expect(readFileSync(decisionsPath, 'utf8')).toBe(invalidDecisions)
    expect(readFileSync(notesPath, 'utf8')).toBe(notesBefore)
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
