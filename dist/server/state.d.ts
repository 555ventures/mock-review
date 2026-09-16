import type { Runner } from '../analysis/vite-runner.js';
import type { ServerState } from '../schemas/patches.js';
/**
 * D6/D20: builds one `ServerState` for `cwd`. `role` is decided by the caller (plugin.ts, from
 * the request's `Referer`/`?client=` token) since it has nothing to do with the host's own files.
 * `runner` is the *persistent* `serve` server's own `server.environments.ssr` runner
 * (plugin.ts) — never a fresh one-shot `createServer` (D20: a second Vite server pointed at the
 * same root computes a different config hash and deletes the shared `node_modules/.vite/deps`
 * out from under `serve`'s own optimizer, 504-ing every later frame request). Never throws: a
 * runner call that fails outright is recorded as one entry in `violations` and every
 * analysis-derived field falls back to empty/`NULL_CONFIG`, mirroring `runCheck`'s D5 behavior
 * note.
 */
export declare function buildState(cwd: string, role: 'owner' | 'client', runner: Runner): Promise<ServerState>;
//# sourceMappingURL=state.d.ts.map