---
date: 2026-09-17
status: done
tier: critical
area: server
design: false
breaking: false
depends_on: [specs/20260917/02-the-story-travels.md, specs/20260917/03-the-panel-and-the-dots-tell-the-truth.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-17
open_markers: 0
build_base: main
diff_base: d033c4c90e82d10a46ef98479dabe033f040652c
---

# Empty is not broken

## Goal

A design document that exists but fails its schema is currently served to the reviewer page as an
**empty** document: `buildState` catches the parse failure and ships `EMPTY_NOTES`/`EMPTY_APPROVAL`
(`src/server/state.ts:142-155`). The page then renders "no notes / nothing approved" as fact, and the
user's next write answers 409 about a file they never touched. The root cause is wider than that
catch: five places in this package read those two files with three different and independently
invented failure behaviours, so "present but unreadable" has no single definition and the read and
write verdicts on the same bytes can disagree. This spec gives that verdict one home, makes
"unreadable" a first-class thing the wire can say, and writes down the read-back permissiveness rule
that keeps the next contract field from reopening it. Done means: a corrupt or drifted design file is
reported as unreadable rather than as empty, the read and write paths agree on every mutation of it,
the rest of the page still loads, and nothing on screen changes yet.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | One predicate, one home. `UnparseableDesignFileError` and the two `*OrThrow` readers move out of `src/server/plugin.ts:210-237` into `src/files/json.ts`, beside `ensureDesignFiles`, and are re-expressed as a **result-returning** `readDesignDoc(cwd, kind: 'notes' \| 'approval'): { ok: true; doc } \| { ok: false; error: string }`. A thin `readDesignDocOrThrow` wraps it and preserves the write path's existing throw→409 behaviour byte for byte. All five read sites consume `readDesignDoc`: `src/server/state.ts` (×2), `src/server/plugin.ts` (×2, via the throwing wrapper), `src/cli/check.ts` `themeFor`, `src/cli/sweep.ts`, `src/cli/answer.ts` (AC-20260917-04-1, AC-20260917-04-2) | The defect is not one catch: today `state.ts` answers silently-empty, `plugin.ts` answers 409, `themeFor` answers silently-undefined, and `sweep`/`answer` crash with a raw zod dump. Three verdicts on the same bytes is what lets read and write disagree; with one predicate that disagreement is unrepresentable |
| D2 | `DocOutcome = z.discriminatedUnion('ok', [{ok: true}, {ok: false, error: string}])`, both members `.strict()`, and `ServerState` gains a **required** `documents: { notes: DocOutcome; approval: DocOutcome }`. zod 4.6.5 accepts a boolean literal as the discriminator, rejects `{ok:false}` with no `error`, and rejects `{ok:true, error}` (A1, executed). `buildState` **always** emits it (AC-20260917-04-3, AC-20260917-04-4) | Per-document and structured, because the eventual page job is to word an error and gate writes **per file**; a joined string cannot be matched back to a file without re-parsing it. Required rather than optional because the one strict consumer, `src/cli/check.ts:34`, must fail loudly if a server ever stops sending it |
| D3 | `notes` and `approval` keep their existing wire shape and continue to carry `EMPTY_NOTES`/`EMPTY_APPROVAL` when the read failed — now as an **explicitly documented placeholder** paired with `documents.<doc>.ok === false`, never as a claim about the file. Partial success is preserved: a failed design-document read leaves `screens`, `shells`, `journeys`, `themes`, `config` and `inventory` fully populated, and only an `UnparseableDesignFileError`-equivalent outcome is absorbed — anything else the reader throws is a bug and propagates (AC-20260917-04-4, AC-20260917-04-5) | Type-forcing (`notes: Notes \| null`) is the stronger design but makes every page consumer handle `null` today, which is a visible change and therefore the user's decision. The additive flag is the strongest form that leaves the page pixel-identical |
| D4 | Read-back permissiveness becomes a written rule in the header of `src/schemas/notes.ts` and `src/schemas/approval.ts`: **a read-back document schema validates only what this package itself reads or writes; everything else passes through, and `contractVersion` is validated as "known", not "equal".** It ships with the one instance it already costs us — `ApprovalSchema.theme` becomes `z.string().nullable().default(null)`. The plugin's own `defaultApproval` fixture writes `{contractVersion, screens, journeys}` with **no `theme`**, which today's required-`theme` schema REJECTS (A3, executed); `.default(null)` accepts it, and the inferred `Approval['theme']` stays `string \| null`, so no UI consumer changes (A4, executed). The rule is hygiene that lowers frequency — the spec states plainly that it does **not** close the class, because the failure that started this was a *missing required key*, which `.passthrough()` never covered (AC-20260917-04-6) | Three independent failure kinds — malformed JSON, unknown `contractVersion`, shape drift — all land in the same verdict, so no amount of schema leniency can be the closure. Saying so in the spec is what stops the next reader from "fixing" the class with another `.optional()` |
| D5 | `src/cli/sweep.ts:37` and `src/cli/answer.ts:33` stop crashing with a raw zod stack on an unreadable document and refuse with the shared sentence (`design/<file> exists but does not parse — refusing to write until it's fixed by hand`) on stderr at exit 2. `src/cli/check.ts`'s `themeFor` **keeps** its silent fallback to `undefined` — now derived from `readDesignDoc` rather than its own `try/catch` — and its comment states that this is deliberate: a screenshot capture must not fail on an unpicked or unreadable theme  (AC-20260917-04-7, AC-20260917-04-11) | Every caller now derives from one verdict and then chooses its policy **explicitly**; the point is not that all five behave alike, it is that no policy is an accident of where the `try` was written |
| D6 | The page is **not** touched beyond types. `src/ui/store/store.ts`'s `EMPTY_STATE` gains `documents: { notes: {ok:true}, approval: {ok:true} }` so the `ServerState` type still satisfies, and **no component reads `documents`**. Current rendering is byte-for-byte unchanged. The user-visible half — whether the client ever sees a read failure, its wording and placement, and whether the composer is disabled or the 409 is left to speak — is recorded in this spec's Rationale as **open user questions carried to the client-page spec** (`q12`), never defaulted here `[no-ac: types-only change with no observable surface; AC-20260917-04-4 pins that the served page state is otherwise unchanged]` | `docs/design/design-reference.md` is binding and frozen, and the user's standing rule is that a visible change is a user decision. Landing the mechanism invisibly is what lets the client-page spec decide the surface with the facts in hand instead of inheriting a default nobody chose |
| D7 | A new `tests/unit/plugin-shapes.test.ts` holds **literal copies** of every design-document shape the plugin's verbs write today, each with a comment naming its source file and the `contractVersion` it was copied at, asserted to parse. Copied, never imported: there is no shared package, and a cross-repo import would couple this repo's test run to a sibling checkout (AC-20260917-04-6) | This is the test that would have caught both live instances before they shipped — the missing `approvedAt` (repaired by spec 02 D8) and the missing `theme` (A3). It is where the *next* unlearned field surfaces as a red test instead of a blank page |
| D8 | **Schema normalisation is part of the read verdict, not drift from it.** AC-20260917-04-8's served-mutant assertion compares against `ApprovalSchema.parse(mutant)`, not against the raw mutant bytes. The `theme`-key-deleted mutant parses `ok: true` under D4's `.default(null)` and is therefore served with `theme: null` present — deep-equal to the raw mutant is false for that one case, and the test asserting it would force a choice between D4 and AC-20260917-04-8. AC-20260917-04-8 is amended in the same edit as this ruling (build-time, orchestrator) | D4 and AC-20260917-04-6 both pin default-fill explicitly and A4 is executed evidence, so the intent is not in doubt: the reader's contract is "what the schema says the document means", and a default is the schema speaking. AC-20260917-04-8's purpose is the `ok`-correspondence with the live schema as oracle, not byte-identical round-tripping — and comparing to `ApprovalSchema.parse(...)` preserves its "no field named in the test" property, which a hand-written `theme: null` expectation would destroy. Nothing observable moves: the served bytes are exactly what D4 already decided |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/files/json.ts | MODIFY | schemas | D1: `UnparseableDesignFileError`, `readDesignDoc` (result-returning) and `readDesignDocOrThrow` land here beside `ensureDesignFiles` |
| src/schemas/approval.ts | MODIFY | schemas | D4: `theme` becomes `z.string().nullable().default(null)`; the read-back permissiveness rule in the file header |
| src/schemas/notes.ts | MODIFY | schemas | D4: the same rule in the file header; no field changes |
| src/schemas/patches.ts | MODIFY | schemas | D2: `DocOutcomeSchema` and the required `documents` on `ServerStateSchema` |
| src/server/state.ts | MODIFY | server | D1/D3: both reads go through `readDesignDoc`; `documents` always set; the EMPTY placeholder documented at the fallback |
| src/server/plugin.ts | MODIFY | server | D1: the error class and the two `*OrThrow` readers are removed here and imported from the file layer; 409 behaviour unchanged |
| src/cli/check.ts | MODIFY | cli | D5: `themeFor` derives from `readDesignDoc`; its deliberate silent fallback documented |
| src/cli/sweep.ts | MODIFY | cli | D5: formatted refusal + exit 2 instead of a raw zod throw |
| src/cli/answer.ts | MODIFY | cli | D5: the same refusal |
| src/ui/store/store.ts | MODIFY | ui | D6: `EMPTY_STATE` gains `documents`; nothing renders it |
| tests/unit/design-docs.test.ts | CREATE | tests | AC-20260917-04-1, AC-20260917-04-2, AC-20260917-04-8 |
| tests/unit/plugin-shapes.test.ts | CREATE | tests | AC-20260917-04-6 |
| tests/server/api.test.ts | MODIFY | tests | AC-20260917-04-3, AC-20260917-04-4, AC-20260917-04-5 |
| tests/cli/sweep.test.ts | MODIFY | tests | AC-20260917-04-7 |
| tests/cli/answer.test.ts | MODIFY | tests | AC-20260917-04-7 |
| tests/cli/check.test.ts | MODIFY | tests | AC-20260917-04-7 |
| docs/canonical/package.md | MODIFY | other | The design-document read contract: one verdict, `documents` on `GET state`, the read-back permissiveness rule |

Orchestrator duty, outside the table: no row may edit another row's file.

## Contracts

**`src/files/json.ts` (D1)** — the one verdict:

```ts
/** A design document that EXISTS but cannot be used: malformed JSON, an unknown
 * `contractVersion`, or a shape this package has not learned. `relPath` is the design-relative
 * path named in every refusal. */
export class UnparseableDesignFileError extends Error {
  constructor(public readonly relPath: string) {
    super(`${relPath} exists but does not parse — refusing to write until it's fixed by hand`)
  }
}

