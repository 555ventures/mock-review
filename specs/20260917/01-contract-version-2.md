---
date: 2026-09-17
status: done
build_base: main
tier: critical
area: schemas
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-17
open_markers: 0
diff_base: 4d602108a94ba50ecdb1903f13019a78aaf5f5d3
---

# Contract version 2

## Goal

The spec plugin's mock stage is moving to contract v2 (claude-plugins `specs/20260917/01-the-client-confirms-the-story.md`), where a journey carries the client's own sentences and the client's confirm binds to a hash of them. This package must answer `2` before any of that can travel: today `contractVersion` is pinned to the zod literal `1` in six schemas, the package major is defined to equal it, and the plugin's skew guard refuses on any mismatch. This spec moves the number and nothing else that is visible: every produced shape (`contract --json`, `check --json`, `sweep --json`) reports `2`, every document this package reads back (`design/notes.json`, `design/approval.json`, `design/decisions.json`) accepts `1` or `2` and is rewritten as `2` the next time it is written, and the package becomes `2.0.0` installed as `#v2`. Done means: a host whose design files were written under v1 keeps every note, journey conversation and approval it had, and the e2e driver run states plainly when the installed plugin is still on v1 instead of failing as if this package were broken.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A new leaf module `src/schemas/version.ts` holds `export const CONTRACT_VERSION = 2 as const`, and `src/schemas/index.ts` re-exports it (`export * from './version.js'`). The six schema modules import it from `./version.js`, never from `./index.js`: `index.ts` re-exports the schema modules, so a schema module importing the constant back from `index.ts` forms a cycle in which the constant is still in its temporal dead zone — verified to throw `ReferenceError: Cannot access 'CONTRACT_VERSION' before initialization` at module load (A7). The three **produced** shapes pin it exactly — `ContractSchema`, `CheckSchema`, `SweepSchema` use `z.literal(CONTRACT_VERSION)` — and their producers (`src/cli/contract.ts`, `src/analysis/check.ts`, `src/cli/sweep.ts`) emit `CONTRACT_VERSION` instead of the inline `1` (AC-20260917-01-1, AC-20260917-01-2, AC-20260917-01-3) | One constant is the single place the number lives; the plugin reads exactly one number (`spec/scripts/lib/mock-cli.js:165-167`) and a split bump would be a lie the next reader trips on |
| D2 | The three **read-back** documents accept either version: `NotesSchema`, `ApprovalSchema` and `DecisionsSchema` take `contractVersion: z.union([z.literal(1), z.literal(CONTRACT_VERSION)])`. Any other value (`0`, `3`, a string) still refuses. Every write emits `CONTRACT_VERSION`, stamped at the **write sites, not in the pure reducers**: `src/server/plugin.ts:349` (notes), `:351` (approval, inside the existing `result.approval !== approval` guard), `:418` (approval) and `src/cli/answer.ts:71` (notes), `:75` (decisions) each persist `{ ...doc, contractVersion: CONTRACT_VERSION }`, and `plugin.ts` sends that same stamped document as the 200 body. `applyNotesPatch`/`applyApprovalPatch` stay pure and untouched: `unapproveScreen` returns its input object unchanged on a no-op (`src/server/patches.ts:143`), so stamping inside them would break that identity check and rewrite `approval.json` on every note patch. A read-only verb never rewrites the file (AC-20260917-01-4, AC-20260917-01-5, AC-20260917-01-10, AC-20260917-01-11, AC-20260917-01-12 — the page write path's own pin, added at review fix) | Migrate-on-write: a v1 file stays readable and is upgraded the first time the host writes, so no existing host goes red and no separate migration step exists. Refusing v1 would make `buildState`'s catch fall back to empty notes/approval — a page that renders "nothing pending, nothing approved" and only fails at the first write, with a refusal about a file the client never touched |
| D3 | `EMPTY_NOTES`, `EMPTY_APPROVAL` and `EMPTY_DECISIONS` (`src/schemas/index.ts:14-28`) carry `contractVersion: CONTRACT_VERSION`, so `ensureDesignFiles` creates new documents at 2 (AC-20260917-01-6) | The creation path and the write path must not disagree about the version they stamp |
| D4 | `package.json` `version` becomes `2.0.0`, the package's own public `VERSION` export (`src/index.ts:6`) becomes `'2.0.0'`, and the `description` ends `(contract v2).`; the install line in `docs/canonical/package.md` and `docs/brief-01-the-reviewer-package.md` becomes `npm i -D github:555ventures/mock-review#v2` (AC-20260917-01-8) | The repo's own ruling is that the package major equals the contract version (`docs/research/plugin-requirements.md:25,175`, `docs/research/fable-rulings.md:5`); the tag is how a host pins it |
| D5 | `tests/fixtures/contract.json` — this repo's copy of the plugin's contract template, consumed by `tests/schemas/schemas.test.ts` — goes to `"contractVersion": 2`. Its `shapes`/`required` lists are unchanged by this spec (AC-20260917-01-7) | The conformance test validates live CLI output against this copy; leaving it at 1 would fail every produced shape for a reason that has nothing to do with shape |
| D6 | A pure helper `contractSkew(templatePath, packageVersion): string | null` in `tests/helpers/cli.ts` returns `null` when the installed plugin's `spec/templates/mock/contract.json` reports this package's `CONTRACT_VERSION`, and otherwise the reason string `plugin template contract <n> ≠ package contract 2 — build claude-plugins specs/20260917/01 first`. Only the driver test that actually runs the driver (`tests/e2e/driver.test.ts` :: AC-20260915-01-23) consults it, calling vitest's in-body `ctx.skip(reason)` (vitest 5.0.1, reason preserved in the report); AC-20260915-01-22, which only checks fixture `node_modules` resolution and never runs the driver, is untouched so a real fixture regression can still go red. The helper itself is the falsifiable surface (AC-20260917-01-9) | The plugin template is still at 1 (verified 2026-09-17), so its driver refuses at `contractOrDie` until that repo's spec is built; a red suite would blame this package for a cross-repo ordering fact, and the guard self-heals the moment the plugin lands |
| D7 | The UI's inline fallback documents (`src/ui/store/store.ts:48-49`, `src/ui/shell/AppSidebar.tsx:35`, `src/ui/screen/ScreenPage.tsx:57`) are **not** touched by this spec `[no-ac: D2's union keeps the inline literal 1 valid and these objects are never written to disk; they change in the client-page spec that reworks those components]` | Out-of-scope churn in the three files the next spec rewrites anyway; the page renders them only before the first fetch resolves |
| D8 | Nothing else in the contract moves here: no journey field (`beat`, `state`, `say`, `persona`), no note status, no approval key. They land in the sibling spec `02-the-story-travels` `[no-ac: scope statement, no surface]` | Landing unit: after this spec the system is green and reports 2; the story's own fields need the client-write path and the hash, which is its own batch |
| D9 | `tests/e2e/approved.test.ts` :: AC-20260915-02-21 (its suite; the driver-running test inside it is AC-20260915-03-11, which is where the skip lands) — the second driver-running e2e test, missed by D6 — consults the same `contractSkew` helper and calls `ctx.skip(reason)` on a non-null reason. Added to scope by the user at build time (gate-1 failure: the driver exits 2 at `contractOrDie` with the template at 1 against this package at 2). No new mechanism: the helper of D6 is reused verbatim, and its own falsifiable surface stays AC-20260917-01-9 `[no-ac: wiring of the helper AC-20260917-01-9 covers; a skew skip has no assertion of its own]` | D6 named one driver-running test and there are two; leaving the second red would blame this package for a cross-repo ordering fact, exactly what D6 exists to prevent, and the skip self-heals when the plugin lands |
| D10 | `contractSkew` grows a **second branch** and both driver-running e2e tests (`tests/e2e/driver.test.ts` :: AC-20260915-01-23 and `tests/e2e/approved.test.ts` :: AC-20260915-03-11) consult it: after the version comparison, the helper reads the template's `fields` block and probes this package's own journey schema with each journey/step/edge field it declares (`persona`, `beat`, `state`, `say`). A field the template declares and this package's schema refuses returns the reason `plugin template declares journey field <name> this package's contract does not accept — build mock-review specs/20260917/02-the-story-travels first`; all fields accepted returns `null`. Added to scope by the user at repair round 1. (AC-20260917-01-9) | A4 flipped **during this build** — the plugin's own `20260917/01` landed, so the template reads 2 and the version branch is now silent, while the same commit moved the seed to the client's sentences and its driver refuses this repo's fixture seed block. The ordering fact D6 exists to absorb simply changed shape: probing the live schema instead of a version integer makes the guard self-healing — it goes silent the moment sibling 02 teaches the schema those fields, with no second mechanism and nothing to remember to remove |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/schemas/version.ts | CREATE | schemas | D1: the leaf module holding `export const CONTRACT_VERSION = 2 as const`; imports nothing |
| src/schemas/index.ts | MODIFY | schemas | D1/D3: `export * from './version.js'`; `EMPTY_NOTES`/`EMPTY_APPROVAL`/`EMPTY_DECISIONS` carry `CONTRACT_VERSION` |
| src/schemas/contract.ts | MODIFY | schemas | D1: `contractVersion: z.literal(CONTRACT_VERSION)` |
| src/schemas/check.ts | MODIFY | schemas | D1: `contractVersion: z.literal(CONTRACT_VERSION)` (line 102 only; journey shapes untouched) |
| src/schemas/sweep.ts | MODIFY | schemas | D1: `contractVersion: z.literal(CONTRACT_VERSION)` |
| src/schemas/notes.ts | MODIFY | schemas | D2: `contractVersion: z.union([z.literal(1), z.literal(CONTRACT_VERSION)])` |
| src/schemas/approval.ts | MODIFY | schemas | D2: same union |
| src/schemas/decisions.ts | MODIFY | schemas | D2: same union |
| src/analysis/check.ts | MODIFY | analysis | D1: `contractVersion: CONTRACT_VERSION` in the constructed `Check` (line 83) |
| src/server/plugin.ts | MODIFY | server | D2: stamp `CONTRACT_VERSION` at the three write sites (349, 351 inside the identity guard, 418) and send the stamped document as the 200 body |
| src/cli/contract.ts | MODIFY | cli | D1: emit `CONTRACT_VERSION` (line 16) |
| src/cli/sweep.ts | MODIFY | cli | D1: emit `CONTRACT_VERSION` (line 73) |
| src/cli/answer.ts | MODIFY | cli | D1/D2: the created `decisions` document (line 65) and both writes (lines 71, 75) carry `CONTRACT_VERSION` |
| src/index.ts | MODIFY | other | D4: the public `VERSION` export becomes `'2.0.0'` (line 6) |
| package.json | MODIFY | other | D4: `version: "2.0.0"`; description ends `(contract v2).` |
| package-lock.json | MODIFY | other | D4 + review fix: npm-written version sync for the 2.0.0 bump (`npm install --package-lock-only`), folded in from the build's deviation record |
| docs/canonical/package.md | MODIFY | other | D4 + Canonical Delta: contract v2, the three produced literals, the migrate-on-write rule, `#v2` install line |
| docs/brief-01-the-reviewer-package.md | MODIFY | other | D4: install line `#v2`, contract v2 wording |
| README.md | MODIFY | other | D4: the `#v1` install line and the "satisfies contract v1" sentence become v2 |
| .claude/rules/spec-pipeline.md | MODIFY | other | D4: § Planning's "the binding contract, contractVersion 1" becomes 2 — grounding prose every later spec reads |
| tests/fixtures/contract.json | MODIFY | tests | D5: `"contractVersion": 2` |
| tests/cli/contract.test.ts | MODIFY | tests | AC-20260917-01-1 |
| tests/cli/check.test.ts | MODIFY | tests | AC-20260917-01-2 |
| tests/cli/sweep.test.ts | MODIFY | tests | AC-20260917-01-3 |
| tests/cli/answer.test.ts | MODIFY | tests | AC-20260917-01-4, AC-20260917-01-5, AC-20260917-01-11 |
| tests/helpers/cli.ts | MODIFY | tests | D6/D10: the pure `contractSkew(templatePath, packageVersion)` helper — version branch plus the declared-journey-field probe |
| tests/unit/contract-skew.test.ts | CREATE | tests | AC-20260917-01-9 |
| tests/cli/files.test.ts | MODIFY | tests | AC-20260917-01-6, AC-20260917-01-10 |
| tests/schemas/schemas.test.ts | MODIFY | tests | AC-20260917-01-7 |
| tests/package/version.test.ts | CREATE | tests | AC-20260917-01-8 |
| tests/e2e/driver.test.ts | MODIFY | tests | D6: the driver-running test (AC-20260915-01-23) calls `ctx.skip(contractSkew(...))` when the reason is non-null; AC-20260915-01-22 untouched `[no-ac: wiring of the helper AC-20260917-01-9 covers; a skew skip has no assertion of its own]` |
| tests/e2e/approved.test.ts | MODIFY | tests | D9/D10: the driver-running test (AC-20260915-03-11, in the AC-20260915-02-21 suite) calls `ctx.skip(contractSkew(...))` when the reason is non-null |
| tests/server/api.test.ts | MODIFY | tests | AC-20260917-01-12: D2's page write path — the three write sites and the 200 body |
| tests/unit/selectors.test.ts | MODIFY | tests | Currency only, no retag: the three `contractVersion: 1` fixtures (lines 29, 34, 42) stay valid under D2's union; update only if a type error appears |
| tests/browser/hmr.test.ts | MODIFY | tests | Currency only, no retag: `contractVersion` fixture at line 49 |
| tests/browser/roundtrip.test.ts | MODIFY | tests | Currency only, no retag: `contractVersion` fixture at line 162 |

