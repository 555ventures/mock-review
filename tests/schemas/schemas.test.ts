import { beforeAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, missingContractKeys, readJsonFile, run } from '../helpers/cli.js'

const testsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const contract = readJsonFile(path.join(testsDir, 'fixtures', 'contract.json')) as {
  shapes: Record<string, Record<string, unknown>>
}

// Every shape zod schema this spec creates (D1). These imports resolve once src/schemas/* exist;
// until then the whole file fails to import, which is the correct red state pre-implementation.
import { CheckSchema } from '../../src/schemas/check.js'

describe('schemas', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-01-1 (built dist/): CheckSchema accepts the green fixture check --json output and rejects an invalid severity', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-schemas-')
    const r = run(host, ['check', '--json'])
    expect(r.status).toBe(0)
    const json = JSON.parse(r.stdout) as { findings: Array<{ severity: string }> }

    const good = CheckSchema.safeParse(json)
    expect(good.success).toBe(true)

    const findings = json.findings.length
      ? json.findings.map((f) => ({ ...f }))
      : [{ kind: 'type', severity: 'error', file: 'x', message: 'y' }]
    const first = findings[0] as { severity: string }
    first.severity = 'fatal'
    const bad = CheckSchema.safeParse({ ...json, findings })
    expect(bad.success).toBe(false)
    if (!bad.success) {
      const paths = bad.error.issues.map((issue: { path: PropertyKey[] }) => issue.path.join('.'))
      expect(paths).toContain('findings.0.severity')
    }
  })

  it('AC-20260915-01-2: contract --json, check --json and sweep --json each satisfy tests/fixtures/contract.json required-key lists on the green fixture', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-schemas-')

    const contractResult = run(host, ['contract', '--json'])
    expect(missingContractKeys(contract, 'contract', JSON.parse(contractResult.stdout))).toEqual([])

    const checkResult = run(host, ['check', '--json'])
    expect(missingContractKeys(contract, 'check', JSON.parse(checkResult.stdout))).toEqual([])

    const sweepResult = run(host, ['sweep', '--json'])
    expect(missingContractKeys(contract, 'sweep', JSON.parse(sweepResult.stdout))).toEqual([])
  })

  it('AC-20260915-01-2: notes.json, approval.json and decisions.json satisfy their contract shapes after answer --decision', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-schemas-')
    // Ensures design/notes.json + approval.json exist (D9) before answer runs.
    run(host, ['check', '--json'])

    const notesPath = path.join(host, 'design', 'notes.json')
    const notes = readJsonFile(notesPath) as { notes: Array<Record<string, unknown>> }
    notes.notes.push({
      id: 'N1',
      screen: 'home',
      state: 'default',
      component: 'WalletSummary',
      key: null,
      snippet: null,
      status: 'open',
      thread: [],
    })
    // The zod schema is the file's guarantor (D9); we still need a real open note for answer to act on.
    writeFileSync(notesPath, JSON.stringify(notes))

    const r = run(host, ['answer', '--note', 'N1', '--text', 'use the card', '--decision', 'cards, not tables'])
    expect(r.status).toBe(0)

    expect(missingContractKeys(contract, 'notes', readJsonFile(notesPath) as Record<string, unknown>)).toEqual([])
    expect(
      missingContractKeys(contract, 'approval', readJsonFile(path.join(host, 'design', 'approval.json')) as Record<string, unknown>),
    ).toEqual([])
    expect(
      missingContractKeys(contract, 'decisions', readJsonFile(path.join(host, 'design', 'decisions.json')) as Record<string, unknown>),
    ).toEqual([])
  })
})
