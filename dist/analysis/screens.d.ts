import type { Finding, Screen } from '../schemas/index.js';
import type { Runner } from './vite-runner.js';
import type { DiscoveredFile } from './discover.js';
export type ScreenReportResult = {
    screens: Screen[];
    findings: Finding[];
    /** Screen name -> import specifiers (feeds `usedOn` in the sweep inventory). */
    specifiersByScreen: Map<string, string[]>;
    /** Screen name -> example key -> its rendered HTML (successful renders only). */
    htmlByScreen: Map<string, Record<string, string>>;
    /** D21: screen name -> `Object.keys(examples)` (every declared example, render success or not;
     * `[]` for a screen whose module cannot be imported at all). Feeds `ServerScreenSchema.examples`
     * — the page's state list source (D3/D21), distinct from `htmlByScreen`'s render-only keys. */
    examplesByScreen: Map<string, string[]>;
};
/**
 * D5/D6/D17/D19(d): one pass per discovered screen — hash and line count from the raw bytes,
 * `meta`/`examples` loaded through the Vite runner, a `render` finding per throwing example
 * (`message: "<examples key>: <error.message>"` per D17's ruling on D5 vs the former AC-8
 * literal), a `size` warning over 150 lines, and a `states` warning per `meta.states` entry with
 * no case-insensitively matching `examples` key. A screen whose module import itself throws
 * (not per-example) reports exactly one `render` finding, `"module failed to load:
 * <error.message>"` (D17), and skips meta/examples processing entirely — no `meta: missing`
 * follow-on finding (D19(d)). A screen whose module *loads* but has no `meta` still reports
 * `states: []` plus a `render` finding `meta: missing` (D6). Both cases keep the screen's row in
 * `screens[]` with `states: []`.
 */
export declare function screenReport(cwd: string, runner: Runner, discovered: DiscoveredFile[]): Promise<ScreenReportResult>;
/**
 * D7: the default example for journey resolution — the one named like `meta.states[0]`
 * (case-insensitively), or failing that the first `examples` entry.
 */
export declare function pickDefaultHtml(screen: Screen, htmlByScreen: Map<string, Record<string, string>>): string | undefined;
//# sourceMappingURL=screens.d.ts.map