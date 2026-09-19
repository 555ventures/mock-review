/** D23: matches `^<name>-<state>-<WxH>-<scheme>\.png$` exactly — a plain `startsWith(name + '-')`
 * also matched a sibling screen whose name shares `name` as a prefix (e.g. `home` matching
 * `home-detail-...png`). D3: moved verbatim from `src/server/plugin.ts:165-173` so the CLI's
 * `approve` verb and the server share one implementation of the `screenshots` field. */
export declare function screenshotsFor(cwd: string, name: string): string[];
//# sourceMappingURL=screenshots.d.ts.map