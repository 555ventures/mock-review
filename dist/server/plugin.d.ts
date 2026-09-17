import { type Plugin } from 'vite';
/**
 * The reviewer's Vite plugin. Mounts the server API under `/__mock-review/` (D6), the in-memory
 * component registry at `GET /r/registry.json` (reference §10), and `GET /` (owner, `?client=`,
 * `?frame=1` alike) as the one entry document (D1) ahead of Vite's own middlewares. `resolveId`/
 * `load` answer the virtual entry module id (D1). An unconditional, object-form `order: 'pre'`
 * `hotUpdate` hook (specs/20260916/01 D1-D3) runs ahead of every host plugin in both mounts
 * (`serve` and a host's own `vite.config.ts`): in the client environment, any file under
 * `<root>/design/` is silenced (`[]`, nothing sent) so the host's Tailwind scan never full-reloads
 * the reviewer on a design write, and any file under `<root>/src/` sends the frame-only
 * `mock-review:frame-reload` custom event and returns `[]`; every other file, and every
 * non-client environment, gets Vite's default handling (`undefined`).
 */
export declare function mockReview(): Plugin;
export default mockReview;
//# sourceMappingURL=plugin.d.ts.map