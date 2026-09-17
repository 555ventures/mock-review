/** D1: the one place the contract version number lives. A leaf module that imports nothing, so
 * the six schema modules can import it without forming a cycle through `./index.js`. */
export const CONTRACT_VERSION = 2 as const
