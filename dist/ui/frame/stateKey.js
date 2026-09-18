/** Lowercase, strip everything outside `a-z0-9`. */
export function stateKey(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}
/** Exact match first, then a unique normalised match; each example key is claimed by at most
 * one state; ambiguity (two or more unclaimed normalised candidates) leaves the state unbound. */
export function resolveStates(states, exampleKeys) {
    const byState = new Map();
    const unmatched = [];
    const ambiguous = [];
    const claimed = new Set();
    const distinctStates = [...new Set(states)];
    // Pass 1: exact.
    for (const state of distinctStates) {
        if (!claimed.has(state) && exampleKeys.includes(state)) {
            byState.set(state, state);
            claimed.add(state);
        }
    }
    // Pass 2: unique normalised, only for states pass 1 left unbound.
    for (const state of distinctStates) {
        if (byState.has(state))
            continue;
        const normalisedState = stateKey(state);
        if (normalisedState === '') {
            unmatched.push(state);
            continue;
        }
        const candidates = exampleKeys.filter((k) => !claimed.has(k) && stateKey(k) === normalisedState);
        if (candidates.length === 1) {
            const key = candidates[0];
            if (key !== undefined) {
                byState.set(state, key);
                claimed.add(key);
            }
        }
        else if (candidates.length >= 2) {
            ambiguous.push({ state, keys: candidates });
        }
        else {
            unmatched.push(state);
        }
    }
    return { byState, unmatched, ambiguous };
}
/** Single-lookup form: exactly `resolveStates([state], exampleKeys).byState.get(state)`. */
export function resolveState(exampleKeys, state) {
    return resolveStates([state], exampleKeys).byState.get(state);
}
//# sourceMappingURL=stateKey.js.map