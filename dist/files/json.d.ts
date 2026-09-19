import type { z } from 'zod';
import type { Approval, Notes } from '../schemas/index.js';
/** Reads and parses a JSON file, validating it against `schema`. Throws (zod's error, or a
 * `SyntaxError`/`ENOENT` from the underlying read) on any failure — callers decide how to turn
 * that into a finding or a CLI refusal. */
export declare function readJson<T>(filePath: string, schema: z.ZodType<T>): T;
/** D1: a design document that cannot be used: malformed JSON, an unknown `contractVersion`, or a
 * shape this package has not learned — or, at a caller that reached a document before
 * `ensureDesignFiles` created it, absent. `relPath` is the design-relative path named in every
 * refusal, and `missing` picks the sentence: the remedy for a corrupt document is to fix it by
 * hand, and naming an absent file "unparseable" would send the reader looking for damage that is
 * not there. Every real entry point creates both documents first (`runCheck`, `sweep`, `answer`,
 * `buildState`), so `missing` is unreachable through the CLI and the server today; it exists so
 * the one shared verdict cannot state something untrue about its input. */
export declare class UnparseableDesignFileError extends Error {
    readonly relPath: string;
    readonly missing: boolean;
    constructor(relPath: string, missing?: boolean);
}
export type DocRead<T> = {
    ok: true;
    doc: T;
} | {
    ok: false;
    error: string;
};
/** D1: THE predicate. Every reader of `design/notes.json` and `design/approval.json` in this
 * package derives its behaviour from this one function, then chooses its own policy explicitly.
 * Callers never write their own `try { readJson(...) } catch`. */
export declare function readDesignDoc(cwd: string, kind: 'notes' | 'approval'): DocRead<Notes | Approval>;
/** D1: the write path's form: the SAME verdict, expressed as the throw both POST handlers already
 * turn into a 409. Both readers delegate to `judgeDesignDoc`, so there is exactly one catch site
 * and the read and write paths cannot disagree about the same bytes — two catch sites would be
 * precisely the drift D1 set out to make impossible. */
export declare function readDesignDocOrThrow(cwd: string, kind: 'notes' | 'approval'): Notes | Approval;
/** Writes `obj` as JSON to `filePath` atomically: write a sibling temp file, then `rename` it into
 * place. `rename` on the same filesystem is atomic, so a concurrent reader never sees a partial
 * write. D1: the temp name is unique per process AND per call —
 * `` `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp` `` — because a FIXED
 * `.tmp` name is what makes *concurrent* writers tear each other: two `writeFileSync` calls land
 * in the same inode before either renames, and the first `rename` publishes a half-merged file.
 * If `rename` fails, the temp file is unlinked before the original error is rethrown, so a failed
 * publish never leaves an orphaned temp file behind. */
export declare function writeJsonAtomic(filePath: string, obj: unknown): void;
/** D9/D3: ensures `design/notes.json` and `design/approval.json` exist under `cwd`, creating each
 * with its empty default only when it is absent. Called first by every verb that touches a host
 * (`check`, `sweep`, `answer`, `serve`). D3: creation uses the `wx` flag — exclusive create — and
 * swallows only `EEXIST`, rethrowing anything else. `wx` makes creation itself the exclusion:
 * an `existsSync`-then-write check-then-act has a real window where two verbs starting together
 * both see "absent" and the second overwrites the first's freshly created file; with `wx` a losing
 * creator's `writeFileSync` throws and writes nothing, so no lock is needed here. */
export declare function ensureDesignFiles(cwd: string): void;
/** D2: raised when `design/` stayed locked for the whole acquire window. Distinct from
 * `UnparseableDesignFileError`: the document is fine, the timing is not — the remedy is to retry,
 * never to edit a file by hand. */
export declare class DesignLockedError extends Error {
    readonly holderPid: number;
    constructor(holderPid: number);
}
/** D2: runs `fn` while holding the exclusive `design/.lock` (one lock covers BOTH
 * `notes.json` and `approval.json`). Acquire is `openSync(lockPath, 'wx')`; `EEXIST` means held,
 * and `tryBreakStaleLock` decides whether to break it. Retries every `RETRY_MS` for at most
 * `ACQUIRE_TIMEOUT_MS`, then throws `DesignLockedError`. Released in `finally`, and by the
 * module-level exit handler if the process dies first. ASYNC so the retry can `await` a timer
 * instead of blocking the server's event loop. */
export declare function withDesignLock<T>(cwd: string, fn: () => T | Promise<T>): Promise<T>;
//# sourceMappingURL=json.d.ts.map