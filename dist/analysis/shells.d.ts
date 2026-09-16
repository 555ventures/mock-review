import type { Shell } from '../schemas/index.js';
import type { Runner } from './vite-runner.js';
import type { DiscoveredFile } from './discover.js';
/** D6: `shells[]` — the discovered shell's named `examples` keys, loaded through the Vite runner. */
export declare function shellReport(cwd: string, runner: Runner, discovered: DiscoveredFile[]): Promise<Shell[]>;
//# sourceMappingURL=shells.d.ts.map