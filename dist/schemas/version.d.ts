/** D1: the one place the contract version number lives. A leaf module that imports nothing, so
 * the six schema modules can import it without forming a cycle through `./index.js`. */
export declare const CONTRACT_VERSION: 3;
/** D11: EMPTY_NOTES and EMPTY_APPROVAL live here (not index.ts) and stay zod-free at runtime, so
 * the installed package's `src/ui` (which ships without the rest of `src/schemas`) can import
 * them directly from this leaf module instead of the barrel. */
import type { Notes } from './notes.js';
import type { Approval } from './approval.js';
/** D9: the file each host-touching verb creates when absent, never overwritten. */
export declare const EMPTY_NOTES: Notes;
export declare const EMPTY_APPROVAL: Approval;
//# sourceMappingURL=version.d.ts.map