/** D1: the one place the contract version number lives. A leaf module that imports nothing, so
 * the six schema modules can import it without forming a cycle through `./index.js`. */
export const CONTRACT_VERSION = 3;
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
};
//# sourceMappingURL=version.js.map