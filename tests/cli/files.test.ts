import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

describe('mock-review file layer (D9, built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-01-15: check --json creates design/notes.json and design/approval.json with the empty defaults on a scratch host with no design/ directory', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-files-')
    expect(existsSync(path.join(host, 'design', 'notes.json'))).toBe(false)

    run(host, ['check', '--json'])

    expect(JSON.parse(readFileSync(path.join(host, 'design', 'notes.json'), 'utf8'))).toEqual({
      contractVersion: 1,
      notes: [],
      journeys: {},
    })
    expect(JSON.parse(readFileSync(path.join(host, 'design', 'approval.json'), 'utf8'))).toEqual({
      contractVersion: 1,
      screens: {},
      journeys: {},
      theme: null,
    })
  })

  it('AC-20260915-01-15: an edited approval.json is left byte-identical by a second run', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-files-')
    const first = run(host, ['check', '--json'])
    expect(first.status).toBe(0)

    const approvalPath = path.join(host, 'design', 'approval.json')
    const edited = JSON.stringify({ contractVersion: 1, screens: { home: { hash: 'x' } }, journeys: {}, theme: 'nova' })
    writeFileSync(approvalPath, edited)

    const second = run(host, ['check', '--json'])
    expect(second.status).toBe(0)

    expect(readFileSync(approvalPath, 'utf8')).toBe(edited)
  })

  it('AC-20260915-01-15: writeJsonAtomic leaves no *.tmp file behind', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-files-')
    const r = run(host, ['check', '--json'])
    expect(r.status).toBe(0)

    expect(existsSync(path.join(host, 'design', 'notes.json'))).toBe(true)
    expect(existsSync(path.join(host, 'design', 'approval.json'))).toBe(true)
    const designFiles = readdirSync(path.join(host, 'design'))
    expect(designFiles.some((f) => f.endsWith('.tmp'))).toBe(false)
  })
})
