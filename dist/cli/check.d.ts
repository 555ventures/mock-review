import type { Check } from '../schemas/index.js';
/**
 * D12/D23: when `screen` is given (`--look <screen>` was passed with a screen name), captures
 * screenshots and exits the process directly once its one-path-per-line output has flushed
 * (D20's "flush then exit explicitly" pattern) — this bypasses the dispatcher's own `check`
 * JSON/text printing entirely, since a look's stdout contract (paths, not a `Check`) is
 * unconditional regardless of `--json`. `screen` undefined and `lookRequested` false means
 * `--look` was not passed at all: spec 01's plain `check` behavior. `lookRequested` true with
 * `screen` undefined is a bare `--look` with no screen name (D23): exit 2.
 */
export declare function checkVerb(cwd: string, screen?: string, state?: string, lookRequested?: boolean): Promise<Check>;
/** File Plan: text form — one line per finding, then `ok`/`not ok`. */
export declare function formatCheckText(check: Check): string;
//# sourceMappingURL=check.d.ts.map