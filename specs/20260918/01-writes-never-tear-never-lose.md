---
date: 2026-09-18
status: hardened
tier: critical
area: files
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260918/02-one-reply-and-the-page-ends-a-note.md]
brief: n/a
spiked: 2026-09-18
open_markers: 0
---

# Writes never tear, never lose

## Goal

Three separate processes write `design/notes.json` and `design/approval.json` today — the `serve`
server, the `answer` CLI, and the spec plugin's `client waive` — and nothing coordinates them.
`writeJsonAtomic` (`src/files/json.ts:87-92`) names its temporary file `<path>.tmp`, a fixed path,
so two writers land in the same inode before either renames: the file tears into unparseable bytes
and every later write answers 409. Executed, 2 processes × 250 writes: **390 write errors and a
corrupt document** (A1). This spec gives the two design documents one cross-process lock, makes the
temporary name unique, and closes the create-time clobber window in `ensureDesignFiles`. Done means
concurrent writers from any mix of processes neither corrupt the file nor silently drop each other's
changes, and nothing about the documents' shape, the wire, or the page changes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `writeJsonAtomic` derives its temporary path as `` `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp` `` and unlinks it in a `catch` before rethrowing. The doc comment states that rename is what makes the write atomic and that the unique name is what makes *concurrent* writes atomic (AC-20260918-01-1, AC-20260918-01-3) | A fixed `.tmp` is not a naming preference, it is the corruption: two `writeFileSync` calls interleave into one inode and the first `rename` publishes a half-merged file. Executed evidence in A1 |
| D2 | A cross-process lock, `withDesignLock(cwd, fn)`, lands in `src/files/json.ts`. Acquire = `openSync(path.join(cwd,'design','.lock'), 'wx')` (EEXIST when held — A2, executed), body = `JSON.stringify({pid: process.pid, at: new Date().toISOString()})`. On `EEXIST`: read the holder; break the lock when `process.kill(holder.pid, 0)` throws `ESRCH` (A3, executed) **or** when `at` is older than 10 s; otherwise sleep 20 ms and retry for at most 2 s, then throw a `DesignLockedError` carrying `design/ is locked by pid <N> — another mock-review write is in progress; retry`. Release in `finally` and from a `process.once('exit')` handler. One lock covers BOTH documents (AC-20260918-01-2, AC-20260918-01-5, AC-20260918-01-6) | The unique temporary name of D1 removes tearing but **not** lost updates: the same executed run kept only **272 of 500** entries (A1). A lock is therefore not an alternative mechanism, it is the other half. One lock rather than two because rule 6 writes `approval.json` inside a `notes.json` mutation (`src/server/patches.ts` rule 6), so the pair is one critical section |
| D3 | `ensureDesignFiles` stops branching on `existsSync` and instead writes each default with `writeFileSync(p, JSON.stringify(EMPTY_*), { flag: 'wx' })`, swallowing only `EEXIST` (A4, executed) and rethrowing anything else. It does **not** take the lock (AC-20260918-01-4) | `existsSync`-then-`writeJsonAtomic` (`json.ts:101-105`) is a check-then-act with a real window: two verbs starting together both see "absent" and the second renames an EMPTY document over the first's file. `wx` makes creation itself the exclusion, and needs no lock because a losing creator writes nothing |
| D4 | Inside `serve`, the file lock is taken **within** the existing in-process `withWriteLock`, wrapped around the read→apply→write span only (`src/server/plugin.ts:311-405` for notes, `:480-494` for approval) — never around `buildState`. Nesting order is fixed: in-process outer, file inner; no CLI verb ever holds the in-process lock (AC-20260918-01-2) `[no-ac: ordering invariant with no separate observable; AC-20260918-01-2 fails if the span is wrong]` | `withWriteLock` also orders `buildState`-before-write for `clientOk`, so it stays. Holding the file lock across `buildState` would hold it across a Vite render and make every CLI write wait on a page refresh; a fixed nesting order is what makes the two locks deadlock-free |
| D5 | `src/cli/answer.ts` performs its read→mutate→write inside `withDesignLock`. `ensureDesignFiles` and every usage/validation refusal stay OUTSIDE the lock, so a refused invocation never acquires it (AC-20260918-01-6) | Validation-before-mutation is already this verb's shape (D19c); keeping refusals outside the lock is what makes "a failed `answer` leaves no `design/.lock`" true by construction rather than by a `finally` that must not be forgotten |
| D7 | Two header comments asserting a single writer are retired in the same edit that makes the claim unnecessary: `src/server/patches.ts:2-3` ("The server (plugin.ts) is the only writer while `serve` runs — every mutation goes through one of these two functions so the CLI's `answer` and the page's controls can never disagree") and `src/ui/sync/api.ts:2-3` ("the server is the sole writer of `design/notes.json` and `design/approval.json` while `serve` runs"). Both are replaced by what is now true: three processes write, `withDesignLock` serialises them, and `answer` does **not** go through `applyNotesPatch` today `[no-ac: comment-only edit with no observable surface; the code it describes is covered by AC-20260918-01-2]` | Both sentences are false as written and were false before this spec — `src/cli/answer.ts:76-77` hand-mutates the document and has never called the reducer. Leaving them would hand the next reader a documented invariant that the lock exists precisely because it does not hold |
| D6 | `design/.lock` is gitignored beside `design/.serve.json`, and `DESIGN_STATE_FILES` (`tests/helpers/cli.ts:181`) gains `.lock` so a scratch host copy never inherits a stale one. `src/server/watch.ts` is **not** changed: it matches `design/notes.json` and `design/approval.json` by exact path (`watch.ts:21-22`), so neither `.lock` nor a `*.tmp` can raise an event (AC-20260918-01-7) | A lock file copied into a fixture would make the next test hang for 2 s and then refuse; and stating the watcher fact in the spec stops a worker from "defensively" adding a filter that the exact-path match already makes dead code |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/files/json.ts | MODIFY | schemas | D1 unique tmp + unlink on failure; D2 `DesignLockedError` and `withDesignLock`; D3 `ensureDesignFiles` creates with `wx` |
| src/server/plugin.ts | MODIFY | server | D4: both POST handlers take `withDesignLock` around their read→apply→write span, inside `withWriteLock`, outside `buildState` |
| src/cli/answer.ts | MODIFY | cli | D5: the read→mutate→write span runs inside `withDesignLock`; refusals stay outside it |
| src/server/patches.ts | MODIFY | server | D7: header comment `:2-3` retired — the "only writer while `serve` runs" claim is false and always was; replaced by the lock's actual guarantee. No code change |
| src/ui/sync/api.ts | MODIFY | ui | D7: header comment `:2-3` retired, same false claim. No code change |
| .gitignore | MODIFY | other | D6: `design/.lock` |
| tests/helpers/cli.ts | MODIFY | tests | D6: `DESIGN_STATE_FILES` gains `.lock` |
| tests/cli/files.test.ts | MODIFY | tests | AC-20260918-01-1, AC-20260918-01-2, AC-20260918-01-3, AC-20260918-01-4, AC-20260918-01-5, AC-20260918-01-6 |
| tests/server/api.test.ts | MODIFY | tests | AC-20260918-01-7, AC-20260918-01-8 |

