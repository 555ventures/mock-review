import type { ViteDevServer } from 'vite';
export type SseEvent = 'notes' | 'approval' | 'files';
/**
 * Subscribes `emit` to file changes under `cwd`: `design/notes.json` -> `notes`,
 * `design/approval.json` -> `approval`, anything under `src/` or `mock.config.ts` (D23) -> a
 * `files` event debounced at 200 ms (the Gotcha: a host's own HMR can fire a burst of `src/**`
 * events per edit). Returns a disposer that removes every listener and clears any pending
 * debounce timer.
 */
export declare function watchDesignFiles(server: ViteDevServer, cwd: string, emit: (event: SseEvent) => void): () => void;
//# sourceMappingURL=watch.d.ts.map