import path from 'node:path';
import { loadHostVite } from './host-modules.js';
/** D2: duck-typed narrowing of a Vite ssr `DevEnvironment`, never `instanceof
 * RunnableDevEnvironment` (that class check is false whenever `env` came from a different physical
 * copy of vite than the package's own — spike S7, the whole reason this spec exists). `env`
 * qualifies when `env.runner.import` is a function; the returned `Runner.import` calls it as a
 * method ON `env.runner` (never detached) — the real `ModuleRunner.import` reads `this` (e.g.
 * `this.cachedModule`), so a detached reference throws `Cannot read properties of undefined
 * (reading 'cachedModule')` against a real runner even though the shape check passed. */
export function runnerOf(env, ctx) {
    const candidate = env;
    const runner = candidate?.runner;
    if (typeof runner?.import !== 'function') {
        throw new Error(`the host's Vite ssr environment has no module runner (vite ${ctx.viteVersion} at ${ctx.root}) — mock-review needs one vite 8 in the host`);
    }
    const runnerImport = runner.import;
    return {
        import: (absPath) => runnerImport.call(runner, absPath),
    };
}
/**
 * D4: one silent middleware-mode Vite dev server per `check`, loading host modules through
 * `server.environments.ssr.runner.import()` (the Environment API). The server is created from the
 * HOST's own `vite` (`loadHostVite`, D3) — never the package's own copy — so `check`'s one-shot
 * server and the host's own plugins (which import `vite` from their own realpath) share one
 * instance. The server always closes, even when `fn` throws — the caller decides what a thrown
 * error means (D5's `config` finding for a runner that cannot start at all).
 */
export async function withRunner(cwd, fn) {
    const hostVite = await loadHostVite(cwd);
    const configFile = path.join(cwd, 'vite.config.ts');
    const server = await hostVite.createServer({
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
        const runner = runnerOf(server.environments.ssr, { root: cwd, viteVersion: hostVite.version });
        return await fn(runner);
    }
    finally {
        await server.close();
    }
}
//# sourceMappingURL=vite-runner.js.map