Orchestrator duty outside the table: `dist/` is committed at release only (`docs/canonical/package.md` § Release), so this spec does **not** rebuild it; the release that publishes tag `v2` does, and `dist/` is already one commit stale independent of this work.

## Contracts

**The one constant** — `src/schemas/index.ts`:

```ts
export const CONTRACT_VERSION = 2 as const
```

**Produced shapes (exact literal)** — `contract`, `check`, `sweep`:

```ts
contractVersion: z.literal(CONTRACT_VERSION)
```

`contract --json` stdout, byte for byte (trailing newline, nothing else):

```
{"contractVersion":2,"package":"@555-ventures/mock-review","version":"2.0.0"}
```

**Read-back documents (accept either, write the new one)** — `notes`, `approval`, `decisions`:

```ts
contractVersion: z.union([z.literal(1), z.literal(CONTRACT_VERSION)])
```

Accepted: `1`, `2`. Refused: `0`, `3`, `"2"`, absent (executed, A2).

**Created documents** (`ensureDesignFiles`, `src/files/json.ts:33-42`):

```json
{"contractVersion":2,"notes":[],"journeys":{}}
{"contractVersion":2,"screens":{},"journeys":{},"theme":null}
{"contractVersion":2,"decisions":[]}
```

## Data Model

Existing persisted state **is** affected, and only in one field. A host's `design/notes.json`, `design/approval.json` and `design/decisions.json` written under v1 keep parsing; the first write through any writer (`answer`, a page patch) rewrites the whole document with `contractVersion: 2` and every other key carried over untouched. There is no separate migration command and no in-place upgrade on read: a verb that only reads leaves the file byte-identical (AC-20260917-01-10). Downgrading is not supported — a document at 2 refuses under a v1 build, which is the intended loud failure when a host pins `#v1` against v2 design files.

