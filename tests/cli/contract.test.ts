import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ensureFixtures, greenHost, repoRoot } from '../setup.js'
import { buildScratchPackage, copyFixtureHost, registerScratchDir, run, spawnWithTimeout } from '../helpers/cli.js'

describe('mock-review contract (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-01-3: contract --json in an empty directory prints the exact envelope on stdout, exit 0, empty stderr', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'mock-review-empty-'))
    registerScratchDir(empty)
    const version = (JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string }).version

    const r = run(empty, ['contract', '--json'])
    expect(r.status).toBe(0)
    expect(r.stderr).toBe('')
    expect(r.stdout).toBe(`{"contractVersion":1,"package":"@555/mock-review","version":"${version}"}\n`)
  })

  it('AC-20260915-01-3: --json contract (flag first) prints the same envelope', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'mock-review-empty-'))
    registerScratchDir(empty)
    const a = run(empty, ['contract', '--json'])
    const b = run(empty, ['--json', 'contract'])
    expect(b.status).toBe(0)
    expect(b.stdout).toBe(a.stdout)
  })

  it('AC-20260915-01-4: an unknown verb exits 2 with stderr starting "mock-review: unknown verb frobnicate" and empty stdout', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'mock-review-empty-'))
    registerScratchDir(empty)
    const r = run(empty, ['frobnicate'])
    expect(r.status).toBe(2)
    expect(r.stdout).toBe('')
    expect(r.stderr.startsWith('mock-review: unknown verb frobnicate')).toBe(true)
  })

  it('AC-20260915-01-3: contract --json still exits 0 with the exact envelope from a scratch package whose node_modules cannot resolve vite (D2/D19)', () => {
    const { cliPath: pkgCliPath } = buildScratchPackage(['vite'])
    const empty = mkdtempSync(path.join(tmpdir(), 'mock-review-empty-'))
    registerScratchDir(empty)
    const version = (JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string }).version

    const r = spawnWithTimeout(process.execPath, [pkgCliPath, 'contract', '--json'], { cwd: empty })
    expect(r.status).toBe(0)
    expect(r.stderr).toBe('')
    expect(r.stdout).toBe(`{"contractVersion":1,"package":"@555/mock-review","version":"${version}"}\n`)
  })

  it('AC-20260915-01-4: check --json on the green fixture host writes stdout that JSON.parse accepts whole, with no leading [vite] line', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-contract-')
    const r = run(host, ['check', '--json'])
    expect(r.stdout.startsWith('[vite]')).toBe(false)
    expect(() => JSON.parse(r.stdout)).not.toThrow()
  })
})
