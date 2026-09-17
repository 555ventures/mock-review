// AC-20260916-02-5, AC-20260916-02-6, AC-20260916-02-7, AC-20260916-02-15 (D3): `loadHostVite`
// resolves the HOST's own vite (never the package's), caches per root, refuses a host whose vite
// major isn't 8, and falls back (with a single stderr warning) to the package's own copy when the
// host has none at all.
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerScratchDir, makeFakeViteHost, copyFixtureHostWithOwnVite } from '../helpers/cli.js'
import { repoRoot, greenHost } from '../setup.js'
import { loadHostVite } from '../../src/analysis/host-modules.js'

const installedViteVersion = (
  JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', 'vite', 'package.json'), 'utf8')) as {
    version: string
  }
).version

describe("AC-20260916-02-5: loadHostVite resolves this repo's own vite and caches per root", () => {
  it('AC-20260916-02-5: resolves {createServer, version} and returns the same promise on a second call', async () => {
    const first = loadHostVite(repoRoot)
    const second = loadHostVite(repoRoot)
    expect(first).toBe(second)

    const hostVite = await first
    expect(typeof hostVite.createServer).toBe('function')
    expect(hostVite.version).toBe(installedViteVersion)
  })
})

describe('AC-20260916-02-6: loadHostVite rejects a host whose vite major is not 8', () => {
  it('AC-20260916-02-6: rejects naming the found version and directory for vite 9.0.0', async () => {
    const host = makeFakeViteHost(greenHost, '9.0.0', 'mock-review-hostmodules-v9-')
    await expect(loadHostVite(host)).rejects.toThrow(
      `mock-review needs vite 8 in the host; found vite 9.0.0 at ${path.join(host, 'node_modules', 'vite')}`,
    )
  })

  it('AC-20260916-02-6: rejects naming 7.1.0 the same way', async () => {
    const host = makeFakeViteHost(greenHost, '7.1.0', 'mock-review-hostmodules-v7-')
    await expect(loadHostVite(host)).rejects.toThrow(
      `mock-review needs vite 8 in the host; found vite 7.1.0 at ${path.join(host, 'node_modules', 'vite')}`,
    )
  })
})

describe("AC-20260916-02-7: loadHostVite falls back to the package's own vite when the host has none", () => {
  it('AC-20260916-02-7: resolves the package copy and writes exactly one stderr warning line', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mock-review-novite-'))
    registerScratchDir(root)
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'novite' }))
    mkdirSync(path.join(root, 'node_modules'), { recursive: true })

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const hostVite = await loadHostVite(root)
      expect(typeof hostVite.createServer).toBe('function')
      expect(hostVite.version).toBe(installedViteVersion)
      expect(writeSpy).toHaveBeenCalledTimes(1)
      expect(writeSpy).toHaveBeenCalledWith(`mock-review: vite is not resolvable from ${root}; using the package's own copy\n`)

      writeSpy.mockClear()
      await loadHostVite(root)
      expect(writeSpy).not.toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })
})

describe("AC-20260916-02-15: loadHostVite resolves a physical copy of vite from the scratch root, never the package's own", () => {
  it("AC-20260916-02-15: createServer differs from the package's import('vite') and matches the copy's own dist entry", async () => {
    const host = copyFixtureHostWithOwnVite(greenHost, 'mock-review-hostmodules-copy-')

    const hostVite = await loadHostVite(host)
    const pkgVite = (await import('vite')) as { createServer: unknown }
    const copyVite = (await import(
      pathToFileURL(path.join(host, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href
    )) as { createServer: unknown }

    expect(hostVite.createServer).not.toBe(pkgVite.createServer)
    expect(hostVite.createServer).toBe(copyVite.createServer)
  })
})
