import type { Finding } from '../schemas/index.js';
/**
 * D5 `type` findings: one per TypeScript pre-emit diagnostic under `<cwd>/src/`, from
 * `ts.createProgram` on `tsconfig.app.json` (the root `tsconfig.json` is a references stub with
 * `files: []` — spike c). `message` = `TS<code>: <text> at <line>:<col>` (1-based).
 */
export declare function typeFindings(cwd: string): Finding[];
//# sourceMappingURL=typecheck.d.ts.map