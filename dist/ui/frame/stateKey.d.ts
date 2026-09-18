export type StateResolution = {
    /** state → the example key it resolved to (exact, or the unique normalised match). */
    byState: Map<string, string>;
    /** states with no exact and no normalised candidate. */
    unmatched: string[];
    /** states with no exact match and two or more normalised candidates (keys in exampleKeys order). */
    ambiguous: {
        state: string;
        keys: string[];
    }[];
};
/** Lowercase, strip everything outside `a-z0-9`. */
export declare function stateKey(s: string): string;
/** Exact match first, then a unique normalised match; each example key is claimed by at most
 * one state; ambiguity (two or more unclaimed normalised candidates) leaves the state unbound. */
export declare function resolveStates(states: readonly string[], exampleKeys: readonly string[]): StateResolution;
/** Single-lookup form: exactly `resolveStates([state], exampleKeys).byState.get(state)`. */
export declare function resolveState(exampleKeys: readonly string[], state: string): string | undefined;
//# sourceMappingURL=stateKey.d.ts.map