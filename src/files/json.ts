// D9: the file layer every host-touching verb (`check`, `sweep`, `answer`, `serve`) shares.
// `ensureDesignFiles` creates `design/notes.json` and `design/approval.json` with their empty
// defaults only when absent — never overwritten — and every write anywhere in the package goes
// through `writeJsonAtomic` (write `<path>.tmp`, then `rename`) so a reader never observes a
// half-written file.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import { ApprovalSchema, EMPTY_APPROVAL, EMPTY_NOTES, NotesSchema } from '../schemas/index.js'
import type { Approval, Notes } from '../schemas/index.js'

/** Reads and parses a JSON file, validating it against `schema`. Throws (zod's error, or a
 * `SyntaxError`/`ENOENT` from the underlying read) on any failure — callers decide how to turn
 * that into a finding or a CLI refusal. */
export function readJson<T>(filePath: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(filePath, 'utf8')
  const value = JSON.parse(raw) as unknown
  return schema.parse(value)
}

/** D1: a design document that EXISTS but cannot be used: malformed JSON, an unknown
 * `contractVersion`, or a shape this package has not learned. `relPath` is the design-relative
 * path named in every refusal. */
export class UnparseableDesignFileError extends Error {
  constructor(public readonly relPath: string) {
    super(`${relPath} exists but does not parse — refusing to write until it's fixed by hand`)
  }
}

export type DocRead<T> = { ok: true; doc: T } | { ok: false; error: string }

const DESIGN_DOC_REL_PATH: { notes: string; approval: string } = {
  notes: 'design/notes.json',
  approval: 'design/approval.json',
}

/** D1: THE predicate. Every reader of `design/notes.json` and `design/approval.json` in this
 * package derives its behaviour from this one function, then chooses its own policy explicitly.
 * Callers never write their own `try { readJson(...) } catch`. */
export function readDesignDoc(cwd: string, kind: 'notes' | 'approval'): DocRead<Notes | Approval> {
  const relPath = DESIGN_DOC_REL_PATH[kind]
  const filePath = path.join(cwd, relPath)
  try {
    const doc = kind === 'notes' ? readJson(filePath, NotesSchema) : readJson(filePath, ApprovalSchema)
    return { ok: true, doc }
  } catch {
    return { ok: false, error: new UnparseableDesignFileError(relPath).message }
  }
}

/** D1: the write path's form: same verdict, expressed as the throw both POST handlers already
 * turn into a 409. Exists so the two paths cannot drift. */
export function readDesignDocOrThrow(cwd: string, kind: 'notes' | 'approval'): Notes | Approval {
  const relPath = DESIGN_DOC_REL_PATH[kind]
  const filePath = path.join(cwd, relPath)
  try {
    return kind === 'notes' ? readJson(filePath, NotesSchema) : readJson(filePath, ApprovalSchema)
  } catch {
    throw new UnparseableDesignFileError(relPath)
  }
}

/** Writes `obj` as JSON to `filePath` atomically: write a sibling `.tmp` file, then `rename` it
 * into place. `rename` on the same filesystem is atomic, so a concurrent reader never sees a
 * partial write, and no `.tmp` file survives a successful call. */
export function writeJsonAtomic(filePath: string, obj: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(obj))
  renameSync(tmpPath, filePath)
}

/** D9: ensures `design/notes.json` and `design/approval.json` exist under `cwd`, creating each
 * with its empty default only when it is absent. Called first by every verb that touches a
 * host (`check`, `sweep`, `answer`, `serve`). */
export function ensureDesignFiles(cwd: string): void {
  const designDir = path.join(cwd, 'design')
  mkdirSync(designDir, { recursive: true })

  const notesPath = path.join(designDir, 'notes.json')
  if (!existsSync(notesPath)) writeJsonAtomic(notesPath, EMPTY_NOTES)

  const approvalPath = path.join(designDir, 'approval.json')
  if (!existsSync(approvalPath)) writeJsonAtomic(approvalPath, EMPTY_APPROVAL)
}
