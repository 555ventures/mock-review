import path from 'node:path'
import { createServer, isRunnableDevEnvironment } from 'vite'

export type Runner = {
  import: (absPath: string) => Promise<unknown>
}

/**
 * D4: one silent middleware-mode Vite dev server per `check`, loading host modules through
 * `server.environments.ssr.runner.import()` (the Environment API). The server always closes,
 * even when `fn` throws — the caller decides what a thrown error means (D5's `config` finding
 * for a runner that cannot start at all).
 */
export async function withRunner<T>(cwd: string, fn: (runner: Runner) => Promise<T>): Promise<T> {
  const configFile = path.join(cwd, 'vite.config.ts')
  const server = await createServer({
    root: cwd,
    configFile,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
  })

  try {
    const ssrEnv = server.environments.ssr
    if (!isRunnableDevEnvironment(ssrEnv)) {
      throw new Error('the ssr environment is not runnable (no module runner)')
    }
    const runner: Runner = {
      import: (absPath: string) => ssrEnv.runner.import(absPath),
    }
    return await fn(runner)
  } finally {
    await server.close()
  }
}
