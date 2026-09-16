export * from './contract.js';
export * from './config.js';
export * from './check.js';
export * from './sweep.js';
export * from './notes.js';
export * from './approval.js';
export * from './decisions.js';
/** D9: the file each host-touching verb creates when absent, never overwritten. */
export const EMPTY_NOTES = {
    contractVersion: 1,
    notes: [],
    journeys: {},
};
export const EMPTY_APPROVAL = {
    contractVersion: 1,
    screens: {},
    journeys: {},
    theme: null,
};
export const EMPTY_DECISIONS = {
    contractVersion: 1,
    decisions: [],
};
//# sourceMappingURL=index.js.map