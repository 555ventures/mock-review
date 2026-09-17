export type FrameRoute = {
    kind: 'screen';
    screen: string;
    state?: string | undefined;
    scheme?: string | undefined;
} | {
    kind: 'component';
    name?: string | undefined;
    example?: string | undefined;
    scheme?: string | undefined;
};
/** `''` and `'#/'` → undefined. Unknown params ignored. Never throws. */
export declare function parseFrameHash(hash: string): FrameRoute | undefined;
/** Inverse of parseFrameHash. Byte-identical to the retired builders: `encodeURIComponent` per
 * value (space → %20, never +), params in the order state | name, example, then scheme. */
export declare function buildFrameHash(route: FrameRoute): string;
/** Identity only: screen+state or name+example. Ignores scheme and everything else. */
export declare function sameScreenState(a: FrameRoute, b: FrameRoute): boolean;
/** `/?frame=1[&_theme=<key>]<hash>` — `_theme` stays in the real search string (spec 02 D18e). */
export declare function frameSrc(route: FrameRoute, theme?: string | null): string;
/** Rule 16: replace with the FULL url (a bare `#…` would load the reviewer inside the frame);
 * no-op when the hash already matches. The old `scheme?: 'dark'` argument is gone. */
export declare function replaceFrameHash(win: Window, route: FrameRoute): void;
//# sourceMappingURL=frameRoute.d.ts.map