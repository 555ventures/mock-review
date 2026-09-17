// D8: the bare `serve` — a persistent Vite dev server mounting the mock-review plugin, a
// portfile written after listen(), and cleanup on SIGINT/SIGTERM/normal exit.
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { createServer } from 'vite'
import { loadHostVite } from '../analysis/host-modules.js'
import { runnerOf } from '../analysis/vite-runner.js'
import { ensureDesignFiles, writeJsonAtomic } from '../files/json.js'
import { ConfigSchema } from '../schemas/index.js'
import { mockReview } from './plugin.js'

/**
 * Reads `mock.config.ts`'s default export through the same Vite server D8 creates, so `serve`
 * never duplicates the analysis layer's config loader. Returns `undefined` (letting Vite fall
 * back to its own default port) when the module can't be imported or fails `ConfigSchema` —
 * `serve` never refuses to start over a bad `mock.config.ts` (D7 of specs/20260916/02 narrows
 * this to config problems only; a broken *runtime* — no module runner — is refused separately by
 * the startup probe below, before this is ever called). `check`'s `config` finding is the place
 * that reports a bad config.
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

  // D4 (specs/20260916/02): the server is created from the HOST's own vite, resolved from `cwd`
  // — never the package's bundled copy — so `serve` joins the host's plugins on one Vite instance
  // instead of running a second one beside them.
  const hostVite = await loadHostVite(cwd)
  const server = await hostVite.createServer({
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

  // D4/D7: a startup probe, run once before anything is printed or written — a runtime that
  // cannot supply a module runner (an SSR environment replaced by a host config into something
  // non-runnable) must fail here, on the terminal that started `serve`, as a one-line refusal
  // that propagates to `src/cli.ts`'s top-level catch (`mock-review: <message>`, exit 2, no
  // stdout). This never happens for a merely-bad `mock.config.ts` — that stays `readConfigPort`'s
  // silent fallback below (D7 narrows the "serve never refuses to start" note to config only).
  runnerOf(server.environments.ssr, { root: cwd, viteVersion: hostVite.version })

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
