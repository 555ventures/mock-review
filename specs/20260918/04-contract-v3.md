---
date: 2026-09-18
status: hardened
tier: critical
area: schemas
design: false
breaking: true
depends_on: [specs/20260918/03-the-page-has-no-operator-controls.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-18
open_markers: 0
---

# Contract v3

## Goal

Three fields in the design documents are written and never read: `design/decisions.json` with its
`answer --decision` flag, `approval.theme`, and the `unapproveScreen` wire op. Three schemas still
accept `contractVersion: 1` for a migration nobody needs — the user re-runs `/spec:mocks` rather
than carrying old documents. And the spec plugin still writes `design/approval.json` itself, from a
second repository, outside the lock this series introduced. This spec is the one version flip: it
deletes the dead surface, pins the schemas to a single contract version, moves the plugin's last
direct write into a package verb, and lands the matching edits in the plugin repo in the same step.
Done means both repos say contract 3, nothing writes a field without a reader, and the package is
the only thing on the machine that writes a design document.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `CONTRACT_VERSION` (`src/schemas/version.ts:3`) becomes `3`, and `spec/templates/mock/contract.json`'s `contractVersion` becomes `3` in the same landing. The two repos are released together (AC-20260918-04-1, AC-20260918-04-9) | `lib/mock-cli.js`'s `contractOrDie` refuses on any skew, naming both numbers, so a split landing is not a degraded state — it is a hard stop for every host. That refusal is also the safety net that makes this flip safe to make now, while adoption is zero |
| D2 | The three `z.union([z.literal(1), z.literal(CONTRACT_VERSION)])` acceptances become `z.literal(CONTRACT_VERSION)`: `src/schemas/notes.ts:51`, `src/schemas/approval.ts:45`, and `src/schemas/decisions.ts` (which is deleted whole, D3). A v1 or v2 document is thereafter reported unreadable by the one shared verdict, whose remedy sentence already tells the reader to fix it by hand (AC-20260918-04-2) | No backward compatibility is required: the user re-runs `/spec:mocks`, and no host holds review data worth carrying. Executed (A1): `z.literal(3)` rejects `contractVersion: 2` with the issue at `['contractVersion']`, which is exactly what `judgeDesignDoc` turns into `documents.ok: false` — so an old document surfaces as the landed unreadable-file banner, never as an empty review |
| D3 | `design/decisions.json` is retired entirely: `src/schemas/decisions.ts` deleted, its export and `EMPTY_DECISIONS` removed from `src/schemas/index.ts`, `--decision` removed from `src/cli.ts` and `src/cli/answer.ts`, and `decisions` removed from `contract.json`'s `host` and `shapes` blocks (AC-20260918-04-3) | Nothing in the plugin has ever read it — a repo-wide grep of `spec/scripts`, `spec/commands` and `spec/doctrine` finds zero references. A verb flag whose output no one consumes is a promise the pipeline does not keep |
| D4 | `approval.theme` is removed from `ApprovalSchema` and from `EMPTY_APPROVAL`. Spec 03 already moved every reader to `check.config.theme`, so this deletion has no consumer left (AC-20260918-04-4) | Same reason as D3, one spec later: the field's last writer went away with the theme picker, and leaving it would preserve a slot the next reader would assume means something |
| D5 | The `unapproveScreen` **wire op** is removed from `ApprovalPatchSchema` and `applyApprovalPatch`. The internal helper of the same name in `src/server/patches.ts:36` — the one rule 6 calls — **stays** (AC-20260918-04-5) | The op has no caller anywhere: the page never sent it and the CLI never had it. The helper is a different thing with the same name, and deleting both is the obvious mistake this row exists to prevent |
| D6 | A new verb, `mock-review waive --journey <id> --reason <text> --beats <hash>`, in `src/cli/waive.ts`, writes the journey's waive entry through `applyApprovalPatch` under the design lock. The plugin's `writeApprovalRaw` (`spec/scripts/mocks-driver.js:335`) is deleted and its `client waive` path calls the verb through `mockCli.run` (AC-20260918-04-6, AC-20260918-04-10) | The user chose to put the writing inside the package. It is the last writer outside the lock, and it is currently a plain `writeFileSync` — not even atomic — so it can tear a file the rest of this series just made safe. The driver keeps computing the beats hash from the seed; only the write moves |
| D7 | The four hand-rolled empty documents — `src/ui/store/store.ts:53-54`, `src/ui/screen/ScreenPage.tsx:57`, `src/ui/shell/AppSidebar.tsx:35` — are replaced by `EMPTY_NOTES` / `EMPTY_APPROVAL` (AC-20260918-04-7) | They spell `contractVersion: 1 as const` inline and stop type-checking at v3, which is how they were found. Importing the constants is what stops the next bump finding them again |
| D8 | `package.json` goes to `3.0.0` and `src/index.ts:6`'s `VERSION` literal follows it in the same edit. The release itself — rebuilding the committed `dist/` and publishing — happens **after** this spec closes, never inside a build wave `[no-ac: release mechanics outside the spec's test surface; AC-20260918-04-1 pins the version the code reports]` | The package major IS the contract version, so the two numbers move together or `contract --json` lies. The pipeline rules forbid a `dist/` rebuild in a build batch, and publishing needs a human at a terminal |
| D9 | The plugin's prose moves with the code, in this spec's landing: `stage-design.md:85-89` and `sketch.md:104-116,139` stop saying approval is set "on the served page" and name `mock-review approve --screen`; `doctrine/design.md:31-37` names the same writer; `doctrine/mocks.md:208-211` drops `--decision`, `:314-317` states exactly which controls are gone (screen approve and theme pick — conversation closers and the Components page remain), `:331-333` describes the waive verb; `mocks-driver.js:580,582` remedy wording covers the page as well as the link; `templates/mock/mock.config.ts:2-3` and `lib/mock-cli.js:19-23` comments follow (AC-20260918-04-9) | The contradiction this series resolves lives in prose, not code. Leaving the old sentences would re-create the ambiguity the next time someone reads the doctrine instead of the spec |
| D10 | `README.md` and `docs/research/plugin-requirements.md` are corrected in the same landing: the install line, the verb table (gaining `approve` and `waive`, losing `--decision`), the host-layout block (losing `design/decisions.json`), and the stale claims that the theme is "picked on the page" `[no-ac: documentation of decisions covered by AC-20260918-04-3 and AC-20260918-04-4]` | The README's install instruction is already stale against the published package, and a research document that describes a retired field is how the next planning session re-derives the wrong contract |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/schemas/version.ts | MODIFY | schemas | D1: `CONTRACT_VERSION = 3` |
| src/schemas/notes.ts | MODIFY | schemas | D2: `contractVersion` pins to the single literal |
| src/schemas/approval.ts | MODIFY | schemas | D2 pin; D4 `theme` removed |
| src/schemas/decisions.ts | DELETE | schemas | D3 |
| src/schemas/index.ts | MODIFY | schemas | D3: decisions export and `EMPTY_DECISIONS` removed; D4 `EMPTY_APPROVAL` loses `theme` |
| src/schemas/patches.ts | MODIFY | schemas | D5: the `unapproveScreen` wire member removed |
| src/server/patches.ts | MODIFY | server | D5: the `unapproveScreen` CASE removed; the internal helper of the same name stays |
| src/cli.ts | MODIFY | cli | D3 `--decision` dropped; D6 `waive` joins the dispatcher |
| src/cli/answer.ts | MODIFY | cli | D3: the decision read, validation and second write removed |
| src/cli/waive.ts | CREATE | cli | D6: the verb, under the design lock, through the reducer |
| src/ui/store/store.ts | MODIFY | ui | D7: `EMPTY_STATE` uses `EMPTY_NOTES`/`EMPTY_APPROVAL` |
| src/ui/screen/ScreenPage.tsx | MODIFY | ui | D7: the inline empty approval becomes `EMPTY_APPROVAL` |
| src/ui/shell/AppSidebar.tsx | MODIFY | ui | D7: same |
| package.json | MODIFY | other | D8: `3.0.0` |
| src/index.ts | MODIFY | other | D8: `VERSION = '3.0.0'` |
| README.md | MODIFY | other | D10: install line, verb table, host layout |
| docs/research/plugin-requirements.md | MODIFY | other | D10: theme and decisions claims corrected |
| src/analysis/look.ts | MODIFY | analysis | D4: the `theme` option's doc comment stops naming `approval.theme` — its value now comes from `check.config.theme` (spec 03 D5); no signature change |
| tests/fixtures/contract.json | MODIFY | tests | D1/D3: the local copy of the plugin's contract goes to 3 and loses the `decisions` host path and shape — this is the fixture the byte-for-byte schema tests read |
| tests/helpers/cli.ts | MODIFY | tests | D3: `DESIGN_STATE_FILES` loses `decisions.json` (and, from spec 01, carries `.lock`) |
| tests/schemas/schemas.test.ts | MODIFY | tests | AC-20260918-04-1, AC-20260918-04-3 |
| tests/unit/design-docs.test.ts | MODIFY | tests | AC-20260918-04-2 |
| tests/unit/patches.test.ts | MODIFY | tests | AC-20260918-04-5 |
| tests/cli/answer.test.ts | MODIFY | tests | AC-20260918-04-3 |
| tests/cli/waive.test.ts | CREATE | tests | AC-20260918-04-6 |
| tests/unit/plugin-shapes.test.ts | MODIFY | tests | AC-20260918-04-8 |
| tests/e2e/driver.test.ts | MODIFY | tests | AC-20260918-04-9, AC-20260918-04-10 |

Plugin-repo edits land in the same step and are the orchestrator's duty, outside this table:
`spec/templates/mock/contract.json`, `spec/scripts/mocks-driver.js`, `spec/scripts/lib/mock-cli.js`
(comment), `spec/doctrine/mocks.md`, `spec/doctrine/design.md`,
`spec/doctrine/stages/stage-design.md`, `spec/commands/sketch.md`,
`spec/templates/mock/mock.config.ts` (comment), `tests/mocks/mock-app-fixtures.js`,
`tests/mocks/mock-driver-states.test.js`.

## Contracts

```ts
// src/schemas/version.ts
export const CONTRACT_VERSION = 3 as const

