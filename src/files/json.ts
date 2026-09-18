// D9: the file layer every host-touching verb (`check`, `sweep`, `answer`, `serve`) shares.
// `ensureDesignFiles` creates `design/notes.json` and `design/approval.json` with their empty
// defaults only when absent — never overwritten — and every write anywhere in the package goes
// through `writeJsonAtomic` (write `<path>.tmp`, then `rename`) so a reader never observes a
// half-written file.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
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

/** D1: a design document that cannot be used: malformed JSON, an unknown `contractVersion`, or a
 * shape this package has not learned — or, at a caller that reached a document before
 * `ensureDesignFiles` created it, absent. `relPath` is the design-relative path named in every
 * refusal, and `missing` picks the sentence: the remedy for a corrupt document is to fix it by
 * hand, and naming an absent file "unparseable" would send the reader looking for damage that is
 * not there. Every real entry point creates both documents first (`runCheck`, `sweep`, `answer`,
 * `buildState`), so `missing` is unreachable through the CLI and the server today; it exists so
 * the one shared verdict cannot state something untrue about its input. */
export class UnparseableDesignFileError extends Error {
  constructor(
    public readonly relPath: string,
    public readonly missing = false,
  ) {
    super(
      missing
        ? `${relPath} does not exist — run a host verb to create it`
        : `${relPath} exists but does not parse — refusing to write until it's fixed by hand`,
    )
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
  const result = judgeDesignDoc(cwd, kind)
  return result.ok ? result : { ok: false, error: result.err.message }
}

/** D1: the write path's form: the SAME verdict, expressed as the throw both POST handlers already
 * turn into a 409. Both readers delegate to `judgeDesignDoc`, so there is exactly one catch site
 * and the read and write paths cannot disagree about the same bytes — two catch sites would be
 * precisely the drift D1 set out to make impossible. */
export function readDesignDocOrThrow(cwd: string, kind: 'notes' | 'approval'): Notes | Approval {
  const result = judgeDesignDoc(cwd, kind)
  if (!result.ok) throw result.err
  return result.doc
}

/** The single catch site behind both public readers. Returns the error OBJECT rather than its
 * sentence, so the throwing form can rethrow the very error the result form describes instead of
 * re-deciding the verdict or parsing its own message back apart. */
function judgeDesignDoc(
  cwd: string,
  kind: 'notes' | 'approval',
): { ok: true; doc: Notes | Approval } | { ok: false; err: UnparseableDesignFileError } {
  const relPath = DESIGN_DOC_REL_PATH[kind]
  const filePath = path.join(cwd, relPath)
  try {
    const doc = kind === 'notes' ? readJson(filePath, NotesSchema) : readJson(filePath, ApprovalSchema)
    return { ok: true, doc }
  } catch {
    return { ok: false, err: new UnparseableDesignFileError(relPath, !existsSync(filePath)) }
  }
}

/** Writes `obj` as JSON to `filePath` atomically: write a sibling temp file, then `rename` it into
 * place. `rename` on the same filesystem is atomic, so a concurrent reader never sees a partial
 * write. D1: the temp name is unique per process AND per call —
 * `` `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp` `` — because a FIXED
 * `.tmp` name is what makes *concurrent* writers tear each other: two `writeFileSync` calls land
 * in the same inode before either renames, and the first `rename` publishes a half-merged file.
 * If `rename` fails, the temp file is unlinked before the original error is rethrown, so a failed
 * publish never leaves an orphaned temp file behind. */
export function writeJsonAtomic(filePath: string, obj: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(tmpPath, JSON.stringify(obj))
  try {
    renameSync(tmpPath, filePath)
  } catch (err) {
    try {
      unlinkSync(tmpPath)
    } catch {
      // best-effort cleanup; the original error below is what the caller needs to see
    }
    throw err
  }
}

/** D9/D3: ensures `design/notes.json` and `design/approval.json` exist under `cwd`, creating each
 * with its empty default only when it is absent. Called first by every verb that touches a host
 * (`check`, `sweep`, `answer`, `serve`). D3: creation uses the `wx` flag — exclusive create — and
 * swallows only `EEXIST`, rethrowing anything else. `wx` makes creation itself the exclusion:
 * an `existsSync`-then-write check-then-act has a real window where two verbs starting together
 * both see "absent" and the second overwrites the first's freshly created file; with `wx` a losing
 * creator's `writeFileSync` throws and writes nothing, so no lock is needed here. */
export function ensureDesignFiles(cwd: string): void {
  const designDir = path.join(cwd, 'design')
  mkdirSync(designDir, { recursive: true })

  const notesPath = path.join(designDir, 'notes.json')
  try {
    writeFileSync(notesPath, JSON.stringify(EMPTY_NOTES), { flag: 'wx' })
  } catch (err) {
    if (!isEexist(err)) throw err
  }

  const approvalPath = path.join(designDir, 'approval.json')
  try {
    writeFileSync(approvalPath, JSON.stringify(EMPTY_APPROVAL), { flag: 'wx' })
  } catch (err) {
    if (!isEexist(err)) throw err
  }
}

/** D2: raised when `design/` stayed locked for the whole acquire window. Distinct from
 * `UnparseableDesignFileError`: the document is fine, the timing is not — the remedy is to retry,
 * never to edit a file by hand. */
export class DesignLockedError extends Error {
  constructor(public readonly holderPid: number) {
    super(`design/ is locked by pid ${holderPid} — another mock-review write is in progress; retry`)
  }
}

const STALE_MS = 10_000
const ACQUIRE_TIMEOUT_MS = 2_000
const RETRY_MS = 20

/** Narrows a caught value to a Node `ErrnoException` carrying `code === 'EEXIST'`, without `any`. */
function isEexist(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'EEXIST'
}

type LockHolder = { pid: number; at: string }

/** Best-effort read of a lock file's body. An empty or unparseable body (a waiter can read the
 * file between the holder's `openSync` and its `writeSync`) returns `undefined` rather than
 * throwing — D2 treats that as HELD, judging staleness from the file's mtime instead. */
function readLockHolder(lockPath: string): LockHolder | undefined {
  try {
    const raw = readFileSync(lockPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'pid' in parsed &&
      typeof (parsed as { pid: unknown }).pid === 'number'
    ) {
      return parsed as LockHolder
    }
    return undefined
  } catch {
    return undefined
  }
}

/** `process.kill(pid, 0)` throws `ESRCH` when `pid` no longer exists, and `EPERM` when it exists
 * but belongs to another user — EPERM counts as alive, per D2. */
function isPidGone(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (err) {
    return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'ESRCH'
  }
}

/** D2: attempts to break a lock found HELD (`EEXIST` on acquire). Breaks it — by renaming it
 * aside and then unlinking the rename, so of two waiters that both judge it stale the loser gets
 * `ENOENT` on its own rename and falls through to the retry loop instead of unlinking the
 * winner's fresh lock — when its holder pid is gone (`ESRCH`) or its mtime is older than
 * `STALE_MS`. Returns `true` when the lock was broken (or had already vanished, in which case the
 * caller should just retry the acquire), `false` when it is genuinely still held. */
function tryBreakStaleLock(lockPath: string, holder: LockHolder | undefined): boolean {
  let mtimeMs: number
  try {
    mtimeMs = statSync(lockPath).mtimeMs
  } catch {
    return true
  }

  const pidGone = holder !== undefined && isPidGone(holder.pid)
  const stale = Date.now() - mtimeMs > STALE_MS
  if (!pidGone && !stale) return false

  const staleName = `${lockPath}.${process.pid}.stale`
  try {
    renameSync(lockPath, staleName)
  } catch {
    return false
  }
  try {
    unlinkSync(staleName)
  } catch {
    // already gone; the rename was the exclusion that mattered
  }
  return true
}

const heldLockPaths = new Set<string>()
let exitHandlerRegistered = false

/** D2: registers, once per module load (never per acquire — a per-acquire handler leaks listeners
 * and warns after ten writes in a long-lived server), a `process.on('exit')` handler that unlinks
 * any lock this process still holds. */
function registerExitHandlerOnce(): void {
  if (exitHandlerRegistered) return
  exitHandlerRegistered = true
  process.on('exit', () => {
    for (const lockPath of heldLockPaths) {
      try {
        unlinkSync(lockPath)
      } catch {
        // best-effort; the process is exiting
      }
    }
  })
}

/** D2: runs `fn` while holding the exclusive `design/.lock` (one lock covers BOTH
 * `notes.json` and `approval.json`). Acquire is `openSync(lockPath, 'wx')`; `EEXIST` means held,
 * and `tryBreakStaleLock` decides whether to break it. Retries every `RETRY_MS` for at most
 * `ACQUIRE_TIMEOUT_MS`, then throws `DesignLockedError`. Released in `finally`, and by the
 * module-level exit handler if the process dies first. ASYNC so the retry can `await` a timer
 * instead of blocking the server's event loop. */
export async function withDesignLock<T>(cwd: string, fn: () => T | Promise<T>): Promise<T> {
  registerExitHandlerOnce()
  const lockPath = path.join(cwd, 'design', '.lock')
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
  let lastKnownHolderPid = process.pid

  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx')
      try {
        writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
      } finally {
        closeSync(fd)
      }
      heldLockPaths.add(lockPath)
      try {
        return await fn()
      } finally {
        heldLockPaths.delete(lockPath)
        try {
          unlinkSync(lockPath)
        } catch {
          // already gone (e.g. broken by another process's staleness check)
        }
      }
    } catch (err) {
      if (!isEexist(err)) throw err

      const holder = readLockHolder(lockPath)
      if (holder !== undefined) lastKnownHolderPid = holder.pid

      if (tryBreakStaleLock(lockPath, holder)) continue

      if (Date.now() >= deadline) {
        throw new DesignLockedError(lastKnownHolderPid)
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
    }
  }
}
