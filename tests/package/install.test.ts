import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../setup.js'

type PackageJson = {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  bin?: Record<string, string>
  files?: string[]
  scripts?: Record<string, string>
}

describe('package install shape (D12)', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as PackageJson

  it('AC-20260915-01-21: dependencies carry zod, react-docgen-typescript and typescript ~6.0.0', () => {
    expect(pkg.dependencies?.zod).toBeDefined()
    expect(pkg.dependencies?.['react-docgen-typescript']).toBeDefined()
    expect(pkg.dependencies?.typescript).toBe('~6.0.0')
  })

  it('AC-20260915-01-21: react, react-dom, vite stay peerDependencies; playwright is an optional peer', () => {
    expect(pkg.peerDependencies?.react).toBeDefined()
    expect(pkg.peerDependencies?.['react-dom']).toBeDefined()
    expect(pkg.peerDependencies?.vite).toBeDefined()
    expect(pkg.peerDependencies?.playwright).toBeDefined()
    expect(pkg.peerDependenciesMeta?.playwright?.optional).toBe(true)
  })

  it('AC-20260915-01-21: bin/files/prepare shape — bin["mock-review"] = dist/cli.js, files = ["dist"], no prepare script', () => {
    expect(pkg.bin?.['mock-review']).toBe('dist/cli.js')
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.scripts?.prepare).toBeUndefined()
  })

  it('AC-20260915-01-21: npm pack --dry-run --json lists dist/cli.js', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: repoRoot, encoding: 'utf8' })
    const results = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>
    expect(results).toHaveLength(1)
    expect(results[0]?.files.map((f) => f.path)).toContain('dist/cli.js')
  }, 60_000)
})
