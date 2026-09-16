import type { Check } from '../schemas/index.js';
/**
 * D5-D8: composes the analysis modules into one `Check`, validated against `CheckSchema` before
 * return. Behavior order (spec 01): ensure design files (D9) -> discover (D3) -> open the Vite
 * runner and load config/screens/shells/journeys through it (D4/D5/D6/D7) -> close the runner ->
 * the TypeScript pass, layer/doc findings, and liveness (D5/D8). A runner that cannot start at
 * all (Vite refuses, `vite.config.ts` missing) reports one `config` finding naming
 * `vite.config.ts` and an otherwise-empty report, per D5's Behavior note.
 */
export declare function runCheck(cwd: string): Promise<Check>;
//# sourceMappingURL=check.d.ts.map