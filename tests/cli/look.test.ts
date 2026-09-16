// AC-20260915-02-17: D12's `check --look`. The happy path needs a running `serve` and a
// resolvable `playwright`; both are provided by later waves (D13's devDependency, the fixture
// host's own node_modules symlink via tests/setup.ts), so this test's happy-path assertions are
// expected to be red until then. The "no serve running" refusal needs neither and is exercised
// directly against the built CLI.
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'
import { startServe, startServeIn, stopServe, type Serve } from '../helpers/serve.js'

describe('AC-20260915-02-17: mock-review check --look (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('writes one non-empty PNG per viewport x scheme and prints its path, with serve running and playwright resolvable', async () => {
    let serve: Serve | undefined
    try {
      serve = await startServe(greenHost)
      const r = run(serve.host, ['check', '--look', 'home', '--state', 'Default'])
      expect(r.status).toBe(0)

      const expected = [
        'design/screenshots/home-Default-1280x800-light.png',
        'design/screenshots/home-Default-1280x800-dark.png',
        'design/screenshots/home-Default-360x800-light.png',
        'design/screenshots/home-Default-360x800-dark.png',
      ]
      const printed = r.stdout.trim().split('\n')
      for (const rel of expected) {
        expect(printed).toContain(rel)
        const full = path.join(serve.host, rel)
        expect(existsSync(full)).toBe(true)
        const bytes = readFileSync(full)
        expect(bytes.length).toBeGreaterThan(0)
        // PNG magic number.
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      }
    } finally {
      await stopServe(serve)
    }
  }, 60_000)

  it('exits 2 with the remedy when no serve is running', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-look-noserve-')
    const r = run(host, ['check', '--look', 'home'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('remedy: npx mock-review serve')
  })

  it('D23: exits 2 for a screen that does not exist, with serve running', async () => {
    let serve: Serve | undefined
    try {
      serve = await startServe(greenHost)
      const r = run(serve.host, ['check', '--look', 'does-not-exist'])
      expect(r.status).toBe(2)
      expect(r.stderr).toContain('does-not-exist')
    } finally {
      await stopServe(serve)
    }
  }, 30_000)

  it('D23: exits 2 for a bare --look with no screen name', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-look-noname-')
    const r = run(host, ['check', '--look'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('--look needs a screen name')
  })

  it('review pass 3: without --state, writes the full set in example-key casing (home-Default-*, home-Empty-*)', async () => {
    let serve: Serve | undefined
    try {
      serve = await startServe(greenHost)
      const r = run(serve.host, ['check', '--look', 'home'])
      expect(r.status).toBe(0)

      const expected = [
        'design/screenshots/home-Default-1280x800-light.png',
        'design/screenshots/home-Default-1280x800-dark.png',
        'design/screenshots/home-Default-360x800-light.png',
        'design/screenshots/home-Default-360x800-dark.png',
        'design/screenshots/home-Empty-1280x800-light.png',
        'design/screenshots/home-Empty-1280x800-dark.png',
        'design/screenshots/home-Empty-360x800-light.png',
        'design/screenshots/home-Empty-360x800-dark.png',
      ]
      const printed = r.stdout.trim().split('\n')
      for (const rel of expected) {
        expect(printed).toContain(rel)
        const full = path.join(serve.host, rel)
        expect(existsSync(full)).toBe(true)
        expect(readFileSync(full).length).toBeGreaterThan(0)
      }
      // D21: example-key casing (Default/Empty), never meta.states' raw lowercase.
      expect(printed.some((p) => p.includes('home-default-') || p.includes('home-empty-'))).toBe(false)
    } finally {
      await stopServe(serve)
    }
  }, 60_000)

  it('review pass 3 (D23): a screen whose module cannot be imported exits 2 and writes nothing, rather than silently exiting 0', async () => {
    let serve: Serve | undefined
    try {
      const host = copyFixtureHost(greenHost, 'mock-review-look-loadfail-')
      const accountFile = path.join(host, 'src', 'screens', 'account.tsx')
      writeFileSync(accountFile, `throw new Error('boom-load')\n` + readFileSync(accountFile, 'utf8'))

      serve = await startServeIn(host)
      const r = run(host, ['check', '--look', 'account'])
      expect(r.status).toBe(2)
      expect(r.stderr).toContain('account')

      const screenshotsDir = path.join(host, 'design', 'screenshots')
      expect(existsSync(screenshotsDir)).toBe(false)
    } finally {
      await stopServe(serve)
    }
  }, 30_000)
})
