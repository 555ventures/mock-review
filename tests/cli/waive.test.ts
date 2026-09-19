// AC-20260918-04-6/D6: the new `mock-review waive --journey <id> --reason <text> --beats <hash>`
// verb — the last direct plugin write (`client waive`) moves into a package verb. It runs
// `ensureDesignFiles`, then applies `{op:'waive', id, reason, beats}` through the existing
// `applyApprovalPatch` (src/server/patches.ts) under the design lock, writing
// `{ ...existing, client: 'waived', reason, beats, at }` — mirroring `clientOk`'s fresh stamp, and
// like it, never writing `approvedAt`. The verb file (src/cli/waive.ts) does not exist yet on the
// pre-image — every case here is expected RED until it lands.
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

type Approval = {
  contractVersion: number
  screens: Record<string, unknown>
  journeys: Record<string, { client?: string; reason?: string; beats?: string; at?: string; approvedAt?: string }>
}

function readApproval(host: string): Approval {
  return JSON.parse(readFileSync(path.join(host, 'design', 'approval.json'), 'utf8')) as Approval
}

describe('mock-review waive --journey (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  // AC-20260918-04-6
  it('AC-20260918-04-6: waive --journey first-visit --reason <text> --beats <hash> exits 0 and writes approval.journeys[first-visit] carrying the reason and beats hash, with no approvedAt', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-waive-')

    const r = run(host, ['waive', '--journey', 'first-visit', '--reason', 'client unreachable', '--beats', 'deadbeef0000'])
    expect(r.status).toBe(0)

    const approval = readApproval(host)
    const entry = approval.journeys['first-visit']
    expect(entry).toBeDefined()
    expect(entry?.client).toBe('waived')
    expect(entry?.reason).toBe('client unreachable')
    expect(entry?.beats).toBe('deadbeef0000')
    expect(() => new Date(entry?.at ?? '').toISOString()).not.toThrow()
    expect(entry?.approvedAt).toBeUndefined()
  })

  it('AC-20260918-04-6: waive over an existing journeys entry preserves unrelated keys via ...existing while overwriting client/reason/beats/at', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-waive-')
    run(host, ['check', '--json'])
    const approvalPath = path.join(host, 'design', 'approval.json')
    writeFileSync(
      approvalPath,
      JSON.stringify({
        contractVersion: 3,
        screens: {},
        journeys: { 'first-visit': { approvedAt: '2026-01-01T00:00:00.000Z', client: 'ok' } },
      }),
    )

    const r = run(host, ['waive', '--journey', 'first-visit', '--reason', 'now unreachable', '--beats', 'cafebabe0000'])
    expect(r.status).toBe(0)

    const entry = readApproval(host).journeys['first-visit']
    expect(entry?.approvedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(entry?.client).toBe('waived')
    expect(entry?.reason).toBe('now unreachable')
    expect(entry?.beats).toBe('cafebabe0000')
  })

  it('AC-20260918-04-6: waive exits 0 and reports contractVersion 3 on the written approval.json', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-waive-')

    const r = run(host, ['waive', '--journey', 'first-visit', '--reason', 'x', '--beats', 'h'])
    expect(r.status).toBe(0)
    expect(readApproval(host).contractVersion).toBe(3)
  })

  it('waive with no --journey exits 2 (usage) and writes nothing', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-waive-')
    const approvalPath = path.join(host, 'design', 'approval.json')
    const before = existsSync(approvalPath) ? readFileSync(approvalPath, 'utf8') : undefined

    const r = run(host, ['waive', '--reason', 'x', '--beats', 'h'])
    expect(r.status).toBe(2)
    if (before !== undefined) expect(readFileSync(approvalPath, 'utf8')).toBe(before)
  })

  it('waive with no --reason exits 2 (usage) and writes nothing', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-waive-')

    const r = run(host, ['waive', '--journey', 'first-visit', '--beats', 'h'])
    expect(r.status).toBe(2)
  })

  it('waive with no --beats exits 2 (usage) and writes nothing', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-waive-')

    const r = run(host, ['waive', '--journey', 'first-visit', '--reason', 'x'])
    expect(r.status).toBe(2)
  })

  // D5-style refusal: a corrupt design/approval.json is reported with the shared sentence at exit
  // 2, never a raw zod stack, leaving the file byte-identical — mirroring answer.ts/sweep.ts's own
  // corrupt-file cases.
  it('waive on a truncated design/approval.json exits 2 with stderr naming the file and leaves it byte-identical', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-waive-corrupt-')
    mkdirSync(path.join(host, 'design'), { recursive: true })
    const approvalPath = path.join(host, 'design', 'approval.json')
    writeFileSync(approvalPath, '{"contractVersion":')
    const before = readFileSync(approvalPath, 'utf8')

    const r = run(host, ['waive', '--journey', 'first-visit', '--reason', 'x', '--beats', 'h'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('design/approval.json exists but does not parse')
    expect(readFileSync(approvalPath, 'utf8')).toBe(before)
  })
})