## Contracts

```ts
// src/files/json.ts — new exports. No wire, schema or on-disk shape changes anywhere in this spec.

/** Raised when `design/` stayed locked for the whole acquire window. Distinct from
 * `UnparseableDesignFileError`: the document is fine, the timing is not — the remedy is to retry,
 * never to edit a file by hand. */
export class DesignLockedError extends Error {
  constructor(public readonly holderPid: number)
}

/** Runs `fn` while holding the exclusive `design/.lock`. Acquire is `openSync(..., 'wx')`; a lock
 * whose holder pid is gone (ESRCH) or whose `at` is older than STALE_MS is broken and retaken.
 * Released in `finally` and on process exit. One lock covers notes.json AND approval.json. */
export function withDesignLock<T>(cwd: string, fn: () => T): T

const STALE_MS = 10_000
const ACQUIRE_TIMEOUT_MS = 2_000
const RETRY_MS = 20
```

## Data Model

No shape change. One new file on disk: `design/.lock`, holding `{"pid":<number>,"at":"<ISO-8601>"}`,
present only while a write is in flight, gitignored, and never read by anything but
`withDesignLock`. Existing `design/notes.json`, `design/approval.json` and `design/decisions.json`
rows are untouched — this spec changes only how bytes reach them.

## Behavior