export type DocRead<T> = { ok: true; doc: T } | { ok: false; error: string }

/** THE predicate. Every reader of `design/notes.json` and `design/approval.json` in this package
 * derives its behaviour from this one function, then chooses its own policy explicitly. Callers
 * never write their own `try { readJson(...) } catch`. */
export function readDesignDoc(cwd: string, kind: 'notes' | 'approval'): DocRead<Notes | Approval>

/** The write path's form: same verdict, expressed as the throw both POST handlers already turn
 * into a 409. Exists so the two paths cannot drift. */
export function readDesignDocOrThrow(cwd: string, kind: 'notes' | 'approval'): Notes | Approval
```

**`src/schemas/patches.ts` (D2)**:

```ts
/** Whether a design document could be read. `ok: false` means the file EXISTS and could not be
 * used — never that it is absent (`ensureDesignFiles` creates both when missing). */
export const DocOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ ok: z.literal(false), error: z.string() }).strict(),
])

// ServerStateSchema gains, required and always emitted:
documents: z.object({ notes: DocOutcomeSchema, approval: DocOutcomeSchema }).strict(),
```

**`src/schemas/approval.ts` (D4)**:

```ts
/** READ-BACK SCHEMA. It validates only what this package itself reads or writes; anything else
 * passes through, and `contractVersion` is checked as "known", not "equal". `theme` defaults to
 * `null` on read because the plugin's own `defaultApproval` omits the key entirely (A3) — the
 * inferred type stays `string | null`, so no consumer changes. This rule LOWERS the frequency of
 * a swallowed read; it does NOT close it, because a missing required key is not an extra key. */