## Behavior

**A v1 host upgrading.** The host installs `#v2`. `check` reads its v1 `notes.json`, reports `contractVersion: 2` in its own output, and leaves the file alone. The first note answered, or the first patch from the page, rewrites `notes.json` at version 2 with its notes and journey conversations intact.

**A skewed plugin.** The installed plugin's template still says 1, so `mocks-driver.js` refuses at `contractOrDie` with `1 ≠ 2` and its own remedy. That is correct and outside this package; in this repo's own suite the e2e driver test skips, naming both numbers, until the plugin's spec is built.

**Edge: a document at an unknown version.** `contractVersion: 3` refuses exactly as an unparseable file does today — 409 from the page's write path, exit 2 from `answer` — never a silent rewrite.

## Acceptance Criteria

- **AC-20260917-01-1**: WHEN `contract --json` runs THE SYSTEM SHALL print exactly `{"contractVersion":2,"package":"@555-ventures/mock-review","version":"2.0.0"}` followed by one newline and nothing else on stdout → rewrites tests/cli/contract.test.ts :: AC-20260915-01-3: contract --json in
- **AC-20260917-01-2**: WHEN `check --json` runs on the green fixture host THE SYSTEM SHALL report `contractVersion: 2` (literally `"contractVersion":2` in the parsed object) with its `screens`/`shells`/`themes` content otherwise unchanged → rewrites tests/cli/check.test.ts :: AC-20260915-01-5:
- **AC-20260917-01-3**: WHEN `sweep --json` runs on the green fixture host THE SYSTEM SHALL report `contractVersion: 2` with the same inventory and queue it reports today → rewrites tests/cli/sweep.test.ts :: AC-20260915-01-18:
- **AC-20260917-01-4**: WHEN `design/notes.json` on disk is `{"contractVersion":1,"notes":[{"id":"N1",…,"status":"open","thread":[]}],"journeys":{}}` and `answer --note N1 --text "use the card"` runs THE SYSTEM SHALL exit 0 and leave the file carrying `"contractVersion":2`, note `N1` with `status: "answered"` and one appended `{"by":"session","text":"use the card"}` thread entry, and no other key changed → rewrites tests/cli/answer.test.ts :: AC-20260915-01-16: answer --note
- **AC-20260917-01-5**: WHEN `design/decisions.json` is `{"contractVersion":3,"decisions":[]}` and `answer --note N1 --text x --decision d` runs THE SYSTEM SHALL exit 2 and leave both `decisions.json` and `notes.json` byte-identical; WHEN the same file reads `{"contractVersion":1,"decisions":[]}` or `{"contractVersion":2,"decisions":[]}` THE SYSTEM SHALL exit 0 and write the appended decision at `"contractVersion":2` → rewrites tests/cli/answer.test.ts :: AC-20260915-01-17: answer --decision refuses
- **AC-20260917-01-6**: WHEN `check --json` runs on a scratch host with no `design/` directory THE SYSTEM SHALL create `design/notes.json` as `{"contractVersion":2,"notes":[],"journeys":{}}` and `design/approval.json` as `{"contractVersion":2,"screens":{},"journeys":{},"theme":null}` → rewrites tests/cli/files.test.ts :: AC-20260915-01-15: check
- **AC-20260917-01-7**: WHEN the live output of `contract --json`, `check --json` and `sweep --json` is validated against `tests/fixtures/contract.json` (itself at `"contractVersion": 2`) THE SYSTEM SHALL report no missing required key for any of the three verbs → rewrites tests/schemas/schemas.test.ts :: AC-20260915-01-2: contract
- **AC-20260917-01-8**: WHEN `package.json` and `src/index.ts` are read THE SYSTEM SHALL carry `"version": "2.0.0"`, a `description` ending `(contract v2).` and `VERSION === '2.0.0'`, and the major of that version SHALL equal `CONTRACT_VERSION` imported from `src/schemas/version.js` (`2` → `2`) → writes tests/package/version.test.ts
- **AC-20260917-01-9**: WHEN `contractSkew(<a contract.json reporting 1>, 2)` is called THE SYSTEM SHALL return exactly `plugin template contract 1 ≠ package contract 2 — build claude-plugins specs/20260917/01 first`; WHEN the template reports `2` SHALL return `null`; WHEN the template path does not exist SHALL return `null` (a host without the plugin installed is not skew) ; WHEN the template's `fields` block declares a journey field this package's journey schema refuses (`beat`) SHALL return exactly `plugin template declares journey field beat this package's contract does not accept — build mock-review specs/20260917/02-the-story-travels first`; WHEN every declared journey field parses SHALL return `null` → writes tests/unit/contract-skew.test.ts
- **AC-20260917-01-10**: WHEN a host's `design/approval.json` already exists and a read-only verb (`check --json`) runs over it THE SYSTEM SHALL CONTINUE TO leave that file byte-identical, including a file whose `contractVersion` is `1` → reuses tests/cli/files.test.ts :: AC-20260915-01-15: an
- **AC-20260917-01-11**: WHEN `answer --note N1 --text x --decision "cards, not tables"` runs on a host with no `design/decisions.json` THE SYSTEM SHALL create it as `{"contractVersion":2,"decisions":[{"screen":"home","text":"cards, not tables","at":"<iso>"}]}` → rewrites tests/cli/answer.test.ts :: AC-20260915-01-17: answer --decision appends
- **AC-20260917-01-12**: WHEN a host's `design/notes.json` and `design/approval.json` are both at `{"contractVersion":1,...}` and the reviewer page posts a note patch to `/__mock-review/notes` THE SYSTEM SHALL answer 200 with a body carrying `contractVersion: 2`, rewrite `notes.json` at `"contractVersion":2` with its notes and journey conversations intact, and leave `approval.json` byte-identical at `1` (the `result.approval !== approval` identity guard); WHEN a theme patch is posted to `/__mock-review/approval` THE SYSTEM SHALL answer 200 with `contractVersion: 2` in the body and rewrite `approval.json` at `"contractVersion":2`; WHEN `approval.json` reads `{"contractVersion":3,...}` THE SYSTEM SHALL answer 409 and leave the file byte-identical → writes tests/server/api.test.ts