// src/schemas/notes.ts / approval.ts — was z.union([z.literal(1), z.literal(CONTRACT_VERSION)])
contractVersion: z.literal(CONTRACT_VERSION)

// src/schemas/approval.ts — REMOVED: theme: z.string().nullable().default(null)
// src/schemas/patches.ts — REMOVED member: { op: 'unapproveScreen', name }
// src/schemas/decisions.ts — DELETED

// src/cli/waive.ts
export function waiveVerb(
  cwd: string,
  flags: { journey?: string; reason?: string; beats?: string },
): Promise<string>
```

`spec/templates/mock/contract.json`: `contractVersion: 3`; `verbs` gains `approve` and `waive`;
`host` loses `decisions`; `shapes` loses `decisions`.

## Data Model

**Breaking.** `design/notes.json` and `design/approval.json` at `contractVersion` 1 or 2 stop
parsing and are reported unreadable. `design/decisions.json` is no longer read, written or created.
`approval.theme` is no longer part of the approval document.

**Migration: none, by decision.** Hosts re-run `/spec:mocks`. The two hosts on this machine hold
five notes between them, all test text; the one real client utterance is a journey conversation that
its author can re-enter. A host that wants its documents back restores them from git and hand-edits
`contractVersion`, which the unreadable-file sentence already tells them to do.

## Behavior

**A host on an old package meets a new plugin, or the reverse.** `contractOrDie` compares the
template's number against `contract --json` and refuses, naming both and printing the pinned-major
install remedy. Nothing is read, nothing is written; the remedy is to upgrade, not to edit a file.

**A host with old documents on the new package.** Every design-document read returns the unreadable
verdict, the page shows the landed banner naming the file, and every write refuses 409. The remedy
is `/spec:mocks` from the top, or a hand edit.

**Waiving a journey.** The driver computes the beats hash from the seed exactly as today and calls
`mock-review waive --journey <id> --reason <text> --beats <hash>`. The verb takes the design lock,
applies the entry through the reducer, and releases. No JS in the plugin repo writes a design file
any more.

## Acceptance Criteria

- **AC-20260918-04-1**: WHEN `mock-review contract --json` runs THE SYSTEM SHALL report
  `contractVersion: 3` and a `version` matching `package.json`'s `3.0.0`
  → rewrites tests/schemas/schemas.test.ts :: AC-20260915-01-2
- **AC-20260918-04-2**: WHEN a `design/notes.json` carrying `contractVersion: 2` is read THE SYSTEM
  SHALL report it unreadable rather than empty (`readDesignDoc` → `{ok: false}` whose error names
  `design/notes.json`), and the same for `contractVersion: 1`
  → rewrites tests/unit/design-docs.test.ts :: returns {ok:false, error} naming the file, for an
- **AC-20260918-04-3**: WHEN `mock-review answer --note N1 --text t --decision d` runs THE SYSTEM
  SHALL exit 2 with an unknown-flag usage refusal and create no `design/decisions.json`
  → rewrites tests/cli/answer.test.ts :: AC-20260917-01-11
- **AC-20260918-04-4**: WHEN an `approval.json` carrying a `theme` key is read THE SYSTEM SHALL
  report it unreadable, `ApprovalSchema` no longer declaring that field (`{contractVersion: 3,
  screens: {}, journeys: {}, theme: null}` → `{ok: false}`)
  → writes tests/unit/design-docs.test.ts
- **AC-20260918-04-5**: WHEN a request posts `{op:'unapproveScreen', name:'home'}` THE SYSTEM SHALL
  answer 400, while a new note on an approved screen SHALL CONTINUE to delete that screen's approval
  entry through the internal helper → writes tests/unit/patches.test.ts
- **AC-20260918-04-6**: WHEN `mock-review waive --journey first-visit --reason 'client unreachable'
  --beats <hash>` runs THE SYSTEM SHALL write `approval.journeys['first-visit']` carrying the reason
  and the beats hash, and exit 0 → writes tests/cli/waive.test.ts
- **AC-20260918-04-7**: WHEN the reviewer page renders before its first state fetch THE SYSTEM SHALL
  use `EMPTY_NOTES`/`EMPTY_APPROVAL`, no module declaring an inline `contractVersion` literal (a
  repo grep for `contractVersion: 1` under `src/` returns nothing)
  → writes tests/unit/design-docs.test.ts
- **AC-20260918-04-8**: WHEN the plugin's own default documents are parsed THE SYSTEM SHALL accept
  them, the copies in this test having been updated to contract 3
  → rewrites tests/unit/plugin-shapes.test.ts :: defaultApproval
- **AC-20260918-04-9**: WHEN the plugin's real `mocks-driver.js` runs against the fixture host with
  the built binary THE SYSTEM SHALL complete without a contract-skew refusal, both repos reporting 3
  → rewrites tests/e2e/driver.test.ts :: AC-20260915-01-23:
- **AC-20260918-04-10**: WHEN the driver's `client waive` path runs THE SYSTEM SHALL produce the
  waive entry through the package's verb, no JavaScript in the plugin repo writing
  `design/approval.json` (a grep of `spec/scripts/` for `approval.json` write calls returns nothing)
  → writes tests/e2e/driver.test.ts

## Assumptions (escalation triggers)

- **A1** — Executed 2026-09-18, zod 4.6.5: `z.literal(2)` rejects `contractVersion: 1` with
  `invalid_value`; a `.strict()` object rejects an undeclared `theme` key with `unrecognized_keys`.
  Both are the shapes D2 and D4 rely on. — **if false:** old documents would be accepted silently
  and the flip would be invisible; STOP.
- **A2** — `lib/mock-cli.js`'s `contractOrDie` compares `contract --json`'s `contractVersion`
  against the template's and dies naming both. Verified by reading. **Not executed against a v3
  package.** — **if false:** a skewed pair would proceed and corrupt state; execute the negative
  case (package 3, template 2) before landing.
- **A3** — Nothing in the plugin reads `design/decisions.json` or `approval.theme`. Verified by
  repo-wide grep of `spec/`. — **if false:** D3 or D4 shrinks to the package half and the field
  stays until its reader is retired.
- **A4** — The internal `unapproveScreen` helper (`src/server/patches.ts:36`) and the wire op of the
  same name are independent; rule 6 calls only the helper. Verified by reading. — **if false:** D5
  breaks rule 6 and AC-20260918-04-5's second clause catches it.
- **A5** — `tests/e2e/driver.test.ts` currently skips on contract skew and will run once both repos
  say 3. Verified by reading. — **if false:** the end-to-end leg stays skipped and AC-20260918-04-9
  has no oracle; make the skew explicit in the test title instead.
- **A6** — The plugin repo is editable in the same session as this spec's build. — **if false:**
  the landing splits and every host is hard-refused between the two releases; STOP and sequence the
  two repos deliberately.

## Rationale

Everything here is deletion plus one number, and it is one spec because the number is what makes the
deletions safe to see. A document from before the flip must not parse as a valid but oddly empty
document; it must be reported unreadable, which is what pinning `contractVersion` to a single
literal buys. That is also why the three schema pins, the two field deletions and the version bump
cannot be separated — each one alone leaves a state where a document half-parses.

Doing it now is a timing judgment, not a technical one. The package went public one day before this
series was planned and has essentially no adoption, so the cost of a breaking change is a
coordinated release in two repositories the same person owns. That cost grows with every host added
later, because each one has to re-run its design stage. There is no second cheap moment.

The plugin's own write moves in this spec rather than the first one because moving it requires a new
verb, and a new verb changes `contract.json`'s `verbs` list — which is a contract edit and therefore
belongs on the far side of the flip. Until it lands, the plugin's `client waive` remains the one
writer outside the lock: spec 01 states that residual explicitly rather than pretending the series
closes it earlier than it does.

Rejected: keeping a v2 compatibility branch behind a flag. It would preserve exactly the ambiguity
the pin removes, for hosts that have already been told to re-run the design stage, and every later
reader would have to ask which shape they were holding.

Collision closure for D3's retirement of `decisions.json` and D4's of `approval.theme` ran against
the stems `decisions.json`, `EMPTY_DECISIONS` and `approval.theme`, and returned three hits the first
draft had missed — `tests/fixtures/contract.json` (the local copy the byte-for-byte schema tests
read), `tests/helpers/cli.ts` (`DESIGN_STATE_FILES`) and `src/analysis/look.ts` (a doc comment
naming the retired field). All three are now File Plan rows and **fixed, not waived**, as is every
other source and test hit. Two hits are **waived**: `docs/research/prototype-inventory.md`, a
historical inventory of the hand-built prototype that records what existed at the time and is not
maintained against the current contract; and the committed `dist/` tree, which is regenerated at
release and never edited in a build wave. `docs/canonical/package.md` is carried by this spec's
Canonical Delta, applied by the review stage.

## Canonical Delta

`docs/canonical/package.md` — the contract section becomes: the package's major version is the
contract version, and both are 3. A design document is valid at exactly one contract version;
anything older is reported unreadable with the hand-fix remedy, and the migration path is to re-run
the design stage. `design/decisions.json` and the `answer --decision` flag are retired, as is
`approval.theme` — the theme is whatever `mock.config.ts` declares. The verb table gains `approve`
and `waive`; with `waive` in place, the package is the only program that writes a design document,
and every such write goes through the design lock.
