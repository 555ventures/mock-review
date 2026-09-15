import { beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

type InventoryRow = { name: string; kind: string; props: Record<string, string>; doc: string; usedOn: string[] }
type QueueItem = { kind: string; id: string; screen: string | null; state: string | null; file: string; line: number; last: string; reuse: string[] }
type Sweep = { contractVersion: number; inventory: InventoryRow[]; queue: QueueItem[] }

function lineOf(file: string, needle: string): number {
  const lines = readFileSync(file, 'utf8').split('\n')
  const idx = lines.findIndex((l) => l.includes(needle))
  return idx === -1 ? 1 : idx + 1
}

describe('mock-review sweep (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-01-18: --json inventory contains ConsoleShell and WalletSummary with their doc lines and usedOn, in under 5s', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-sweep-')

    const start = Date.now()
    const sweep = JSON.parse(run(host, ['sweep', '--json']).stdout) as Sweep
    expect(Date.now() - start).toBeLessThan(5000)

    expect(sweep.inventory).toContainEqual(
      expect.objectContaining({
        name: 'ConsoleShell',
        kind: 'shell',
        doc: 'The console shell with sidebar and header.',
        usedOn: expect.arrayContaining(['account', 'home']),
      }),
    )
    expect(sweep.inventory).toContainEqual({
      name: 'WalletSummary',
      kind: 'component',
      props: { balance: 'number', currency: 'string' },
      doc: 'Shows the wallet balance.',
      usedOn: ['home'],
    })
  })

  it('AC-20260915-01-19: --json queue lists the open journey conversation before the open note, and never the answered note', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-sweep-')
    mkdirSync(path.join(host, 'design'), { recursive: true })
    writeFileSync(
      path.join(host, 'design', 'notes.json'),
      JSON.stringify({
        contractVersion: 1,
        notes: [
          {
            id: 'N1',
            screen: 'home',
            state: 'default',
            component: 'WalletSummary',
            key: null,
            snippet: null,
            status: 'open',
            thread: [],
          },
          {
            id: 'N2',
            screen: 'account',
            state: 'default',
            component: null,
            key: null,
            snippet: null,
            status: 'answered',
            thread: [{ by: 'session', text: 'done' }],
          },
        ],
        journeys: { 'first-visit': { status: 'open', thread: [{ by: 'client', text: 'add a back link' }] } },
      }),
    )

    const sweep = JSON.parse(run(host, ['sweep', '--json']).stdout) as Sweep

    expect(sweep.queue.find((q) => q.id === 'N2')).toBeUndefined()

    const journeyLine = lineOf(path.join(host, 'src', 'journeys.ts'), "id: 'first-visit'")
    const noteLine = lineOf(path.join(host, 'src', 'screens', 'home.tsx'), '<WalletSummary')
    // reuse = inventory names not used on the note's own screen (home) — with the fixture's two
    // components both used on home, this is an empty set; assert generically off the returned
    // inventory rather than hardcoding, so the assertion tracks D11's rule, not a magic number.

    expect(sweep.queue).toEqual([
      {
        kind: 'journey',
        id: 'first-visit',
        screen: null,
        state: null,
        file: 'src/journeys.ts',
        line: journeyLine,
        last: 'add a back link',
        reuse: [],
      },
      {
        kind: 'note',
        id: 'N1',
        screen: 'home',
        state: 'default',
        file: 'src/screens/home.tsx',
        line: noteLine,
        last: '',
        reuse: sweep.inventory.filter((i) => !i.usedOn.includes('home')).map((i) => i.name),
      },
    ])
  })

  it('AC-20260915-01-20: text form prints "queue empty" on a host with no open items', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-sweep-')
    mkdirSync(path.join(host, 'design'), { recursive: true })
    writeFileSync(path.join(host, 'design', 'notes.json'), JSON.stringify({ contractVersion: 1, notes: [], journeys: {} }))

    const r = run(host, ['sweep'])
    expect(r.stdout).toBe('queue empty\n')
  })

  it('AC-20260915-01-20: text form prints the inventory, a blank line, then journeys.ts before screens/home.tsx with [journey] before [note]', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-sweep-')
    mkdirSync(path.join(host, 'design'), { recursive: true })
    writeFileSync(
      path.join(host, 'design', 'notes.json'),
      JSON.stringify({
        contractVersion: 1,
        notes: [
          {
            id: 'N1',
            screen: 'home',
            state: 'default',
            component: 'WalletSummary',
            key: null,
            snippet: null,
            status: 'open',
            thread: [],
          },
        ],
        journeys: { 'first-visit': { status: 'open', thread: [{ by: 'client', text: 'add a back link' }] } },
      }),
    )

    const r = run(host, ['sweep'])
    const lines = r.stdout.split('\n')
    const blankIdx = lines.indexOf('')
    expect(blankIdx).toBeGreaterThan(0)

    const journeysHeadingIdx = lines.indexOf('## src/journeys.ts')
    const screensHeadingIdx = lines.indexOf('## src/screens/home.tsx')
    expect(journeysHeadingIdx).toBeGreaterThan(blankIdx)
    expect(screensHeadingIdx).toBeGreaterThan(journeysHeadingIdx)

    const journeyLineIdx = lines.findIndex((l) => l.startsWith('[journey] first-visit'))
    const noteLineIdx = lines.findIndex((l) => l.startsWith('[note]'))
    expect(journeyLineIdx).toBeGreaterThan(-1)
    expect(noteLineIdx).toBeGreaterThan(journeyLineIdx)
  })
})