**Two writers, one document.** Each writer acquires `design/.lock`, reads the document(s) it needs,
applies its change, writes through `writeJsonAtomic`, releases. A writer that finds the lock held
retries every 20 ms; the loser of a collision therefore observes the winner's bytes when it finally
reads, so its change composes instead of overwriting.

**A holder that dies.** Its lock file survives. The next acquirer reads the holder pid, probes it
with `process.kill(pid, 0)`, and on `ESRCH` deletes the lock and takes it. A pid that is alive but
foreign answers `EPERM`, which counts as alive — the 10 s age bound is the second escape so a
reused pid cannot wedge the directory forever.

**A holder that hangs.** Writers refuse after 2 s with `DesignLockedError`. In the server that
surfaces through the landed notice; in a CLI verb it is `mock-review: design/ is locked by pid N …`
on stderr at exit 2. Refusing loudly is the intended outcome — the alternative is an unbounded wait
that looks like the page freezing.

**Readers never lock.** `readDesignDoc`, `readDesignDocOrThrow` and `buildState` are unchanged: a
reader either sees the pre-rename bytes or the post-rename bytes, never a mixture, because rename is
atomic. At most it reads one write stale, exactly as today.

**Creation.** `ensureDesignFiles` races safely: both callers attempt `wx`, one wins, the loser sees
`EEXIST` and returns. No lock, no clobber.

## Acceptance Criteria

- **AC-20260918-01-1**: WHEN two OS processes each perform 250 read-modify-write cycles against the
  same `design/notes.json` through `writeJsonAtomic` THE SYSTEM SHALL leave the file parseable as
  JSON and report zero write errors (pre-image, executed: 390 errors and
  `Unexpected non-whitespace character after JSON at position 7`) → writes tests/cli/files.test.ts
- **AC-20260918-01-2**: WHEN two OS processes each append 250 distinct entries to
  `design/notes.json` under `withDesignLock` THE SYSTEM SHALL preserve all 500 entries
  (`A-0…A-249` + `B-0…B-249` → `notes.length === 500`), where the same run without the lock keeps
  272 (A1, executed) → writes tests/cli/files.test.ts
- **AC-20260918-01-3**: WHEN a write through `writeJsonAtomic` throws while its temporary file
  exists THE SYSTEM SHALL leave no `*.tmp` sibling of the target (e.g. an unserializable value →
  the directory listing contains `notes.json` and no `notes.json.*.tmp`)
  → writes tests/cli/files.test.ts
- **AC-20260918-01-4**: WHEN two OS processes call `ensureDesignFiles` on the same empty `design/`
  directory simultaneously THE SYSTEM SHALL leave exactly one `notes.json` whose content is
  `EMPTY_NOTES`, with neither call throwing → writes tests/cli/files.test.ts
- **AC-20260918-01-5**: WHEN `design/.lock` names a pid that no longer exists THE SYSTEM SHALL break
  the lock and complete the write (lock body `{"pid":999999,"at":<now>}` → the write succeeds and
  `design/.lock` is absent afterwards) → writes tests/cli/files.test.ts
- **AC-20260918-01-6**: WHEN `mock-review answer` refuses for any reason before mutating (unknown
  note id, usage error, unreadable document) THE SYSTEM SHALL exit 2 leaving no `design/.lock`
  (`answer --note NOPE --text x` → exit 2, `mock-review: no note NOPE`, `design/.lock` absent)
  → writes tests/cli/files.test.ts
- **AC-20260918-01-7**: WHEN a `POST /__mock-review/notes` write completes THE SYSTEM SHALL CONTINUE
  TO persist the note, leave no `*.tmp` behind, and emit exactly one `notes` SSE event within 2 s
  → reuses tests/server/api.test.ts :: AC-20260915-02-9:
- **AC-20260918-01-8**: WHEN a notes patch changes nothing in `approval` THE SYSTEM SHALL CONTINUE
  TO leave `design/approval.json` byte-identical, including a `contractVersion` of 1
  → reuses tests/server/api.test.ts :: AC-20260917-01-12

## Assumptions (escalation triggers)

- **A1** — Executed 2026-09-18, two `node` processes × 250 read-modify-write cycles on one JSON file
  (scratch, deleted). Fixed `.tmp`: `write errors: 390 | torn file: YES Unexpected non-whitespace
  character after JSON at position 7 | entries kept: 0/500`. Unique tmp: `write errors: 0 | torn
  file: no | entries kept: 272/500`. `O_EXCL` lock: `write errors: 0 | torn file: no | entries
  kept: 500/500`. — **if false:** the lock is not the mechanism; STOP and re-measure before any
  code lands.