## Assumptions (escalation triggers)

- A7: A schema module that imports `CONTRACT_VERSION` back from `src/schemas/index.ts` (which `export *`s that same module) throws `ReferenceError: Cannot access 'CONTRACT_VERSION' before initialization` at module load; the same code with the constant in a leaf module both files import loads cleanly (executed 2026-09-17, node ESM, scratch files under the session scratchpad). This is why D1 creates `src/schemas/version.ts`. — **if false:** D1's leaf module is harmless either way; keep it.
- A2: Under the installed zod (4.6.5), `z.union([z.literal(1), z.literal(2)])` inside a `.strict()` object accepts `{contractVersion:1}` and `{contractVersion:2}` and refuses `{contractVersion:3}` with an `invalid_union` issue; a `.strict()` object with optional extra keys still refuses an unknown key (executed 2026-09-17, scratch `spike-v2.mjs` run inside the repo, deleted). — **if false:** express the same acceptance with `z.literal([1,2])` or a refinement; D2's behaviour is unchanged.
- A3: The current build's `JourneySchema` refuses `beat`/`state` on a step, `say` on an edge and `persona` on a journey, and `CheckSchema` refuses `contractVersion: 2` (executed 2026-09-17 against `src/` via tsx, scratch deleted). So no host can emit story fields until the sibling spec lands, and this spec alone is what makes a v2 `check` parse at all. — **if false:** nothing here changes; the sibling spec's scope shrinks.
- A4: The plugin template at `~/projects/claude-plugins/spec/templates/mock/contract.json` reads `"contractVersion": 1` today (verified 2026-09-17; its bump is that repo's hardened spec `20260917/01`, not yet built). — **if false (it already reads 2):** D6's guard simply never skips, and the e2e suite runs as today. **FALSIFIED 2026-09-17 mid-build**: the plugin's `20260917/01` landed while this spec's waves ran — the template now reads 2 and the same commit moved the seed format, so "runs as today" no longer means green. D10 is the ruling that replaces this assumption's remedy.
- A5: `tests/fixtures/contract.json` is a repo-local copy with no automated sync to the plugin's template (verified byte-identical today, no reader of the plugin path in `src/` or `tests/`). — **if false:** drop D5 and let the shared reader be the single source.
- A6: The `v2` tag is **not** moved when this spec lands — it is moved by the release that follows sibling 02. Between the plugin's build (template → 2) and 02, `contractOrDie` would pass while `check` still refuses a journey carrying `beat`/`state` (A3), which is a worse failure than today's loud skew refusal; the tag is what keeps a host out of that window. No host outside this repo pins `#v1` in a way that a `2.0.0` publish breaks silently — the tag is moved deliberately at release, and the plugin's own remedy strings embed the contract version they expect. — **if false:** STOP, ask the user before the release step; the spec's code is unaffected.

## Rationale

The number had to move before anything else could: the plugin compares one integer and refuses on mismatch, so every later piece of the story work is blocked behind this. The split between produced and read-back shapes is the whole design. What this package *prints* is a statement about itself and must be exact, so those three stay `z.literal`. What it *reads back* is a file a host wrote earlier, possibly under v1, and refusing it would be a silent catastrophe rather than a loud one: `buildState` catches a parse failure and falls back to empty documents, so the page would render a clean, empty review — nothing pending, nothing approved — and only fail at the client's first write, with a message about a file they never touched. Migrate-on-write keeps every existing host readable and upgrades it the moment it is written, with no migration command to forget. Rejected: a `--migrate` verb (a step that exists only to be skipped); accepting any integer (then a v3 document written by a future build would be read as if it were understood); bumping only the trio the plugin reads (the repo's own rule ties the package major to the contract, and a half-bump is a lie). The e2e skew guard is the one piece that exists purely for ordering: the plugin's template is still at 1 today, so without it this repo's suite goes red for a fact about another repo. It is written as a skip with both numbers in the reason, not a silent pass, and it disappears on its own once the plugin's spec is built. Fragile: the two copies of `contract.json`, which nothing keeps in sync; if they drift again, the conformance test is what catches it.

