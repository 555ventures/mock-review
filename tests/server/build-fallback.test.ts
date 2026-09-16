// AC-20260915-02-13 (D25): `serve` must not silently serve a blank 200 when the package's own
// `dist/page/` build step never ran — it answers 503 and logs once to stderr, so a host that
// installed this package without its page build gets a diagnosable failure instead of a blank
// mock. Exercised against a real scratch "installed package" copy (buildScratchPackage, the same
// mechanism tests/cli/contract.test.ts's D2/D19 case uses) with the page/frame entry deliberately
// removed — never the committed dist/, and never a build of it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { buildScratchPackage, copyFixtureHost } from '../helpers/cli.js'

let child: ChildProcessWithoutNullStreams | undefined

afterEach(async () => {
  if (child && child.exitCode === null && !child.killed) {
    child.kill('SIGTERM')
    await new Promise((resolve) => child?.once('exit', resolve))
  }
  child = undefined
})

/** Spawns `node <pkgCliPath> serve` in `host` and resolves with the served URL once the first
 * stdout line arrives — the same wait pattern tests/cli/serve.test.ts and tests/helpers/serve.ts
 * use, just pointed at a scratch package's own `dist/cli.js` instead of the shared `.test-dist/`
 * one (this file needs a `dist/` it can delete files from without touching every other test's
 * shared build). */
function startServeWith(pkgCliPath: string, host: string, timeoutMs = 15_000): Promise<{ url: string; stderr: () => string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [pkgCliPath, 'serve'], { cwd: host })
    child = proc
    let firstLine = ''
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    const timer = setTimeout(() => reject(new Error(`serve did not print a URL within ${timeoutMs}ms; stderr so far: ${stderr}`)), timeoutMs)
    proc.stdout.on('data', (chunk: Buffer) => {
      if (firstLine) return
      firstLine = chunk.toString('utf8').split('\n')[0] ?? ''
      if (firstLine) {
        clearTimeout(timer)
        resolve({ url: firstLine.trim(), stderr: () => stderr })
      }
    })
    proc.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe('AC-20260915-02-13 (D25): serve\'s fallback when the package built without its page/frame step', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('answers 503 (not a blank 200) and logs once to stderr when dist/page/index.html is missing', async () => {
    const { dir: pkgDir, cliPath: pkgCli } = buildScratchPackage()
    const pageIndex = path.join(pkgDir, 'dist', 'page', 'index.html')
    expect(existsSync(pageIndex)).toBe(true)
    rmSync(pageIndex)

    const host = copyFixtureHost(greenHost, 'mock-review-fallback-')
    const { url, stderr } = await startServeWith(pkgCli, host)

    const res = await fetch(`${url}/`)
    expect(res.status).toBe(503)

    expect(stderr()).toContain('dist/page/index.html missing')
  }, 30_000)

  it('logs once to stderr when dist/frame/entry.tsx is missing (page/index.html still present)', async () => {
    const { dir: pkgDir, cliPath: pkgCli } = buildScratchPackage()
    const frameEntry = path.join(pkgDir, 'dist', 'frame', 'entry.tsx')
    expect(existsSync(frameEntry)).toBe(true)
    rmSync(frameEntry)

    const host = copyFixtureHost(greenHost, 'mock-review-fallback-')
    const { url, stderr } = await startServeWith(pkgCli, host)

    // GET / itself is unaffected (D25's 503 is specifically the page fallback, not the frame's).
    const res = await fetch(`${url}/`)
    expect(res.status).toBe(200)

    // GET /?frame=1 is the one this missing path actually breaks — without the entry file,
    // `frameHtml` would otherwise emit HTML pointing at a script that 404s, a mock that looks
    // blank with no diagnosable error; pinned so this can't quietly regress to that.
    const frameRes = await fetch(`${url}/?frame=1`)
    expect(frameRes.status).toBe(503)

    expect(stderr()).toContain('entry.tsx')
  }, 30_000)
})
