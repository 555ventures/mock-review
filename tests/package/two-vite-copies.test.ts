// AC-20260916-02-8, AC-20260916-02-9 (pin), AC-20260916-02-10 (D9): the two-vite-copies scratch
// host — the package linked from OUTSIDE a host whose own `vite` is a physical copy (the
// `npm link` layout), reproduced without the network per spike S7. AC-8 proves the host-run
// plugin mount, which is HTTP 500 ("no module runner") today. AC-9 pins the bin path
// (`check`/`serve` from `.test-dist/cli.js`), already green pre-change per spike S7, on the SAME
// host. AC-10 proves a host on a fake vite 9 is refused by both `serve` (exit 2, no URL) and
// `check --json` (a `config` finding).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { cliPath, ensureFixtures, greenHost, repoRoot } from '../setup.js'
import { copyFixtureHostWithOwnVite, makeFakeViteHost, run, startHostVite } from '../helpers/cli.js'

/** A throwaway `listen(0)` for a free loopback port — the vite instance the test starts is a
 * separate process, so the port must be free before it (not merely "closed by us") when it binds
 * with `--strictPort`. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      if (address && typeof address === 'object') {
        const port = address.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('failed to allocate a free port')))
      }
    })
    srv.on('error', reject)
  })
}

async function stopChild(child: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => child.once('exit', resolve))
}

/** Starts `mock-review serve` from the built bin and resolves once it prints its first stdout
 * line (the URL) — mirrors tests/cli/serve.test.ts's own `startServe`. */
function startBinServe(host: string): Promise<{ child: ChildProcessWithoutNullStreams; url: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [cliPath, 'serve'], { cwd: host })
    let firstLine = ''
    const onData = (chunk: Buffer) => {
      if (firstLine) return
      firstLine = chunk.toString('utf8').split('\n')[0] ?? ''
      if (firstLine) {
        proc.stdout.off('data', onData)
        resolve({ child: proc, url: firstLine.trim() })
      }
    }
    proc.stdout.on('data', onData)
    proc.once('error', reject)
    setTimeout(() => reject(new Error('serve did not print a URL within 10s')), 10_000)
  })
}

/** Runs `serve` and resolves on its own exit (never on a printed URL) — used for the refusal
 * case, where success would mean the process keeps running forever instead of exiting. A 10s
 * bound that fires without an exit means `serve` started successfully instead of refusing, which
 * is itself the RED this AC needs before the fix lands. */
function runServeExpectingExit(host: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [cliPath, 'serve'], { cwd: host })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')))
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    proc.once('error', reject)
    proc.once('exit', (code) => resolve({ exitCode: code, stdout, stderr }))
    setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('serve did not exit within 10s — it may have started successfully instead of refusing'))
    }, 10_000)
  })
}

describe('two vite copies (D9): package linked outside a host whose own vite is a different physical copy', () => {
  let host: string
  let hostViteChild: ChildProcessWithoutNullStreams | undefined

  beforeAll(async () => {
    await ensureFixtures()
    host = copyFixtureHostWithOwnVite(greenHost, 'mock-review-two-vite-')
  }, 180_000)

  afterAll(async () => {
    await stopChild(hostViteChild)
  })

  it('AC-20260916-02-8: the host-run plugin mount answers GET state 200 with the real config and no module-runner violation', async () => {
    const hostViteRealpath = realpathSync(path.join(host, 'node_modules', 'vite'))
    const repoViteRealpath = realpathSync(path.join(repoRoot, 'node_modules', 'vite'))
    expect(hostViteRealpath).not.toBe(repoViteRealpath)

    const port = await getFreePort()
    hostViteChild = await startHostVite(host, port)

    const res = await fetch(`http://127.0.0.1:${port}/__mock-review/state`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { config: { name: string | null }; violations: string[] }
    expect(body.config.name).toBe('app')
    expect(body.violations.some((v) => v.includes('module runner'))).toBe(false)
  }, 30_000)

  it("AC-20260916-02-9: check --json and serve from the package's bin CONTINUE to work on the same two-copies host", async () => {
    await stopChild(hostViteChild)
    hostViteChild = undefined

    const check = run(host, ['check', '--json'])
    expect(check.status).toBe(0)
    const checkBody = JSON.parse(check.stdout) as {
      config: { name: string | null }
      findings: { file: string }[]
    }
    expect(checkBody.config.name).toBe('app')
    expect(checkBody.findings.some((f) => f.file === 'vite.config.ts')).toBe(false)

    const { child: proc, url } = await startBinServe(host)
    try {
      const res = await fetch(`${url}/__mock-review/state`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { config: { name: string | null } }
      expect(body.config.name).toBe('app')
    } finally {
      await stopChild(proc)
    }
  }, 30_000)
})

describe('two vite copies (D9): a host on a vite major that is not 8 is refused', () => {
  it('AC-20260916-02-10: serve exits 2 with no stdout, no portfile, and the exact stderr refusal', async () => {
    await ensureFixtures()
    const host = makeFakeViteHost(greenHost, '9.0.0', 'mock-review-fakevite9-serve-')

    const result = await runServeExpectingExit(host)

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(existsSync(path.join(host, 'design', '.serve.json'))).toBe(false)
    expect(result.stderr).toContain('mock-review: mock-review needs vite 8 in the host; found vite 9.0.0 at ')
  }, 15_000)

  it('AC-20260916-02-10: check --json exits 0 with a config finding naming the fake vite 9', async () => {
    await ensureFixtures()
    const host = makeFakeViteHost(greenHost, '9.0.0', 'mock-review-fakevite9-check-')

    const result = run(host, ['check', '--json'])

    expect(result.status).toBe(0)
    const body = JSON.parse(result.stdout) as { findings: { kind: string; file: string; message: string }[] }
    const finding = body.findings.find((f) => f.kind === 'config' && f.file === 'vite.config.ts')
    expect(finding?.message.startsWith('mock-review needs vite 8 in the host; found vite 9.0.0')).toBe(true)
  })
})
