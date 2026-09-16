// AC-20260915-02-17 (D22): the one-shot runner (`withRunner`, used by `check`/`check --look`)
// sets its own `cacheDir` (`node_modules/.vite/mock-review-check`) so a one-shot verb run beside
// a live `serve` cannot evict `serve`'s own optimized deps out from under it (the D20 mechanism,
// now also guarded on the CLI path per D22's rationale: "the reviewer executed `--look` beside a
// live serve and got good PNGs, so the eviction is timing-dependent rather than constant").
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { run } from '../helpers/cli.js'
import { startServe, stopServe, type Serve } from '../helpers/serve.js'

let serve: Serve | undefined

afterEach(async () => {
  await stopServe(serve)
  serve = undefined
})

describe('AC-20260915-02-17 (D22): withRunner uses its own cacheDir, never serve\'s', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('check beside a live serve leaves the serve-created deps cache in place, under a separate mock-review-check cacheDir', async () => {
    serve = await startServe(greenHost)

    // serve's own optimizer writes node_modules/.vite/deps the first time it actually serves a
    // module — GET state exercises the host module graph through the same runner (D20), which is
    // enough to trigger it.
    const depsDir = path.join(serve.host, 'node_modules', '.vite', 'deps')
    await expect.poll(() => existsSync(depsDir), { timeout: 20_000 }).toBe(true)
    const beforeListing = readdirSync(depsDir).sort()

    const checkResult = run(serve.host, ['check', '--json'])
    expect(checkResult.status).toBe(0)

    // withRunner's own cacheDir is a sibling directory, never node_modules/.vite/deps itself.
    const checkCacheDir = path.join(serve.host, 'node_modules', '.vite', 'mock-review-check')
    expect(existsSync(checkCacheDir)).toBe(true)

    // serve's deps directory still exists with (at least) the same entries — check never deleted
    // or emptied it out from under the running serve.
    expect(existsSync(depsDir)).toBe(true)
    const afterListing = readdirSync(depsDir).sort()
    for (const entry of beforeListing) {
      expect(afterListing).toContain(entry)
    }

    // serve itself is still responsive after check ran beside it (no 504/blank-mock regression).
    const stateRes = await fetch(`${serve.url}/__mock-review/state`)
    expect(stateRes.status).toBe(200)
  }, 30_000)
})
