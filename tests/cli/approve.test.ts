// AC-20260918-03-1, AC-20260918-03-2, AC-20260918-03-3: the new `mock-review approve --screen
// <name>` verb (D1/D2/D3 of specs/20260918/03) — the one writer left for `approval.screens`, now
// that the page's own Approve-screen control is gone (D4). It runs `ensureDesignFiles`, then
// `runCheck(cwd)`, then applies `{op:'approveScreen', name}` through the existing
// `applyApprovalPatch` under spec 01's `withDesignLock`, so its entry is byte-for-byte what the
// page button used to write — and refuses, writing nothing, on an unknown screen, a failing
// check, or a screen carrying an open note.
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brokenHost, ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

type Check = {
  ok: boolean
  findings: Array<{ kind: string; severity: string; file: string; message: string }>
  screens: Array<{ name: string; states: string[]; hash: string }>
}

function runCheckJson(host: string): Check {
  const r = run(host, ['check', '--json'])
  expect(r.status).toBe(0)
  return JSON.parse(r.stdout) as Check
}

function seedNotes(host: string, notes: unknown, journeys: unknown = {}, contractVersion = 2) {
  mkdirSync(path.join(host, 'design'), { recursive: true })
  writeFileSync(path.join(host, 'design', 'notes.json'), JSON.stringify({ contractVersion, notes, journeys }))
}

function readApproval(host: string): {
  contractVersion: number
  screens: Record<string, { hash: string; approvedAt: string; states: string[]; viewports: string[]; schemes: string[]; screenshots: string[] }>
  journeys: Record<string, unknown>
  theme: string | null
} {
  return JSON.parse(readFileSync(path.join(host, 'design', 'approval.json'), 'utf8'))
}

describe('mock-review approve --screen (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  // AC-20260918-03-1
  it('AC-20260918-03-1: approve --screen home on a cleanly rendering host exits 0, prints "approved home <hash>", and writes approval.screens.home with all six fields', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-approve-')
    const check = runCheckJson(host)
    const homeHash = check.screens.find((s) => s.name === 'home')?.hash
    expect(typeof homeHash).toBe('string')

    const r = run(host, ['approve', '--screen', 'home'])
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(`approved home ${homeHash}`)

    const approval = readApproval(host)
    const entry = approval.screens.home
    expect(entry).toBeDefined()
    expect(Object.keys(entry ?? {}).sort()).toEqual(['approvedAt', 'hash', 'schemes', 'screenshots', 'states', 'viewports'])
    expect(entry?.hash).toBe(homeHash)
    expect(() => new Date(entry?.approvedAt ?? '').toISOString()).not.toThrow()
  })

  // AC-20260918-03-2: the verb's hash matches check --json's own hash for the same host state,
  // and the written screenshots array matches the same screenshotsFor(cwd, name) the server's own
  // context builds (D3: moved verbatim into src/files/screenshots.ts, imported by both).
  it('AC-20260918-03-2: the written hash equals check --json\'s screens[name].hash, and screenshots equals screenshotsFor(cwd, name)', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-approve-')
    mkdirSync(path.join(host, 'design', 'screenshots'), { recursive: true })
    writeFileSync(path.join(host, 'design', 'screenshots', 'home-Default-1280x800-light.png'), '')
    writeFileSync(path.join(host, 'design', 'screenshots', 'home-Default-360x800-light.png'), '')
    writeFileSync(path.join(host, 'design', 'screenshots', 'account-Default-1280x800-light.png'), '')

    const check = runCheckJson(host)
    const homeHash = check.screens.find((s) => s.name === 'home')?.hash

    const r = run(host, ['approve', '--screen', 'home'])
    expect(r.status).toBe(0)

    const approval = readApproval(host)
    const entry = approval.screens.home
    expect(entry?.hash).toBe(homeHash)

    const { screenshotsFor } = await import('../../src/files/screenshots.js')
    expect(entry?.screenshots).toEqual(screenshotsFor(host, 'home'))
    expect(entry?.screenshots.length).toBeGreaterThan(0)
    expect(entry?.screenshots.every((p) => p.startsWith('design/screenshots/home-'))).toBe(true)
  })

  // AC-20260918-03-3, first refusal (checked FIRST per D2): a failing check names the first error
  // finding rather than mis-reporting every real screen name as unknown.
  it('AC-20260918-03-3: approve --screen on a host whose check fails exits 2 naming the first error finding, and writes nothing', () => {
    const host = copyFixtureHost(brokenHost, 'mock-review-approve-broken-')
    const check = runCheckJson(host)
    expect(check.ok).toBe(false)
    const firstError = check.findings.find((f) => f.severity === 'error')
    expect(firstError).toBeDefined()

    const approvalPath = path.join(host, 'design', 'approval.json')
    const before = readFileSync(approvalPath, 'utf8')

    const r = run(host, ['approve', '--screen', 'home'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain(firstError?.message ?? '')
    expect(readFileSync(approvalPath, 'utf8')).toBe(before)
  })

  // AC-20260918-03-3, second refusal.
  it('AC-20260918-03-3: approve --screen nope exits 2 with "mock-review: unknown screen nope", and writes nothing', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-approve-')
    const approvalPath = path.join(host, 'design', 'approval.json')
    // Absent until ensureDesignFiles runs; the verb creates it itself — read it back afterwards.
    const r = run(host, ['approve', '--screen', 'nope'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: unknown screen nope')
    expect(readApproval(host).screens).toEqual({})
    void approvalPath
  })

  // AC-20260918-03-3, third refusal: an open note anchored to the target screen. Checked inside
  // the design lock, alongside the approval read/write (D2's own rationale — a client cannot add
  // a note between this check and the write).
  it('AC-20260918-03-3: approve --screen home with one open note anchored to home exits 2 with "mock-review: home has 1 open note(s) — answer or close them first", and writes nothing', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-approve-')
    seedNotes(host, [
      {
        id: 'N001',
        screen: 'home',
        state: 'Default',
        component: null,
        key: null,
        snippet: null,
        status: 'open',
        thread: [{ by: 'owner', text: 'still wrong' }],
      },
    ])
    const approvalPath = path.join(host, 'design', 'approval.json')
    mkdirSync(path.dirname(approvalPath), { recursive: true })
    writeFileSync(approvalPath, JSON.stringify({ contractVersion: 2, screens: {}, journeys: {}, theme: null }))
    const before = readFileSync(approvalPath, 'utf8')

    const r = run(host, ['approve', '--screen', 'home'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim()).toBe('mock-review: home has 1 open note(s) — answer or close them first')
    expect(readFileSync(approvalPath, 'utf8')).toBe(before)
  })

  // AC-20260918-03-3: an answered (non-open) note anchored to the screen does NOT block approval
  // — only `status: 'open'` counts.
  it('AC-20260918-03-3: an answered note anchored to home does not block approve --screen home', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-approve-')
    seedNotes(host, [
      {
        id: 'N001',
        screen: 'home',
        state: 'Default',
        component: null,
        key: null,
        snippet: null,
        status: 'answered',
        thread: [{ by: 'session', text: 'fixed' }],
      },
    ])

    const r = run(host, ['approve', '--screen', 'home'])
    expect(r.status).toBe(0)
    expect(readApproval(host).screens.home).toBeDefined()
  })
})
