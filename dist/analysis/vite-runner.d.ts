export type Runner = {
    import: (absPath: string) => Promise<unknown>;
};
export type RunnerContext = {
    root: string;
    viteVersion: string;
};
/** D2: duck-typed narrowing of a Vite ssr `DevEnvironment`, never `instanceof
 * RunnableDevEnvironment` (that class check is false whenever `env` came from a different physical
 * copy of vite than the package's own — spike S7, the whole reason this spec exists). `env`
 * qualifies when `env.runner.import` is a function; the returned `Runner.import` calls it as a
 * method ON `env.runner` (never detached) — the real `ModuleRunner.import` reads `this` (e.g.
 * `this.cachedModule`), so a detached reference throws `Cannot read properties of undefined
 * (reading 'cachedModule')` against a real runner even though the shape check passed. */
export declare function runnerOf(env: unknown, ctx: RunnerContext): Runner;
/**
 * D4: one silent middleware-mode Vite dev server per `check`, loading host modules through
 * `server.environments.ssr.runner.import()` (the Environment API). The server is created from the
 * HOST's own `vite` (`loadHostVite`, D3) — never the package's own copy — so `check`'s one-shot
 * server and the host's own plugins (which import `vite` from their own realpath) share one
 * instance. The server always closes, even when `fn` throws — the caller decides what a thrown
 * error means (D5's `config` finding for a runner that cannot start at all).
 */
export declare function withRunner<T>(cwd: string, fn: (runner: Runner) => Promise<T>): Promise<T>;
//# sourceMappingURL=vite-runner.d.ts.map