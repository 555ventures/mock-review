// AC-20260917-01-8 (D4): the package major equals CONTRACT_VERSION — the repo's own ruling
// (docs/research/plugin-requirements.md:25,175; docs/research/fable-rulings.md:5).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../setup.js'
import { VERSION } from '../../src/index.js'
import { CONTRACT_VERSION } from '../../src/schemas/version.js'

describe('package version (D4)', () => {
  it('AC-20260917-01-8: package.json carries version 2.0.0 and a description ending "(contract v2)."', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      version: string
      description: string
    }
    expect(pkg.version).toBe('2.0.0')
    expect(pkg.description.endsWith('(contract v2).')).toBe(true)
  })

  it('AC-20260917-01-8: src/index.ts exports VERSION === "2.0.0"', () => {
    expect(VERSION).toBe('2.0.0')
  })

  it('AC-20260917-01-8: the major of package.json version equals CONTRACT_VERSION (2 -> 2)', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string }
    const major = Number(pkg.version.split('.')[0])
    expect(major).toBe(CONTRACT_VERSION)
    expect(major).toBe(2)
  })
})
