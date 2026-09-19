---
date: 2026-09-18
status: done
tier: critical
area: schemas
design: false
breaking: true
depends_on: [specs/20260918/03-the-page-has-no-operator-controls.md]
depended_on_by: []
brief: n/a
build_base: main
spiked: 2026-09-18
open_markers: 0
diff_base: 46c314664a4aff3f149ed30d7465d0d921b65b53
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

| ID  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | One-line rationale                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `CONTRACT_VERSION` (`src/schemas/version.ts:3`) becomes `3`. The plugin template's matching bump is the SIBLING spec's row, not this one's; the two land as a pair and are released together (AC-20260918-04-1, AC-20260918-04-9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `lib/mock-cli.js`'s `contractOrDie` refuses on any skew, naming both numbers, so a split landing is not a degraded state — it is a hard stop for every host. That refusal is also the safety net that makes this flip safe to make now, while adoption is zero                                                                                                                                                                                    |
| D2  | The three `z.union([z.literal(1), z.literal(CONTRACT_VERSION)])` acceptances become `z.literal(CONTRACT_VERSION)`: `src/schemas/notes.ts:51`, `src/schemas/approval.ts:45`, and `src/schemas/decisions.ts` (which is deleted whole, D3). A v1 or v2 document is thereafter reported unreadable by the one shared verdict, whose remedy sentence already tells the reader to fix it by hand (AC-20260918-04-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | No backward compatibility is required: the user re-runs `/spec:mocks`, and no host holds review data worth carrying. Executed (A1): `z.literal(3)` rejects `contractVersion: 2` with the issue at `['contractVersion']`, which is exactly what `judgeDesignDoc` turns into `documents.ok: false` — so an old document surfaces as the landed unreadable-file banner, never as an empty review                                                     |
| D3  | `design/decisions.json` is retired entirely: `src/schemas/decisions.ts` deleted, its export and `EMPTY_DECISIONS` removed from `src/schemas/index.ts`, `--decision` removed from `src/cli/answer.ts`, and — because `parseArgs` (`src/cli/args.ts:26-35`) collects any `--name value` with no per-verb allow-list — `src/cli.ts`'s `answer` branch REFUSES it explicitly: `values.decision !== undefined                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                   | flags.has('decision')`→ exit 2 with`usage: answer (--note <id> | --journey <id>) --text <t>` (AC-20260918-04-3) | Nothing in the plugin has ever READ it — the only mentions are `doctrine/mocks.md:209`'s usage line and `contract.json:17,46`, both retired by the sibling plugin spec. Merely dropping the flag from the dispatcher would leave `answer --decision d` exiting 0 and silently ignoring it, which is the same broken promise in a quieter form — hence the explicit refusal |
| D4  | `approval.theme` is removed from `ApprovalSchema` and from `EMPTY_APPROVAL`. Spec 03 already moved every reader to `check.config.theme`, so this deletion has no consumer left (AC-20260918-04-4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Same reason as D3, one spec later: the field's last writer went away with the theme picker, and leaving it would preserve a slot the next reader would assume means something                                                                                                                                                                                                                                                                     |
| D5  | The `unapproveScreen` **wire op** is removed from `ApprovalPatchSchema` and `applyApprovalPatch`. The internal helper of the same name in `src/server/patches.ts:36` — the one rule 6 calls — **stays** (AC-20260918-04-5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The op has no caller anywhere: the page never sent it and the CLI never had it. The helper is a different thing with the same name, and deleting both is the obvious mistake this row exists to prevent                                                                                                                                                                                                                                           |
| D6  | A new approval **op** and the verb that sends it. `ApprovalPatchSchema` gains `{ op:'waive', id, reason, beats }` (`.strict()`, `reason` trimmed non-empty) and `applyApprovalPatch` gains the matching case, writing `{ ...existing, client: 'waived', reason, beats, at: new Date().toISOString() }` — mirroring `clientOk`'s fresh stamp and, like it, never writing `approvedAt`. `clientApprovalPatch` (`plugin.ts:220-222`) admits only `clientOk`, so the new op is owner-only over HTTP with no extra gate (AC-20260918-04-11). Unlike `clientOk` (`plugin.ts:462-478`) the HTTP path applies **no** journey-existence and **no** beats-freshness guard to `waive` — stated deliberately, because the verb is the intended caller and it re-derives nothing: a worker must not 'fix' this by copying `clientOk`'s guards. `mock-review waive --journey <id> --reason <text> --beats <hash>` (`src/cli/waive.ts`) applies it under the design lock (AC-20260918-04-6) | The first draft specified the verb and no operation for it to send — `ApprovalPatchSchema` has only `approveScreen`/`unapproveScreen`/`clientOk`/`theme`, none of which can write a waive. The op is the missing half; putting it beside `clientOk` keeps the two ways a journey gets settled in one reducer, which is what stops them drifting on `approvedAt`                                                                                   |
| D7  | The four hand-rolled empty documents — `src/ui/store/store.ts:53-54`, `src/ui/screen/ScreenPage.tsx:57`, `src/ui/shell/AppSidebar.tsx:35` — are replaced by `EMPTY_NOTES` / `EMPTY_APPROVAL` (AC-20260918-04-7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | They spell `contractVersion: 1 as const` inline and stop type-checking at v3, which is how they were found. Importing the constants is what stops the next bump finding them again                                                                                                                                                                                                                                                                |
| D8  | `package.json` goes to `3.0.0` and `src/index.ts:6`'s `VERSION` literal and `package.json`'s `description` (which still says "contract v2") follow it in the same edit. The release itself — rebuilding the committed `dist/` and publishing — happens **after** this spec closes, never inside a build wave `[no-ac: release mechanics outside the spec's test surface; AC-20260918-04-1 pins the version the code reports]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The package major IS the contract version, so the two numbers move together or `contract --json` lies. The pipeline rules forbid a `dist/` rebuild in a build batch, and publishing needs a human at a terminal                                                                                                                                                                                                                                   |
| D9  | **The plugin half is a sibling spec, not this one's homework.** `claude-plugins/specs/20260918/01-mock-contract-v3.md` owns `contract.json` → 3, the driver's `client waive` switching to the verb, the `defaultApproval`/`defaultNotes` fixtures, and every doctrine edit. This spec is package-only. The two land as a pair, package first; between the two landings the env-gated live-template tests (`tests/unit/contract-skew.test.ts:88,92`, both already `skipIf(!hasPlugin)`) are RED for anyone with a plugin checkout, and `tests/e2e/driver.test.ts` skips on `contractSkew` — expected, and closed by the sibling `[no-ac: cross-repo sequencing; the sibling spec carries the driver-level ACs in its own suite]`                                                                                                                                                                                                                                              | The first draft put ten plugin files under "the orchestrator's duty, outside this table": no worker, no wave, no diff in the review stage's evidence, and `/spec:run`'s worktree is this repo's only. The plugin repo has its own spec pipeline and its own suite; work it owns belongs in a spec it can actually execute                                                                                                                         |
| D10 | `README.md` and `docs/research/plugin-requirements.md` are corrected in the same landing: the install line, the verb table (gaining `approve` and `waive`, losing `--decision`), the host-layout block (losing `design/decisions.json`), and the stale claims that the theme is "picked on the page" `[no-ac: documentation of decisions covered by AC-20260918-04-3 and AC-20260918-04-4]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The README's install instruction is already stale against the published package, and a research document that describes a retired field is how the next planning session re-derives the wrong contract                                                                                                                                                                                                                                            |
| D11 | **User ruling, 2026-09-19 (build repair round 1; Fable 5 second opinion).** `EMPTY_NOTES` and `EMPTY_APPROVAL` are DEFINED in `src/schemas/version.ts` (zod-free; their types via `import type` from `./notes.js`/`./approval.js`, erased at runtime) and re-exported unchanged by `src/schemas/index.ts`. The two page modules import them from `'../../schemas/version.js'`, never the barrel, and `package.json` `files` gains `"src/schemas/version.ts"` (AC-20260915-03-2, AC-20260916-01-5, AC-20260918-04-7)                                                                                                                                                                                                                                                                                                                                                                                                                                                          | D7 as first written imported the constants from `src/schemas/index.ts`, which the package does not publish (`files` is `dist` + `src/ui`); the installed page's root module answered 500 `Failed to resolve import "../../schemas/index.js"` and rendered blank (reproduced). Shipping the whole barrel would pull zod into the browser graph outside `OPTIMIZE_DEPS_INCLUDE`; importing from `dist/` would read the stale v2 build until release |
| D12 | **User ruling, 2026-09-19.** `tests/cli/approve.test.ts` and `tests/browser/surfaces.test.ts` join the File Plan: their contractVersion 1/2 seeds (and `approve.test.ts`'s `theme` key) move to the current version, the same D2/D4 mechanical move the other test rows carry `[no-ac: seed maintenance; the ACs these files carry are unchanged]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Collision closure missed them; the gate showed the pin as the only cause of their four failures                                                                                                                                                                                                                                                                                                                                                   |
| D13 | **User ruling, 2026-09-19.** This spec's final gate and review legs run with `SPEC_PLUGIN_ROOT` pointed at a path that does not exist, so the `[env: SPEC_PLUGIN_ROOT]` cases (`tests/unit/contract-skew.test.ts`'s two live-template cases, AC-20260918-04-9, AC-20260918-04-10) SKIP under their declared environment gate instead of failing on the plugin's still-v2 template. They are reported skipped, never passed, and become live oracles once `claude-plugins/specs/20260918/01-mock-contract-v3.md` lands `[no-ac: gate environment for the D9 landing window]`                                                                                                                                                                                                                                                                                                                                                                                                  | D9 predicted these reds for the window between the two landings; the build driver admits only a green gate, and landing the plugin first would reverse D9's package-first order                                                                                                                                                                                                                                                                   |

## File Plan

| Path                                 | Action | Layer    | Summary                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/schemas/version.ts               | MODIFY | schemas  | D1: `CONTRACT_VERSION = 3`; D11: defines `EMPTY_NOTES`/`EMPTY_APPROVAL`                                                                                                                                                                                                                                                                                                                |
| src/schemas/notes.ts                 | MODIFY | schemas  | D2: `contractVersion` pins to the single literal; the header comment at `:4-7` saying the version is checked as "known, not equal" becomes equal                                                                                                                                                                                                                                       |
| src/schemas/approval.ts              | MODIFY | schemas  | D2 pin and the same header correction at `:4-8`; D4 `theme` removed                                                                                                                                                                                                                                                                                                                    |
| src/schemas/decisions.ts             | DELETE | schemas  | D3                                                                                                                                                                                                                                                                                                                                                                                     |
| src/schemas/index.ts                 | MODIFY | schemas  | D3: decisions export and `EMPTY_DECISIONS` removed; D4 `EMPTY_APPROVAL` loses `theme`; D11: the two constants are re-exported from `./version.js`                                                                                                                                                                                                                                      |
| src/schemas/patches.ts               | MODIFY | schemas  | D5: the `unapproveScreen` wire member removed                                                                                                                                                                                                                                                                                                                                          |
| src/server/patches.ts                | MODIFY | server   | D5: the `unapproveScreen` CASE removed; the internal helper of the same name stays                                                                                                                                                                                                                                                                                                     |
| src/cli.ts                           | MODIFY | cli      | D3 `--decision` dropped; D6 `waive` joins the dispatcher                                                                                                                                                                                                                                                                                                                               |
| src/cli/answer.ts                    | MODIFY | cli      | D3: the decision read, validation and second write removed                                                                                                                                                                                                                                                                                                                             |
| src/cli/waive.ts                     | CREATE | cli      | D6: the verb, under the design lock, through the reducer                                                                                                                                                                                                                                                                                                                               |
| src/ui/store/store.ts                | MODIFY | ui       | D7: `EMPTY_STATE` uses `EMPTY_NOTES`/`EMPTY_APPROVAL`                                                                                                                                                                                                                                                                                                                                  |
| src/ui/screen/ScreenPage.tsx         | MODIFY | ui       | D7: the inline empty approval becomes `EMPTY_APPROVAL`. `:41` already declares a local `EMPTY_NOTES: UiNote[]` — import only `EMPTY_APPROVAL` here, never the schema's same-named constant                                                                                                                                                                                             |
| src/ui/shell/AppSidebar.tsx          | MODIFY | ui       | D7: same                                                                                                                                                                                                                                                                                                                                                                               |
| package.json                         | MODIFY | other    | D8: `3.0.0`; D11: `files` gains `src/schemas/version.ts`                                                                                                                                                                                                                                                                                                                               |
| src/index.ts                         | MODIFY | other    | D8: `VERSION = '3.0.0'`                                                                                                                                                                                                                                                                                                                                                                |
| README.md                            | MODIFY | other    | D10: install line, verb table, host layout                                                                                                                                                                                                                                                                                                                                             |
| docs/research/plugin-requirements.md | MODIFY | other    | D10: theme and decisions claims corrected                                                                                                                                                                                                                                                                                                                                              |
| src/analysis/look.ts                 | MODIFY | analysis | D4: the `theme` option's doc comment stops naming `approval.theme` — its value now comes from `check.config.theme` (spec 03 D5); no signature change                                                                                                                                                                                                                                   |
| tests/fixtures/contract.json         | MODIFY | tests    | D1/D3: the local copy of the plugin's contract goes to 3 and loses the `decisions` host path and shape — this is the fixture the byte-for-byte schema tests read                                                                                                                                                                                                                       |
| tests/helpers/cli.ts                 | MODIFY | tests    | D3: `DESIGN_STATE_FILES` loses `decisions.json` (and, from spec 01, carries `.lock`)                                                                                                                                                                                                                                                                                                   |
| tests/schemas/schemas.test.ts        | MODIFY | tests    | AC-20260918-04-1, AC-20260918-04-3                                                                                                                                                                                                                                                                                                                                                     |
| tests/unit/design-docs.test.ts       | MODIFY | tests    | AC-20260918-04-2, AC-20260918-04-4, AC-20260918-04-7; every `contractVersion: 3` used as the UNKNOWN mutant becomes `2`, and every `theme` key leaves the documents the test treats as valid — the pin inverts both                                                                                                                                                                    |
| tests/unit/patches.test.ts           | MODIFY | tests    | AC-20260918-04-5                                                                                                                                                                                                                                                                                                                                                                       |
| tests/cli/answer.test.ts             | MODIFY | tests    | AC-20260918-04-3; the two further `--decision` tests at `:111` and `:133` (`AC-20260917-01-5`) are deleted with the flag                                                                                                                                                                                                                                                               |
| tests/cli/waive.test.ts              | CREATE | tests    | AC-20260918-04-6                                                                                                                                                                                                                                                                                                                                                                       |
| tests/unit/plugin-shapes.test.ts     | MODIFY | tests    | AC-20260918-04-8                                                                                                                                                                                                                                                                                                                                                                       |
| tests/package/version.test.ts        | MODIFY | tests    | D8: the major assertion moves from 2 to 3                                                                                                                                                                                                                                                                                                                                              |
| tests/cli/contract.test.ts           | MODIFY | tests    | D1: the byte-exact `contract --json` stdout literal follows `CONTRACT_VERSION`                                                                                                                                                                                                                                                                                                         |
| tests/cli/check.test.ts              | MODIFY | tests    | D1: the `check.contractVersion` assertion follows it                                                                                                                                                                                                                                                                                                                                   |
| tests/cli/files.test.ts              | MODIFY | tests    | D2/D4: the created-document assertions expect `contractVersion: 3` and no `theme` key                                                                                                                                                                                                                                                                                                  |
| tests/cli/sweep.test.ts              | MODIFY | tests    | D2: the version assertion and three v1 seeds move to the current version, or `sweep` now refuses them                                                                                                                                                                                                                                                                                  |
| tests/unit/selectors.test.ts         | MODIFY | tests    | D2/D4: `Approval`-typed fixtures lose `theme` and take the current `contractVersion`, or they fail the literal type                                                                                                                                                                                                                                                                    |
| tests/browser/roundtrip.test.ts      | MODIFY | tests    | D2: BOTH seeds — the v1 at `:162` and the v2 at `:332` — become current, or the page renders the unreadable banner instead of the state the test expects                                                                                                                                                                                                                               |
| tests/browser/hmr.test.ts            | MODIFY | tests    | D2: same seed, same reason                                                                                                                                                                                                                                                                                                                                                             |
| tests/server/hot-update.test.ts      | MODIFY | tests    | D4: the seeded `theme` key makes the approval document unreadable once the field is gone                                                                                                                                                                                                                                                                                               |
| tests/browser/reload.test.ts         | MODIFY | tests    | D4: same                                                                                                                                                                                                                                                                                                                                                                               |
| tests/unit/look.test.ts              | MODIFY | tests    | D4: the approval fixture loses `theme`                                                                                                                                                                                                                                                                                                                                                 |
| tests/unit/contract-skew.test.ts     | MODIFY | tests    | D9: the local-template cases move to 3; the two `[env: SPEC_PLUGIN_ROOT]` live-template cases stay and are expected red until the sibling plugin spec lands                                                                                                                                                                                                                            |
| tests/server/api.test.ts             | MODIFY | tests    | AC-20260918-04-11; D2: the v2 seed moves to the current version, and `AC-20260917-01-12` (`:703`) **inverts** rather than moving — its two migration clauses become 409 byte-identical refusals (a 3→3 migration asserts nothing), and its "a v3 approval.json is refused" clause becomes the valid version, so the refused mutant moves to 4, exactly as M4's design-docs matrix does |
| tests/e2e/driver.test.ts             | MODIFY | tests    | AC-20260918-04-9, AC-20260918-04-10                                                                                                                                                                                                                                                                                                                                                    |
| tests/cli/approve.test.ts            | MODIFY | tests    | D12: v2 seeds and the `theme` key move to the current version                                                                                                                                                                                                                                                                                                                          |
| tests/browser/surfaces.test.ts       | MODIFY | tests    | D12: the two v1 seeds move to the current version                                                                                                                                                                                                                                                                                                                                      |
| tests/package/install.test.ts        | MODIFY | tests    | D11: AC-20260915-03-8's `files` assertion becomes `["dist", "src/ui", "src/schemas/version.ts"]` — the ruling changes that promise, so its oracle moves with it                                                                                                                                                                                                                        |
| tests/helpers/cli.ts                 | MODIFY | tests    | D11: `installPackageInto` copies every `package.json` `files` entry, `dist` from `.test-dist`                                                                                                                                                                                                                                                                                          |

The plugin repo's own edits are **not** in this table and are not this spec's work: they are
`claude-plugins/specs/20260918/01-mock-contract-v3.md`, which lands second (D9).

## Contracts

```ts
// src/schemas/version.ts
export const CONTRACT_VERSION = 3 as const

// src/schemas/notes.ts / approval.ts — was z.union([z.literal(1), z.literal(CONTRACT_VERSION)])
contractVersion: z.literal(CONTRACT_VERSION)

// src/schemas/approval.ts — REMOVED: theme: z.string().nullable().default(null)
// src/schemas/patches.ts — REMOVED member: { op: 'unapproveScreen', name }
// src/schemas/decisions.ts — DELETED

// src/schemas/patches.ts — ADDED member (D6), the operation the verb sends
z.object({
  op: z.literal('waive'),
  id: z.string(),
  reason: z.string().trim().min(1),
  beats: z.string(),
}).strict()

// src/server/patches.ts — the matching case, mirroring clientOk's fresh stamp
// journeys[id] = { ...existing, client: 'waived', reason, beats, at: new Date().toISOString() }
// `approvedAt` is never written; an existing one survives via ...existing.

// src/cli/waive.ts
export function waiveVerb(
  cwd: string,
  flags: { journey?: string; reason?: string; beats?: string },
): Promise<string>
```

The plugin template (`spec/templates/mock/contract.json` → 3, `verbs` + `approve`/`waive`, `host`
and `shapes` minus `decisions`) is the sibling spec's contract, restated here only so a reader knows
what the other half must say.

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
- **AC-20260918-04-11**: WHEN a client-role request posts `{op:'waive', id:'first-visit', reason:'x',
beats:'h'}` THE SYSTEM SHALL answer 403 and leave `design/approval.json` byte-identical, the
  approval allow-list admitting only `clientOk`. This EXTENDS that test: every existing clause in it
  — `remove`, `update` and `approveScreen` refused, `add` and `clientOk` accepted — must survive, or
  spec 03's AC-20260918-03-7 silently loses its oracle
  → rewrites tests/server/api.test.ts :: AC-20260915-02-10
- **AC-20260918-04-6**: WHEN `mock-review waive --journey first-visit --reason 'client unreachable'
--beats <hash>` runs THE SYSTEM SHALL write `approval.journeys['first-visit']` carrying the reason
  and the beats hash, and exit 0 → writes tests/cli/waive.test.ts
- **AC-20260918-04-7**: WHEN the page falls back to an empty design document THE SYSTEM SHALL use
  the shared constants — `EMPTY_STATE.notes` deep-equals `EMPTY_NOTES` and `EMPTY_STATE.approval`
  deep-equals `EMPTY_APPROVAL`, and no module under `src/` declares an inline `contractVersion`
  literal (the same grep-guard shape `tests/unit/design-docs.test.ts` already uses for its
  single-reader rule; four hits pre-image). The compiler catches this first — `1 as const` is not
  assignable to `z.literal(3)` — and the test is what keeps it caught at the next bump
  → writes tests/unit/design-docs.test.ts
- **AC-20260918-04-8**: WHEN the plugin's own default documents are parsed THE SYSTEM SHALL accept
  them, the copies in this test having been updated to contract 3
  → rewrites tests/unit/plugin-shapes.test.ts :: defaultApproval
- **AC-20260918-04-9** `[env: SPEC_PLUGIN_ROOT]`: WHEN the plugin's real `mocks-driver.js` runs
  against the fixture host with the built binary AND the sibling plugin spec has landed THE SYSTEM
  SHALL complete without a contract-skew refusal, both repos reporting 3
  → rewrites tests/e2e/driver.test.ts :: AC-20260915-01-23:
- **AC-20260918-04-10** `[env: SPEC_PLUGIN_ROOT]`: WHEN the driver's `client waive` path runs THE
  SYSTEM SHALL leave a `design/approval.json` bearing the package's own fingerprint rather than the
  driver's — compact `JSON.stringify` with no `\n  ` indentation (the driver wrote
  `JSON.stringify(obj, null, 2) + '\n'`), parsing under `ApprovalSchema`, and carrying
  `contractVersion: 3`. The bytes are the observable; who wrote them is an inference from the bytes
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

**Build record (2026-09-19, folded from the deviations sidecar).** Gate round 1 found that D7 as
first written left the installed reviewer page blank: the page value-imported the empty documents
from `src/schemas/index.ts`, which the package does not publish. The user ruled D11 (the constants
move to the zod-free `src/schemas/version.ts`, which alone joins `files`), on a Fable 5 second
opinion that reproduced the 500. `installPackageInto` now follows `package.json` `files` rather
than a hard-coded list, so the installed-layout tests see exactly what npm would ship. The same
round found two test files outside the File Plan still seeding contract 1/2 documents (D12), and
round 2 moved AC-20260915-03-8's `files` oracle with D11. D13 ran the gate with the plugin's
live-template cases skipped under their declared environment gate for the D9 landing window. The
`src/ui/screen/ScreenPage.tsx` row needed no change (its `:57` pointer was stale; the pre-image
had no inline empty approval). D10's README install line is the published registry form
`npm i -D @555-ventures/mock-review@3`, the one the plugin's own install remedy prints, not the
retired `github:…#v3` tag form.

## Canonical Delta

`docs/canonical/package.md` — the contract section becomes: the package's major version is the
contract version, and both are 3. A design document is valid at exactly one contract version;
anything older is reported unreadable with the hand-fix remedy, and the migration path is to re-run
the design stage. `design/decisions.json` and the `answer --decision` flag are retired, as is
`approval.theme` — the theme is whatever `mock.config.ts` declares. The verb table gains `approve`
and `waive`; with `waive` in place, the package is the only program that writes a design document,
and every such write goes through the design lock.
