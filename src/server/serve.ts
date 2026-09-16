// D8: the bare `serve` — a persistent Vite dev server mounting the mock-review plugin, a
// portfile written after listen(), and cleanup on SIGINT/SIGTERM/normal exit.
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { ensureDesignFiles, writeJsonAtomic } from '../files/json.js'
import { ConfigSchema } from '../schemas/index.js'
import { mockReview } from './plugin.js'

/**
 * Reads `mock.config.ts`'s default export through the same Vite server D8 creates, so `serve`
 * never duplicates the analysis layer's config loader. Returns `undefined` (letting Vite fall
 * back to its own default port) when the module can't be imported or fails `ConfigSchema` —
 * `serve` never refuses to start over a bad config; `check`'s `config` finding is the place that
 * reports that.
 */
async function readConfigPort(server: Awaited<ReturnType<typeof createServer>>): Promise<number | undefined> {
  try {
    const mod = (await server.ssrLoadModule('/mock.config.ts')) as { default?: unknown }
    const parsed = ConfigSchema.safeParse(mod.default)
    return parsed.success ? parsed.data.port : undefined
  } catch {
    return undefined
  }
}

/**
 * Starts the bare reviewer server in `cwd` (D8). Ensures the design files (D9), creates the Vite
 * dev server with the mock-review plugin mounted, listens on the host's configured port
 * (falling back to Vite's default when the config can't be read), writes `design/.serve.json`,
 * and prints the resolved URL as the process's first stdout line.
 *
 * Never resolves during normal operation — `serve` runs until `SIGINT`/`SIGTERM`, at which point
 * it removes the portfile, closes the server, and exits the process with code 0.
 */
export async function startServe(cwd: string): Promise<void> {
  ensureDesignFiles(cwd)

  const server = await createServer({
    root: cwd,
    configFile: path.join(cwd, 'vite.config.ts'),
    logLevel: 'silent',
    appType: 'custom',
    plugins: [mockReview()],
    server: {
      strictPort: false,
      host: '127.0.0.1',
    },
  })

  // Vite's own createServer() registers `process.once('SIGINT'/'SIGTERM', ...)` handlers that
  // call `process.exit(<signal code>)` (143 for SIGTERM) directly — see the repair note in the
  // sidecar. Node invokes same-event listeners in registration order, so Vite's handler would
  // run before ours and exit the process before the portfile is removed or D8's exit-0 contract
  // is honored. Strip them here, before this process's own handlers are registered below, so
  // this module is the sole owner of both signals for the lifetime of `serve`.
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')

  const port = await readConfigPort(server)
  if (port === undefined) {
    await server.listen()
  } else {
    await server.listen(port)
  }

  const resolvedLocal = server.resolvedUrls?.local[0] ?? ''
  const url = resolvedLocal.replace(/\/$/, '')

  const portfilePath = path.join(cwd, 'design', '.serve.json')
  writeJsonAtomic(portfilePath, { url, pid: process.pid })
  process.stdout.write(url + '\n')

  const removePortfile = () => {
    try {
      if (existsSync(portfilePath)) rmSync(portfilePath, { force: true })
    } catch {
      // best-effort cleanup — a failed unlink here must never crash shutdown
    }
  }

  let shuttingDown = false
  const shutdown = (exitCode: number) => {
    if (shuttingDown) return
    shuttingDown = true
    removePortfile()
    void server
      .close()
      .catch(() => {
        // best-effort — the process is exiting regardless
      })
      .finally(() => process.exit(exitCode))
  }

  process.once('SIGINT', () => shutdown(0))
  process.once('SIGTERM', () => shutdown(0))
  process.once('exit', removePortfile)

  return new Promise(() => {
    // Deliberately never resolves: `serve` stays up until a signal drives `shutdown` above.
  })
}