theme: z.string().nullable().default(null),
```

**`GET /__mock-review/state` (D2, D3)** — the added field, both cases:

```json
{ "documents": { "notes": {"ok": true}, "approval": {"ok": true} }, "notes": {…}, "approval": {…} }
```

```json
{ "documents": { "notes": {"ok": true},
                 "approval": {"ok": false,
                              "error": "design/approval.json exists but does not parse — refusing to write until it's fixed by hand"} },
  "approval": { "contractVersion": 2, "screens": {}, "journeys": {}, "theme": null } }
```

— where that `approval` value is the documented **placeholder**, not a statement about the file.

## Data Model

No document on disk changes shape and nothing is migrated. `design/approval.json` becomes readable
in one shape it was not before (the `theme` key absent), and every document readable today stays
readable. `EMPTY_NOTES`/`EMPTY_APPROVAL` are unchanged and still written by `ensureDesignFiles`
with `theme: null` present.

## Behavior

**One verdict, explicit policies.** `readDesignDoc` decides readability once. `buildState` reports
it and serves a placeholder; both POST handlers refuse with 409; `sweep` and `answer` refuse at
exit 2; `themeFor` deliberately shrugs and returns `undefined`. Four different responses, one fact
underneath — so the page can never again say "empty" while the write path says "unreadable".

**What `ok: false` does not mean.** It never means the file is absent: `ensureDesignFiles` runs
first in every host-touching verb and creates both documents. Absent and unreadable were the two
cases the old catch conflated, and separating them is most of the fix.

**What this does not fix.** Schema leniency reduces how often a document drifts out of readability;
it cannot prevent it, because a *missing required key* is not an unknown key and no `.passthrough()`
covers it. The closure is that an unreadable document is now **reportable** rather than invisible.

## Acceptance Criteria

- **AC-20260917-04-1**: WHEN `readDesignDoc(cwd, 'approval')` runs over a `design/approval.json` containing `{"contractVersion":2,"screens":{},"journeys":{},"theme":null}` THE SYSTEM SHALL return `{ok: true, doc}` whose `doc` deep-equals that document; WHEN the file contains the truncated text `{"contractVersion":` SHALL return `{ok: false, error: "design/approval.json exists but does not parse — refusing to write until it's fixed by hand"}`; WHEN it contains `{"contractVersion":3,"screens":{},"journeys":{},"theme":null}` SHALL return the same `ok: false` result → writes tests/unit/design-docs.test.ts
- **AC-20260917-04-2**: WHEN `src/` is searched THE SYSTEM SHALL contain exactly one `catch` that converts a `design/notes.json` or `design/approval.json` read failure into a value, and it SHALL live in `src/files/json.ts`; no file under `src/server/`, `src/cli/` or `src/ui/` SHALL call `readJson` with `NotesSchema` or `ApprovalSchema` → writes tests/unit/design-docs.test.ts
- **AC-20260917-04-3**: WHEN `GET /__mock-review/state` runs on the green fixture host THE SYSTEM SHALL include `documents` equal to `{"notes":{"ok":true},"approval":{"ok":true}}`, and `ServerStateSchema.parse` of that response SHALL succeed; WHEN a server response omits `documents` entirely SHALL fail that parse (the field is required, not optional) → writes tests/server/api.test.ts
- **AC-20260917-04-4**: WHEN `design/approval.json` is overwritten with the truncated text `{"contractVersion":` and `GET state` runs THE SYSTEM SHALL answer 200 with `documents.approval.ok === false`, a non-empty `documents.approval.error` naming `design/approval.json`, `approval` deep-equal to `EMPTY_APPROVAL`, `documents.notes.ok === true`, and `notes` deep-equal to the real on-disk notes document → writes tests/server/api.test.ts
- **AC-20260917-04-5**: WHEN `design/notes.json` is unreadable and `GET state` runs on the green fixture host THE SYSTEM SHALL still report `screens` of length 2, a non-empty `shells`, `journeys` of length 1 and a non-null `config.name` — a failed design-document read SHALL NOT empty any analysis-derived field → writes tests/server/api.test.ts
- **AC-20260917-04-6**: WHEN every literal document shape the plugin's verbs write today is parsed by this package's read-back schemas THE SYSTEM SHALL accept each one — including `{"contractVersion":1,"screens":{},"journeys":{}}` with **no** `theme` key (the plugin's `defaultApproval`, `claude-plugins/tests/mocks/mock-app-fixtures.js:95-97`), which the pre-change schema rejects with `invalid_type` at `theme`, and `{"contractVersion":1,"notes":[],"journeys":{}}` (its `defaultNotes`, `:91-93`); and the parsed approval's `theme` SHALL be `null` → writes tests/unit/plugin-shapes.test.ts
- **AC-20260917-04-7**: WHEN `sweep --json` or `answer --note N1 --text x` runs on a host whose `design/notes.json` is the truncated text `{"contractVersion":` THE SYSTEM SHALL exit 2 with stderr containing `design/notes.json exists but does not parse` and no zod stack trace on stdout, leaving the file byte-identical → rewrites tests/cli/sweep.test.ts :: AC-20260915-01-18:
- **AC-20260917-04-8**: WHEN a valid `design/approval.json` is mutated into each of — truncated JSON, `contractVersion` set to `3`, each key of the document object deleted in turn, and each leaf replaced by a wrong-typed value — THE SYSTEM SHALL, for every mutant, report `documents.approval.ok` equal to `ApprovalSchema.safeParse(mutant).success` (the live schema is the oracle, no field named in the test), AND for every mutant where that is `false` SHALL answer 409 naming `design/approval.json` to a `POST /__mock-review/approval`, AND for every mutant where it is `true` SHALL serve an `approval` deep-equal to `ApprovalSchema.parse(mutant)` — the schema's own normalisation is part of the read verdict, so the `theme`-key-deleted mutant is served with `theme: null` filled in per D4 (D8; still no field named in the test) → writes tests/unit/design-docs.test.ts
- **AC-20260917-04-9**: WHEN `design/approval.json` is corrupt and a `POST /__mock-review/approval` runs THE SYSTEM SHALL CONTINUE TO answer 409 with `{"error":"design/approval.json exists but does not parse — refusing to write until it's fixed by hand"}` and leave the file byte-identical → reuses tests/server/api.test.ts :: review
- **AC-20260917-04-11**: WHEN `check --json` runs on a host whose `design/approval.json` is the truncated text `{"contractVersion":` THE SYSTEM SHALL CONTINUE TO exit 0 and report its screens, shells and themes — a theme capture never fails on an unreadable approval document → rewrites tests/cli/check.test.ts :: AC-20260915-01-5:
- **AC-20260917-04-10**: WHEN the reviewer page loads against the green fixture host THE SYSTEM SHALL CONTINUE TO render its notes panel, sidebar dots and journey panel exactly as before — no component reads `documents`, and no new error surface exists → reuses tests/browser/surfaces.test.ts :: AC-20260915-02-1: #/home

## Assumptions (escalation triggers)

- A1: zod 4.6.5 accepts a **boolean literal** as a `discriminatedUnion` key. Executed 2026-09-17: `{ok:true}` → OK, `{ok:false,error:'boom'}` → OK, `{ok:false}` → REJECT `invalid_type`, `{ok:true,error:'x'}` → REJECT `unrecognized_keys`. — **if false:** discriminate on a string `status: 'ok' | 'unreadable'`; D2's shape and every AC's meaning are unchanged.
- A2: a `.strict()` object REJECTS when a newly required field is absent from the data — executed 2026-09-17 (`Outer.safeParse({a:'x'})` → REJECT). So `documents` must be emitted by `buildState` in the same change that adds it to the schema, or `src/cli/check.ts:34` (the **only** strict consumer of `ServerState`; the page casts at `src/ui/sync/api.ts:47` rather than parsing) goes red. — **if false:** the field could land optional first; D2 would lose its loud-failure property.
- A3: the plugin's own `defaultApproval` fixture writes `{contractVersion:1, screens:{}, journeys:{}}` with no `theme`, and today's `ApprovalSchema` REJECTS it — executed 2026-09-17: `invalid_type` at `["theme"]`. Its `defaultNotes` (`{contractVersion:1, notes:[], journeys:{}}`) parses fine. This is a **second live instance** of the class, independent of the `approvedAt` one spec 02 repairs. — **if false:** D4's `theme` change is harmless; the rule and D7's test stand on the `approvedAt` instance alone.
- A4: `z.string().nullable().default(null)` accepts a document with the key absent (filling `null`), with the key `null`, and with a real theme, and the inferred output type stays `string | null` with no `undefined` — executed 2026-09-17. So no UI consumer of `approval.theme` (`ScreenPage.tsx:309,322`, `ComponentsPage.tsx:42`, `DeviceFrames.tsx:138`) changes. — **if false:** make the consumers `?? null` and add those three files as File Plan rows.
- A5: `readJson` distinguishes malformed JSON (`SyntaxError`) from schema failure (`ZodError`) — executed 2026-09-17. Both are the same verdict here (`ok: false`) and the refusal sentence is deliberately identical for both, because the user's remedy is the same: fix the file by hand. — **if false:** nothing changes; the distinction is available if a later spec wants to word them differently.
- A6: specs `20260917/02` and `20260917/03` both land before this one. 02 rewrites `JourneyApprovalSchema` and `src/server/state.ts`'s journey block; 03 rewrites `src/schemas/patches.ts` and `src/server/plugin.ts`. This spec touches all four files, so planning or building it out of order would collide three ways. — **if false:** re-derive the File Plan line references against whatever tree exists; no Decision changes.
- A7: `docs/design/design-reference.md` needs no amendment, because nothing rendered changes. — **if false:** STOP and ask the user; a visible read-failure surface is their decision, not this spec's.

## Rationale

The defect looked like one lazy `catch`. It is not. Five readers of two files had three
independently invented failure behaviours — silent-empty, 409, silent-undefined, and a raw zod
crash twice — which is why the page could say "nothing approved" while the write path said
"unreadable", about the same bytes, in the same second. Once the verdict has one home that
disagreement is unrepresentable, and each caller's policy becomes a choice someone made rather
than an artefact of where a `try` happened to be written.

The instinct to fix this by loosening the schemas was rejected on a fact: the failure that started
it — the plugin's `client waive` omitting `approvedAt` — was a **missing required key**, which
`.passthrough()` has never covered, and the second instance found while planning (the plugin's own
`defaultApproval` omitting `theme`, A3) is the same shape. Leniency lowers frequency; only
reportability closes the class. The spec says so where a future reader will look, so the next
person does not "close" it with another `.optional()`.

Routing the failure into the existing `violations` channel was rejected: it is semantically "layer
violations" under a frozen title, rendered on a page the client role cannot open, and it would still
ship the empty document as fact — a footnote on a lie. Repair-on-read was rejected too: each
coercion is instance knowledge, and it deliberately reintroduces the read/write asymmetry this spec
exists to remove. Typing the documents as nullable is the stronger design and was rejected only
because it forces every page consumer to handle `null` today, which is a visible change the user
owns.

**Open user questions carried to the client-page spec (q12), deliberately not defaulted here:**
does the client ever see that a design file is unreadable, or only the owner? What does it say, and
where? Does the page disable the composer while `ok: false`, or let the existing 409 speak? Is an
unreadable `notes.json` different in kind from an unreadable `approval.json` for the person
reading? This spec lands the mechanism precisely so those are answered with the facts in hand.

Collision closure for D1's move of `UnparseableDesignFileError`, `readNotesDocOrThrow` and
`readApprovalDocOrThrow` out of `src/server/plugin.ts` returned six literals-leg hits across three
stems. `src/server/plugin.ts` is a File Plan row; the only survivor, `dist/server/plugin.js`, is
**waived** — `dist/` is a committed release artifact the host's pipeline rules forbid touching in a
build batch, rebuilt wholesale at the next release. The paths leg's single `mentions`
(`tests/unit/stateKey.test.ts`) is visibility only and owes no waive.

Two `SHALL CONTINUE TO` pins, both deliberate: AC-9 protects the 409 the write path already gives
(the behaviour most likely to be "simplified" while its reader is being moved), and AC-10 protects
the claim this spec rests on — that nothing visible changed.

### Build and review record (2026-09-17)

**Two ACs were already true on the untouched pre-image, and their tests are regression pins rather
than red-phase proof.** AC-20260917-04-11's scenario cannot go red on pre-change code: the plain
`check --json` path never reads `design/approval.json` at all, and the only call site that does —
`themeFor`, reached exclusively by `check --look` — already swallowed a corrupt document silently
before D5 moved it onto `readDesignDoc`. The rewritten `tests/cli/check.test.ts` test therefore
proves `check --json` stays unaffected *and* exercises `check --look`'s theme capture against the
same corrupt file, green before and after. AC-20260917-04-5 is the same shape: `buildState` already
computed every analysis-derived field in a `try/catch` entirely prior to and independent of the
design-document read, so a corrupt `notes.json` never emptied them, pre-D1. Both were verified
against base `d033c4c` by extracting that commit and running the two tests on it. This is the
`SHALL CONTINUE TO` category the spec already applies to AC-9 and AC-10 (marked `reuses`, no
red-test obligation), mislabelled `writes`/`rewrites` in the File Plan — the ACs are honest, the
File Plan's annotation was not.

**Disposition — `leg:ac-matrix` rejected (2026-09-17, user-confirmed).** The AC-coverage leg
counted AC-20260917-04-9 and AC-20260917-04-10 as uncovered on zero title hits across File Plan
tests rows. Both are `reuses` rows whose carriers are pre-existing pins titled with their
*original* AC-IDs, so zero title hits is the expected shape, not a gap; AC-10's carrier
(`tests/browser/surfaces.test.ts`) is not a File Plan tests row at all, so the leg searched a set
that by construction could not contain it. Both carriers were executed green independently
(`api.test.ts :: review pass 3`, `surfaces.test.ts :: AC-20260915-02-1`). Rejected as a
miscitation of the spec's own carrier annotations.

**Gotchas eviction (2026-09-17).** The section was at its cap of 15, so admitting this spec's entry
evicted the `.test-dist/cli.js` gotcha by **merge**: its content is already stated in full in
`docs/canonical/package.md` § Tests and builds, which is where a standing fact about this repo's
test-and-build layout belongs.

**Advisory findings retained, not fixed here** (five softs, all executed-verified by the reviewer,
none behaviour-affecting today): `readDesignDoc` absorbs an absent file into the "exists but does
not parse" verdict, so its error text is untrue for ENOENT at the one caller that skips
`ensureDesignFiles`; `readDesignDocOrThrow` re-implements the catch instead of wrapping
`readDesignDoc`, leaving the two verdicts as two code paths that can still drift — the precise
drift D1 set out to make impossible; `tests/unit/plugin-shapes.test.ts` covers only the plugin's
fixture defaults and omits the shape `client waive` actually writes; AC-9's reused carrier asserts
the 409 status and byte-identity but never the refusal sentence the AC quotes; and AC-8's mutant
sweep replaces three values rather than each leaf.

## Canonical Delta

`docs/canonical/package.md` gains a **Design document reads** paragraph: the two design documents
have one readability verdict, `readDesignDoc` in `src/files/json.ts`, and every reader in the
package derives from it — `GET state` reports it as `documents.{notes,approval}` and serves
`EMPTY_*` as a documented placeholder when a read failed, both POST handlers answer 409, `sweep`
and `answer` refuse at exit 2, and `check`'s theme capture deliberately shrugs. `ok: false` always
means the file exists and cannot be used, never that it is absent. Read-back document schemas
validate only what this package reads or writes, accept any known `contractVersion`, and pass
everything else through — a rule that lowers how often a document drifts out of readability but
does not close it, because a missing required key is not an unknown key.

`.claude/rules/spec-pipeline.md` § Gotchas gains: [host] A design document that exists but fails
its schema must never be served as an empty one — `buildState` reports it through `documents` and
serves a documented placeholder; a bare `catch` that returns `EMPTY_*` makes the page state
"nothing here" as fact while the write path refuses the same bytes. — AC-20260917-04-4