Collision-closure waives (literals leg, run at lock over `#v1`, `contract v1`, `contractVersion 1`): `docs/research/plugin-requirements.md`, `docs/research/fable-rulings.md` and `docs/research/spikes.md` are dated research records of what was executed and ruled at the time — they are evidence, not live grounding, and are never rewritten when the thing they recorded moves; the rule they established (package major equals the contract version) is honoured by D4 rather than re-stated. Every other hit is a File Plan row.

Folded from this build's deviations sidecar (one-off, no recurrence): `package-lock.json` was not in the original File Plan, but `package.json`'s bump to `2.0.0` leaves the lockfile's own `version` fields stale, so the `other` worker synced it through `npm install --package-lock-only` rather than by hand. Besides the root and self `version` fields npm also wrote six nested `"inBundle": true` entries under `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules` (@emnapi/core 1.11.1, @emnapi/runtime 1.11.1, @emnapi/wasi-threads 1.2.2, @napi-rs/wasm-runtime 1.1.4, @tybys/wasm-util 0.10.2, tslib 2.8.1); no top-level dependency version moved. The review's reconcile leg caught it as out of plan and the fix folded it in as a File Plan row — the lesson for the next version bump is that the lockfile is part of the bump's file set, not a side effect.

## Canonical Delta

`docs/canonical/package.md` — the contract line becomes: **The binding contract is the spec plugin's `spec/templates/mock/contract.json` (contractVersion 2)**; every shape below has a zod schema in `src/schemas/`, and `CONTRACT_VERSION` in `src/schemas/index.ts` is the one place the number lives. The verb table's `contract` row prints `{"contractVersion":2,"package":"@555-ventures/mock-review","version":"<package.json version>"}` and the `sweep` row `{contractVersion:2, inventory, queue}`. The file-layer rows read: `design/notes.json`, `design/approval.json` and `design/decisions.json` are **created at `contractVersion: 2`**, accept `1` or `2` when present, and are rewritten at `2` by the first writer that touches them; a read-only verb leaves the file byte-identical, and any other version refuses exactly as an unparseable file does (409 from the page, exit 2 from the CLI). The release section's install line becomes `npm i -D github:555ventures/mock-review#v2`, and the package major continues to equal the contract version.
