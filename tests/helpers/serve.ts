// D6/D13: starts and stops `mock-review serve` on a scratch copy of a fixture host, for the
// server, browser, look and e2e tests that need a live URL. Factored out of the pattern already
// proven in tests/e2e/driver.test.ts and tests/cli/serve.test.ts (spec 01).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { cliPath } from '../setup.js'
import { copyFixtureHost, removeScratchDir } from './cli.js'

export type Serve = {
  child: ChildProcessWithoutNullStreams
  url: string
  host: string
  /** Set only when `startServe` created `host` itself (via `copyFixtureHost`) — `stopServe` then
   * owns removing it. `startServeIn` never sets this: its caller supplied `host` and may reuse it
   * after this exact `serve` stops (e.g. tests/e2e's stop-then-restart-serve sequence on the same
   * scratch host), so an eager delete here would break that reuse. Every scratch directory is
   * still covered on process exit regardless (tests/helpers/cli.ts's registry). */
  scratchRoot?: string
}

/** Spawns `node .test-dist/cli.js serve` in `host` and resolves once the first stdout line (the
 * served URL) arrives, or rejects after `timeoutMs`. */
export function startServeIn(host: string, timeoutMs = 15_000): Promise<Serve> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [cliPath, 'serve'], { cwd: host })
    let firstLine = ''
    const timer = setTimeout(() => {
      proc.stdout.off('data', onData)
      reject(new Error(`serve did not print a URL within ${timeoutMs}ms`))
    }, timeoutMs)
    const onData = (chunk: Buffer) => {
      if (firstLine) return
      firstLine = chunk.toString('utf8').split('\n')[0] ?? ''
      if (firstLine) {
        clearTimeout(timer)
        proc.stdout.off('data', onData)
        resolve({ child: proc, url: firstLine.trim(), host })
      }
    }
    proc.stdout.on('data', onData)
    proc.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/** Copies `fixtureDir` into a fresh scratch dir (see copyFixtureHost) and starts `serve` on it.
 * `stopServe` removes that scratch dir immediately once this `serve` stops (item 3: nothing this
 * helper creates for its own exclusive use should wait for process exit to be cleaned up). */
export async function startServe(fixtureDir: string, label = 'mock-review-serve-', timeoutMs = 15_000): Promise<Serve> {
  const host = copyFixtureHost(fixtureDir, label)
  const serve = await startServeIn(host, timeoutMs)
  return { ...serve, scratchRoot: path.dirname(host) }
}

/** Sends SIGTERM and waits for the child to exit, removing the portfile (D13 of spec 01), then
 * removes the scratch host directory `startServe` created for this call (never one a caller
 * passed to `startServeIn` directly — see `Serve.scratchRoot`'s doc). Runs the cleanup even when
 * the child had already exited (e.g. a test asserting `serve` crashed on its own), and even when
 * the test that called this is itself failing — `afterEach`/`finally` blocks call this
 * unconditionally, so a failed assertion still leaves nothing behind. */
export async function stopServe(serve: Serve | undefined): Promise<void> {
  if (!serve) return
  if (serve.child.exitCode === null && !serve.child.killed) {
    serve.child.kill('SIGTERM')
    await new Promise((resolve) => serve.child.once('exit', resolve))
  }
  if (serve.scratchRoot) removeScratchDir(serve.scratchRoot)
}
