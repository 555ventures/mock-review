export * from './version.js';
export * from './contract.js';
export * from './config.js';
export * from './check.js';
export * from './sweep.js';
export * from './notes.js';
export * from './approval.js';
export * from './decisions.js';
import { CONTRACT_VERSION } from './version.js';
/** D9: the file each host-touching verb creates when absent, never overwritten. */
export const EMPTY_NOTES = {
    contractVersion: CONTRACT_VERSION,
    notes: [],
    journeys: {},
};
export const EMPTY_APPROVAL = {
    contractVersion: CONTRACT_VERSION,
    screens: {},
    journeys: {},
    theme: null,
};
export const EMPTY_DECISIONS = {
    contractVersion: CONTRACT_VERSION,
    decisions: [],
};
//# sourceMappingURL=index.js.map