import { type Plugin } from 'vite';
/**
 * The reviewer's Vite plugin. Mounts the server API under `/__mock-review/` (D6), the in-memory
 * component registry at `GET /r/registry.json` (reference §10), and `GET /` (owner, `?client=`,
 * `?frame=1` alike) as the one entry document (D1) ahead of Vite's own middlewares. `resolveId`/
 * `load` answer the virtual entry module id (D1); `standalone` (set by `serve.ts`, omitted by a
 * host's own `vite.config.ts` mount) adds D9's `hotUpdate` interception so a host source edit
 * reloads the frame document, never the reviewer document.
 */
export declare function mockReview(options?: {
    standalone?: boolean;
}): Plugin;
export default mockReview;
//# sourceMappingURL=plugin.d.ts.map