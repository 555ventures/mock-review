import type { Config } from '../schemas/index.js';
/** Thrown when `playwright` cannot be resolved from the host root. The message is exactly the
 * remedy text the dispatcher (src/cli.ts) prints after its `mock-review: ` prefix. */
export declare class PlaywrightUnresolvedError extends Error {
}
export type LookOptions = {
    /** The host root — where `design/screenshots/` is written and where `playwright` is resolved. */
    root: string;
    screen: string;
    /** A single state to capture; omit to capture every entry in `states`. */
    state?: string;
    /** A live `serve` URL (already probed live by the caller, e.g. `src/analysis/liveness.ts`). */
    serveUrl: string;
    config: Config;
    /** The screen's full state list, used when `state` is omitted. */
    states: string[];
    /** D22: `approval.theme`, when one is picked — folded into the frame URL as `_theme=<key>` so a
     * capture carries the picked theme now that the frame no longer fetches `GET state` (D20). */
    theme?: string;
};
/**
 * D12/D22: opens `<serveUrl>/?frame=1[&_theme=<theme>]#/<screen>?state=<s>&scheme=<scheme>` for
 * every `config.targets.viewports x config.targets.schemes x` (one state, or every state in
 * `states` when `state` is omitted) in headless Chromium at that viewport size, waits for network
 * idle, and writes `design/screenshots/<screen>-<state>-<WxH>-<scheme>.png`. Returns the written
 * paths, relative to `root`, in capture order. Always closes the browser, even on a mid-capture
 * failure.
 */
export declare function look(options: LookOptions): Promise<string[]>;
//# sourceMappingURL=look.d.ts.map