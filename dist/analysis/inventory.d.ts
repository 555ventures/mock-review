import type { InventoryRow } from '../schemas/index.js';
import type { DiscoveredFile } from './discover.js';
/**
 * D11: one `react-docgen-typescript` parser built with `withCustomConfig('tsconfig.app.json', …)`
 * and one `parse([...files])` call across every discovered component and shell. `usedOn` is
 * computed from the already-collected screen import specifiers (D6/imports.ts), never from a
 * second file read.
 */
export declare function inventory(cwd: string, components: DiscoveredFile[], shells: DiscoveredFile[], screens: {
    name: string;
    specifiers: string[];
}[]): InventoryRow[];
//# sourceMappingURL=inventory.d.ts.map