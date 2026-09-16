// AC-20260915-03-8 (rewrites AC-20260915-01-21: bin/files/prepare): D7's install shape — the
// reviewer ships as source (`files` includes `src/ui`), `dist/` holds the compiled CLI/plugin
// only, `release:check` is gone, the reviewer's UI libraries moved from devDependencies into
// dependencies, and `tailwindcss` is a peer (the reviewer's own index.css imports it).
import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, repoRoot, testDistDir } from '../setup.js'

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  bin?: Record<string, string>
  files?: string[]
  scripts?: Record<string, string>
}

const MOVED_TO_DEPENDENCIES = [
  'radix-ui',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'lucide-react',
  'cmdk',
  'react-resizable-panels',
  'tw-animate-css',
  '@fontsource-variable/geist',
] as const

describe('package install shape (D7)', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as PackageJson

  it('AC-20260915-03-8: files = ["dist", "src/ui"], build compiles the CLI/plugin only, no release:check script', () => {
    expect(pkg.files).toEqual(['dist', 'src/ui'])
    expect(pkg.scripts?.build).toBe('tsc -p tsconfig.build.json && chmod +x dist/cli.js')
    expect(pkg.scripts?.['release:check']).toBeUndefined()
  })

  it('AC-20260915-03-8: dependencies gain the reviewer UI libraries (moved out of devDependencies), and peerDependencies.tailwindcss is ^4', () => {
    for (const name of MOVED_TO_DEPENDENCIES) {
      expect(pkg.dependencies?.[name], `dependencies.${name}`).toBeDefined()
      expect(pkg.devDependencies?.[name], `devDependencies.${name} must be removed`).toBeUndefined()
    }
    expect(pkg.peerDependencies?.tailwindcss).toBe('^4')
  })

  it('AC-20260915-03-8: react, react-dom, vite stay peerDependencies; playwright is an optional peer', () => {
    expect(pkg.peerDependencies?.react).toBeDefined()
    expect(pkg.peerDependencies?.['react-dom']).toBeDefined()
    expect(pkg.peerDependencies?.vite).toBeDefined()
    expect(pkg.peerDependencies?.playwright).toBeDefined()
    expect(pkg.peerDependenciesMeta?.playwright?.optional).toBe(true)
  })

  it('AC-20260915-03-8: bin["mock-review"] = dist/cli.js, no prepare script', () => {
    expect(pkg.bin?.['mock-review']).toBe('dist/cli.js')
    expect(pkg.scripts?.prepare).toBeUndefined()
  })

  it('AC-20260915-03-8: npm pack --dry-run --json lists dist/cli.js, dist/vite.js, src/ui/main.tsx, src/ui/index.css and nothing under dist/page/ or dist/frame/', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: repoRoot, encoding: 'utf8' })
    const results = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>
    expect(results).toHaveLength(1)
    const paths = results[0]?.files.map((f) => f.path) ?? []
    expect(paths).toContain('dist/cli.js')
    expect(paths).toContain('dist/vite.js')
    expect(paths).toContain('src/ui/main.tsx')
    expect(paths).toContain('src/ui/index.css')
    expect(paths.some((p) => p.startsWith('dist/page/'))).toBe(false)
    expect(paths.some((p) => p.startsWith('dist/frame/'))).toBe(false)
  }, 60_000)
})

describe('AC-20260915-04-7 (D3/D8): the frame-route module is the only thing the package build emits under dist/ui/, and look.js imports it', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-04-7: .test-dist/ui/ contains exactly frame/frameRoute.js, frame/frameRoute.js.map, frame/frameRoute.d.ts, frame/frameRoute.d.ts.map and nothing else', () => {
    const uiDir = path.join(testDistDir, 'ui')
    expect(existsSync(uiDir), '.test-dist/ui/ must exist').toBe(true)

    const found: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(path.join(dir, entry.name), rel)
        else found.push(rel)
      }
    }
    walk(uiDir, '')
    found.sort()

    expect(found).toEqual(
      ['frame/frameRoute.d.ts', 'frame/frameRoute.d.ts.map', 'frame/frameRoute.js', 'frame/frameRoute.js.map'].sort(),
    )
  })

  it('AC-20260915-04-7: .test-dist/analysis/look.js imports ../ui/frame/frameRoute.js', () => {
    const lookJs = readFileSync(path.join(testDistDir, 'analysis', 'look.js'), 'utf8')
    expect(lookJs).toContain('../ui/frame/frameRoute.js')
  })

  it('AC-20260915-04-7: src/ui/frame/frameHref.ts no longer exists (D3: superseded by frameRoute.ts)', () => {
    expect(existsSync(path.join(repoRoot, 'src', 'ui', 'frame', 'frameHref.ts'))).toBe(false)
  })
})
