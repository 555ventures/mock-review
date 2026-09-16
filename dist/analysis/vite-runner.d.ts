export type Runner = {
    import: (absPath: string) => Promise<unknown>;
};
/**
 * D4: one silent middleware-mode Vite dev server per `check`, loading host modules through
 * `server.environments.ssr.runner.import()` (the Environment API). The server always closes,
 * even when `fn` throws — the caller decides what a thrown error means (D5's `config` finding
 * for a runner that cannot start at all).
 */
export declare function withRunner<T>(cwd: string, fn: (runner: Runner) => Promise<T>): Promise<T>;
//# sourceMappingURL=vite-runner.d.ts.map