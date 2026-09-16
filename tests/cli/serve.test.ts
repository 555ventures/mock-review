import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { cliPath, ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

let child: ChildProcessWithoutNullStreams | undefined

afterEach(async () => {
  if (child && child.exitCode === null && !child.killed) {
    child.kill('SIGTERM')
    await new Promise((resolve) => child?.once('exit', resolve))
  }
  child = undefined
})

function startServe(host: string): Promise<{ child: ChildProcessWithoutNullStreams; url: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [cliPath, 'serve'], { cwd: host })
    child = proc
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

describe('mock-review serve (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260915-01-13: prints a URL with no trailing slash, writes the portfile, answers ping and the stub page, and removes the portfile on SIGTERM', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-serve-')
    const { child: proc, url } = await startServe(host)

    expect(url.endsWith('/')).toBe(false)

    const portfilePath = path.join(host, 'design', '.serve.json')
    expect(existsSync(portfilePath)).toBe(true)
    const portfile = JSON.parse(readFileSync(portfilePath, 'utf8')) as { url: string; pid: number }
    expect(portfile.url).toBe(url)
    expect(portfile.pid).toBe(proc.pid)

    const ping = await fetch(`${url}/__mock-review/ping`)
    expect(ping.status).toBe(200)
    expect(await ping.json()).toEqual({ ok: true, pid: proc.pid })

    const page = await fetch(`${url}/`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')

    proc.kill('SIGTERM')
    const exitCode = await new Promise((resolve) => proc.once('exit', resolve))
    expect(exitCode).toBe(0)
    expect(existsSync(portfilePath)).toBe(false)
  }, 20_000)

  it('AC-20260915-01-14: check --json reports serve.url while serve is up and null once it has exited', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-serve-')
    const { child: proc, url } = await startServe(host)

    const up = JSON.parse(run(host, ['check', '--json']).stdout) as { serve: { url: string | null } }
    expect(up.serve.url).toBe(url)

    proc.kill('SIGTERM')
    await new Promise((resolve) => proc.once('exit', resolve))

    const down = JSON.parse(run(host, ['check', '--json']).stdout) as { serve: { url: string | null } }
    expect(down.serve.url).toBeNull()
  }, 20_000)

  it('AC-20260915-01-14: check --json reports null when the portfile names a dead port, and the liveness probe alone returns null within 1s (D18)', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-serve-')
    const { writeFileSync, mkdirSync } = await import('node:fs')
    mkdirSync(path.join(host, 'design'), { recursive: true })
    writeFileSync(path.join(host, 'design', '.serve.json'), JSON.stringify({ url: 'http://127.0.0.1:1', pid: 999999 }))

    const check = JSON.parse(run(host, ['check', '--json']).stdout) as { serve: { url: string | null } }
    expect(check.serve.url).toBeNull()

    // D18: the "within 1s" bound applies to the liveness probe itself, not the whole `check`
    // pipeline (TS/docgen/etc. dominate a full run's wall time and are not what D8 promises stays
    // fast under a dead port). Measured from the built dist/, around serveUrl(cwd) alone.
    const { serveUrl } = (await import(
      path.join(cliPath, '..', 'analysis', 'liveness.js')
    )) as { serveUrl: (cwd: string) => Promise<string | null> }
    const start = Date.now()
    const url = await serveUrl(host)
    expect(Date.now() - start).toBeLessThan(1000)
    expect(url).toBeNull()
  })
})
