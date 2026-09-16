import path from 'node:path';
import { createServer, isRunnableDevEnvironment } from 'vite';
/**
 * D4: one silent middleware-mode Vite dev server per `check`, loading host modules through
 * `server.environments.ssr.runner.import()` (the Environment API). The server always closes,
 * even when `fn` throws — the caller decides what a thrown error means (D5's `config` finding
 * for a runner that cannot start at all).
 */
export async function withRunner(cwd, fn) {
    const configFile = path.join(cwd, 'vite.config.ts');
    const server = await createServer({
        root: cwd,
        configFile,
        logLevel: 'silent',
        appType: 'custom',
        // D22: a one-shot verb's optimizer gets its own cache directory, distinct from the persistent
        // `serve` server's default `node_modules/.vite/deps` — a second Vite server pointed at the
        // same shared cache computes a different config hash and evicts `serve`'s optimized deps out
        // from under it (D20's mechanism), 504-ing every later frame request even when `check`/
        // `check --look` only ran briefly alongside a live `serve`.
        cacheDir: path.join(cwd, 'node_modules', '.vite', 'mock-review-check'),
        // D20 (secondary guard): disable the FS watcher outright — `check`'s runner is one-shot and
        // the watcher's handles otherwise survive `server.close()` and keep the event loop alive.
        server: { middlewareMode: true, watch: null },
    });
    try {
        const ssrEnv = server.environments.ssr;
        if (!isRunnableDevEnvironment(ssrEnv)) {
            throw new Error('the ssr environment is not runnable (no module runner)');
        }
        const runner = {
            import: (absPath) => ssrEnv.runner.import(absPath),
        };
        return await fn(runner);
    }
    finally {
        await server.close();
    }
}
//# sourceMappingURL=vite-runner.js.map