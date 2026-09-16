import type { z } from 'zod';
/** Reads and parses a JSON file, validating it against `schema`. Throws (zod's error, or a
 * `SyntaxError`/`ENOENT` from the underlying read) on any failure — callers decide how to turn
 * that into a finding or a CLI refusal. */
export declare function readJson<T>(filePath: string, schema: z.ZodType<T>): T;
/** Writes `obj` as JSON to `filePath` atomically: write a sibling `.tmp` file, then `rename` it
 * into place. `rename` on the same filesystem is atomic, so a concurrent reader never sees a
 * partial write, and no `.tmp` file survives a successful call. */
export declare function writeJsonAtomic(filePath: string, obj: unknown): void;
/** D9: ensures `design/notes.json` and `design/approval.json` exist under `cwd`, creating each
 * with its empty default only when it is absent. Called first by every verb that touches a
 * host (`check`, `sweep`, `answer`, `serve`). */
export declare function ensureDesignFiles(cwd: string): void;
//# sourceMappingURL=json.d.ts.map