- **A2** — `openSync(p, 'wx')` on an existing path throws `EEXIST` on Node 24.19 (executed); a
  second acquire after `unlinkSync` succeeds. — **if false:** fall back to `mkdirSync(p)` as the
  exclusion primitive (directory creation is atomic on POSIX) and keep everything else.
- **A3** — `process.kill(999999, 0)` throws `ESRCH`; `process.kill(process.pid, 0)` returns
  normally (executed, Node 24.19). — **if false:** drop liveness probing and rely on the 10 s age
  bound alone; note the longer stale window in the refusal sentence.
- **A4** — `writeFileSync(p, data, { flag: 'wx' })` on an existing path throws `EEXIST` and leaves
  the file byte-identical (executed). — **if false:** keep `existsSync` and accept the clobber
  window; record it as debt.
- **A5** — `src/server/watch.ts:21-22` matches the two design documents by exact absolute path, so
  `design/.lock` and `design/notes.json.<pid>.<hex>.tmp` raise no watcher event and no SSE.
  Verified by reading; **not executed**. — **if false:** the page refetches spuriously on every
  write; add an explicit ignore in `watch.ts` and an AC for it.
- **A6** — No consumer outside this package reads `design/.lock`. The plugin's own write
  (`mocks-driver.js:335`) does not take it and is therefore still unsafe against a concurrent page
  write; that writer moves into this package in a later unit of this series. — **if false:** the
  lock protocol must be published to the plugin repo in this spec instead of the later one.

## Rationale

The defect looks like two defects and is one: nothing arbitrates between processes. `writeJsonAtomic`
was written against a single-writer assumption that `src/server/patches.ts` states as fact ("the
server is the sole writer while `serve` runs") and that `src/cli/answer.ts` has always violated.
Once that is seen, the fixed `.tmp` and the missing lock are the same omission at two grain sizes,
which is why they land together: shipping the unique name alone would remove the loud failure
(a corrupt file the driver reports) and leave the quiet one (46% of concurrent writes vanishing),
which is strictly worse for a user who cannot see either.

Routing `answer` through the running server was the considered alternative and is rejected. It does
not remove the need for cross-process exclusion — with `serve` down, `answer` still races the
plugin's write and `ensureDesignFiles` — so it buys a second code path in `answer` whose online and
offline behaviours differ, on top of the lock it fails to replace. The lockfile eliminates routing;
routing does not eliminate the lockfile.

What to watch during execution: the nesting order in D4. The in-process lock must stay outside the
file lock, and `buildState` must stay outside both. A worker that "simplifies" by wrapping the whole
handler in `withDesignLock` will hold a cross-process lock across a Vite render, and every CLI write
in the repo will start timing out at 2 s under load — a failure that looks like the lock being
wrong rather than mis-scoped.

Collision closure for D7's retirement of the single-writer claim ran against the stems `sole writer`
and `only writer` and returned two literals-leg hits: `src/ui/sync/api.ts` and
`src/server/patches.ts`. Both are **fixed, not waived** — each is a File Plan row in this spec,
comment-only. No other literal survives; the `mentions` hits on `tests/unit/design-docs.test.ts` and
`tests/e2e/approved.test.ts` are the lexical proxy tier and owe nothing.

Residual, stated rather than solved: a live-but-hung holder makes writers refuse after 2 s; pid
reuse can make a stale lock look held until the age bound breaks it; `O_EXCL` on NFS is out of
scope. The plugin's `client waive` write remains uncoordinated until the unit that moves it.

## Canonical Delta

`docs/canonical/package.md` — the file-layer section gains: the package serialises every write to
`design/notes.json` and `design/approval.json` through an exclusive `design/.lock`, held by one
process at a time and broken automatically when its holder is gone or the lock is older than ten
seconds. Temporary files are per-process and per-write; `design/.lock` is gitignored and never
committed. Readers do not take the lock. A verb that cannot acquire it within two seconds refuses
with `design/ is locked by pid <N> — another mock-review write is in progress; retry` rather than
waiting. The claim in `src/server/patches.ts`'s header that the server is the sole writer while
`serve` runs is retired: the package has always had three writers, and they are now coordinated.
