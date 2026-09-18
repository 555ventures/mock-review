// D9: the file layer every host-touching verb (`check`, `sweep`, `answer`, `serve`) shares.
// `ensureDesignFiles` creates `design/notes.json` and `design/approval.json` with their empty
// defaults only when absent — never overwritten — and every write anywhere in the package goes
// through `writeJsonAtomic` (write `<path>.tmp`, then `rename`) so a reader never observes a
// half-written file.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ApprovalSchema, EMPTY_APPROVAL, EMPTY_NOTES, NotesSchema } from '../schemas/index.js';
/** Reads and parses a JSON file, validating it against `schema`. Throws (zod's error, or a
 * `SyntaxError`/`ENOENT` from the underlying read) on any failure — callers decide how to turn
 * that into a finding or a CLI refusal. */
export function readJson(filePath, schema) {
    const raw = readFileSync(filePath, 'utf8');
    const value = JSON.parse(raw);
    return schema.parse(value);
}
/** D1: a design document that cannot be used: malformed JSON, an unknown `contractVersion`, or a
 * shape this package has not learned — or, at a caller that reached a document before
 * `ensureDesignFiles` created it, absent. `relPath` is the design-relative path named in every
 * refusal, and `missing` picks the sentence: the remedy for a corrupt document is to fix it by
 * hand, and naming an absent file "unparseable" would send the reader looking for damage that is
 * not there. Every real entry point creates both documents first (`runCheck`, `sweep`, `answer`,
 * `buildState`), so `missing` is unreachable through the CLI and the server today; it exists so
 * the one shared verdict cannot state something untrue about its input. */
export class UnparseableDesignFileError extends Error {
    relPath;
    missing;
    constructor(relPath, missing = false) {
        super(missing
            ? `${relPath} does not exist — run a host verb to create it`
            : `${relPath} exists but does not parse — refusing to write until it's fixed by hand`);
        this.relPath = relPath;
        this.missing = missing;
    }
}
const DESIGN_DOC_REL_PATH = {
    notes: 'design/notes.json',
    approval: 'design/approval.json',
};
/** D1: THE predicate. Every reader of `design/notes.json` and `design/approval.json` in this
 * package derives its behaviour from this one function, then chooses its own policy explicitly.
 * Callers never write their own `try { readJson(...) } catch`. */
export function readDesignDoc(cwd, kind) {
    const result = judgeDesignDoc(cwd, kind);
    return result.ok ? result : { ok: false, error: result.err.message };
}
/** D1: the write path's form: the SAME verdict, expressed as the throw both POST handlers already
 * turn into a 409. Both readers delegate to `judgeDesignDoc`, so there is exactly one catch site
 * and the read and write paths cannot disagree about the same bytes — two catch sites would be
 * precisely the drift D1 set out to make impossible. */
export function readDesignDocOrThrow(cwd, kind) {
    const result = judgeDesignDoc(cwd, kind);
    if (!result.ok)
        throw result.err;
    return result.doc;
}
/** The single catch site behind both public readers. Returns the error OBJECT rather than its
 * sentence, so the throwing form can rethrow the very error the result form describes instead of
 * re-deciding the verdict or parsing its own message back apart. */
function judgeDesignDoc(cwd, kind) {
    const relPath = DESIGN_DOC_REL_PATH[kind];
    const filePath = path.join(cwd, relPath);
    try {
        const doc = kind === 'notes' ? readJson(filePath, NotesSchema) : readJson(filePath, ApprovalSchema);
        return { ok: true, doc };
    }
    catch {
        return { ok: false, err: new UnparseableDesignFileError(relPath, !existsSync(filePath)) };
    }
}
/** Writes `obj` as JSON to `filePath` atomically: write a sibling `.tmp` file, then `rename` it
 * into place. `rename` on the same filesystem is atomic, so a concurrent reader never sees a
 * partial write, and no `.tmp` file survives a successful call. */
export function writeJsonAtomic(filePath, obj) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(obj));
    renameSync(tmpPath, filePath);
}
/** D9: ensures `design/notes.json` and `design/approval.json` exist under `cwd`, creating each
 * with its empty default only when it is absent. Called first by every verb that touches a
 * host (`check`, `sweep`, `answer`, `serve`). */
export function ensureDesignFiles(cwd) {
    const designDir = path.join(cwd, 'design');
    mkdirSync(designDir, { recursive: true });
    const notesPath = path.join(designDir, 'notes.json');
    if (!existsSync(notesPath))
        writeJsonAtomic(notesPath, EMPTY_NOTES);
    const approvalPath = path.join(designDir, 'approval.json');
    if (!existsSync(approvalPath))
        writeJsonAtomic(approvalPath, EMPTY_APPROVAL);
}
//# sourceMappingURL=json.js.map