// AC-20260918-04-1/D8 (rewrites AC-20260917-01-8/D4): the package major equals CONTRACT_VERSION —
// the repo's own ruling (docs/research/plugin-requirements.md:25,175; docs/research/fable-rulings.md:5).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../setup.js'
import { VERSION } from '../../src/index.js'
import { CONTRACT_VERSION } from '../../src/schemas/version.js'

describe('package version (D8)', () => {
  it('AC-20260918-04-1: package.json carries version 3.1.0 and a description ending "(contract v3)."', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      version: string
      description: string
    }
    expect(pkg.version).toBe('3.1.0')
    expect(pkg.description.endsWith('(contract v3).')).toBe(true)
  })

  // The released version is re-pinned here on each release (3.0.0 -> 3.1.0 for the pins split).
  // The invariant that actually guards a host — major === CONTRACT_VERSION — is the third test
  // below and never needs editing; these two literals are the release tax D14 removed elsewhere.
  it('AC-20260918-04-1: src/index.ts exports VERSION === "3.1.0"', () => {
    expect(VERSION).toBe('3.1.0')
  })

  it('AC-20260918-04-1: src/index.ts VERSION and package.json version never drift apart', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string }
    expect(VERSION).toBe(pkg.version)
  })

  it('AC-20260918-04-1: the major of package.json version equals CONTRACT_VERSION (3 -> 3)', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string }
    const major = Number(pkg.version.split('.')[0])
    expect(major).toBe(CONTRACT_VERSION)
    expect(major).toBe(3)
  })
})
