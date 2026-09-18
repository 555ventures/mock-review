---
date: 2026-09-18
status: hardened
tier: critical
area: cli
design: false
breaking: false
depends_on: [specs/20260918/02-one-reply-and-the-page-ends-a-note.md]
depended_on_by: [specs/20260918/04-contract-v3.md]
brief: n/a
spiked: 2026-09-18
open_markers: 0
---

# The page has no operator controls

## Goal

The reviewer page still offers two controls for a role the pipeline abolished. ADR-0029 rules that
a screen-approve control and a theme picker "are not built into the mock stage at all" and that
whoever runs `/spec:mocks` never touches the page, yet `NotesPanel` renders Approve-screen and
`TopBar` renders a theme Select. Meanwhile the design stage still needs the per-screen approval
record: it compares `approval.screens[<name>].hash` against `check --json`'s hash as its drift
oracle. This spec keeps the record and moves its writer — from a button nobody is supposed to press
to `mock-review approve --screen <name>`, run by the session on the user's explicit approval — and
retires the theme pick in favour of the theme the host's own config already declares. Done means the
page has no operator-only control left, the approval record is written by exactly one command, and
nothing about the two documents' shape changes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A new verb, `mock-review approve --screen <name>`, in `src/cli/approve.ts` and dispatched from `src/cli.ts:18`. It runs `ensureDesignFiles`, then `runCheck(cwd)`, then applies `{op:'approveScreen', name}` through the existing `applyApprovalPatch` under spec 01's `withDesignLock`, so the entry it writes is byte-for-byte what the page button wrote. Not a JSON verb: one line on stdout, `approved <name> <hash>` (AC-20260918-03-1, AC-20260918-03-2) | The record the design stage reads must not change shape just because its writer moved, and the `hash` must be the same `screenReport` hash `check --json` prints or the drift comparison at `stage-design.md:45-46` silently never matches. Reusing the reducer is what guarantees both |
| D2 | `approve --screen` refuses, exit 2, on three conditions, checked in this order: `check.ok === false`, naming the first error finding — FIRST, because a check that fails before discovery lists no screens and would otherwise report every real name as unknown; then an unknown screen name (`mock-review: unknown screen <name>`); and **any note with status `open` anchored to that screen** (`mock-review: <name> has N open note(s) — answer or close them first`). That third check reads `design/notes.json`, so it runs INSIDE spec 01's lock together with the approval read and write — checking it outside would let a client add a note between the check and the write and produce exactly the record this refusal exists to prevent. An unreadable `notes.json` or `approval.json` refuses with the shared `UnparseableDesignFileError` sentence, mirroring `sweep` and `answer`. Nothing is written on any refusal (AC-20260918-03-3) | The user chose to refuse rather than allow. It mirrors the rule the page button already enforced, so sign-off means the same thing whichever way it is reached; and approving a screen that does not render, or that has an unanswered question on it, is a record that was never true |
| D3 | `screenshotsFor` moves from `src/server/plugin.ts:165` into a new `src/files/screenshots.ts` and is imported by both the server and the new verb. No behaviour change (AC-20260918-03-2) `[no-ac: pure move; AC-20260918-03-2 fails if the verb and the page disagree about the field]` | The approval entry carries a `screenshots` array. A second implementation in the CLI is exactly how the two writers would drift apart on the one field a spec cannot easily see |
| D4 | The page loses the screen-approve control: `StatusLine` (`src/ui/notes/notes-ui.tsx:39-85`) is deleted outright — `NotesPanel.tsx:51` is its only importer — and `NotesPanel`'s header collapses to the group heading and count. `useNoteActions.approveScreen` is deleted. `op:'approveScreen'` **stays** on the wire, owner-only, as the reducer's operation; only the page stops sending it (AC-20260918-03-4) | The wire op is what the new verb's reducer call uses, so removing it would mean reimplementing the write. What ADR-0029 abolishes is the control, not the operation |
| D5 | The theme pick is retired: `op:'theme'` leaves `NotesPatch`'s approval union and `applyApprovalPatch`, `useNoteActions.pickTheme` is deleted, and `TopBar`'s theme `Select` and its three props (`:54-56` destructuring, `:74-76` types) and its three props go. Every reader moves to the host's declared theme: `src/cli/check.ts:16` `themeFor` returns `check.config.theme`, `ScreenPage` passes `config.theme` to the frames, and `ComponentsPage.tsx:42` reads `data?.config.theme`. `approval.theme` stays in the read-back schema until the version flip (AC-20260918-03-5, AC-20260918-03-6) | The plugin has never read `approval.theme` — `mocks-driver.js` reads `check.config.theme` at both its THEME sites — so the page pick was writing a field with no consumer while the captures it should have matched followed a different source. One source of truth, and it is the one the driver already uses |
| D6 | `docs/design/design-reference.md` gains one Amendments entry naming both removed controls and the reason (ADR-0029), and `docs/canonical/package.md` gains the new verb `[no-ac: documentation of decisions covered by AC-20260918-03-4 and AC-20260918-03-5]` | The reference is binding and frozen; a control disappearing is exactly the kind of deviation it exists to record |
| D7 | This spec is **13 source rows, one over the decomposition cap, and is deliberately not split**. Splitting the theme retirement from the approve retirement would re-touch `src/schemas/patches.ts`, `src/ui/notes/useNoteActions.ts` and `src/ui/screen/ScreenPage.tsx` in both halves for no landing benefit `[no-ac: decomposition judgment with no runtime surface]` | The cap exists to stop a spec spanning two primary areas; both halves here are one rationale — the operator works from files and the CLI — and neither leaves the system green without the other's page edits |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/files/screenshots.ts | CREATE | schemas | D3: `screenshotsFor(cwd, name)` moved verbatim from `plugin.ts:165-173` |
| src/schemas/patches.ts | MODIFY | schemas | D5: the `theme` member leaves `ApprovalPatchSchema` |
| src/server/patches.ts | MODIFY | server | D5: the `theme` case leaves `applyApprovalPatch` |
| src/server/plugin.ts | MODIFY | server | D3: `screenshotsFor` imported from the file layer instead of defined locally |
| src/cli/approve.ts | CREATE | cli | D1/D2: the verb, its three refusals, and the reducer call under the design lock |
| src/cli.ts | MODIFY | cli | D1: `approve` joins the dispatcher with a dynamic import |
| src/cli/check.ts | MODIFY | cli | D5: `themeFor` returns `check.config.theme`; its deliberate `undefined` fallback preserved |
| src/ui/notes/notes-ui.tsx | MODIFY | ui | D4: `StatusLine` deleted |
| src/ui/notes/NotesPanel.tsx | MODIFY | ui | D4: header collapses; `StatusLine` import dropped |
| src/ui/notes/useNoteActions.ts | MODIFY | ui | D4/D5: `approveScreen` and `pickTheme` deleted |
| src/ui/screen/ScreenPage.tsx | MODIFY | ui | D4/D5: approve-screen and theme wiring dropped; frames take `config.theme`; the now-unused `sTone` (`:262`) and `themes` (`:59`) locals go with them, or lint fails |
| src/ui/shell/TopBar.tsx | MODIFY | ui | D5: the theme `Select` and its `themes`/`currentTheme`/`onThemeChange` props deleted |
| src/ui/catalog/ComponentsPage.tsx | MODIFY | ui | D5: `theme` reads `data?.config.theme` |
| docs/design/design-reference.md | MODIFY | other | D6: Amendments entry for the two removed controls |
| tests/cli/approve.test.ts | CREATE | tests | AC-20260918-03-1, AC-20260918-03-2, AC-20260918-03-3 |
| tests/server/api.test.ts | MODIFY | tests | AC-20260918-03-6; also the three other tests that POST `op:'theme'` as an unrelated step (`AC-20260917-02-11`, the review-pass-3 unparseable case, and `AC-20260917-01-12`'s migration pair) switch to a surviving op |
| tests/browser/surfaces.test.ts | MODIFY | tests | AC-20260918-03-4, AC-20260918-03-5 |
| tests/browser/roundtrip.test.ts | MODIFY | tests | D4: two `getByRole('button', { name: 'Approve screen' })` clicks lose their target — the screen is approved through the verb instead |
| tests/e2e/approved.test.ts | MODIFY | tests | D4/D5: the Approve-screen click and the theme-Select click both lose their control; the approval half moves to the verb, the theme half to `mock.config.ts` |
| tests/unit/design-reference.test.ts | MODIFY | tests | D6: the newest-first assertion (`:17-26`) pins the top Amendments entry's date, so any 2026-09-18 entry reddens it — spec 02 touches the same line for the same reason; whichever lands first makes the edit |
| tests/unit/patches.test.ts | MODIFY | tests | D5: the `theme` reducer case test is deleted — a compile fix, the op leaving the union |
| tests/unit/design-docs.test.ts | MODIFY | tests | D5: the mutant probe that POSTs `op:'theme'` switches to a surviving op |
| tests/server/hot-update.test.ts | MODIFY | tests | D5: seeds the theme through the scratch host's `mock.config.ts` instead of `approval.json`, or the frame stops importing `nova.css` and the HMR measurement goes hollow |
| tests/browser/reload.test.ts | MODIFY | tests | D5: same reseeding, same reason |
| tests/unit/look.test.ts | MODIFY | tests | D5: `themeFor`'s source changes, so the capture's `_theme` fixture moves to `config.theme` |

## Contracts

```ts
// src/files/screenshots.ts — moved, unchanged
export function screenshotsFor(cwd: string, name: string): string[]

// src/cli/approve.ts
/** `mock-review approve --screen <name>`. Not a JSON verb: one line on stdout, diagnostics on
 * stderr as `mock-review: <reason>`, exit 0 or 2. Writes design/approval.json under the design
 * lock, through applyApprovalPatch, so its entry is identical to the one the page button wrote. */
export function approveVerb(cwd: string, flags: { screen?: string }): Promise<string>

// src/schemas/patches.ts — REMOVED member
// z.object({ op: z.literal('theme'), key: z.string() }).strict()
```

The `approval.screens[<name>]` entry shape is unchanged:
`{ hash, approvedAt, states, viewports, schemes, screenshots }`.

## UI

**Notes panel header.** The Approve-screen control and the screen's status line are gone. The
header keeps the group heading (`THIS SCREEN`, `PROJECT`), its count and the `+ Note` button.

**Top bar.** The theme `Select` is gone. A host with themes still renders them — the frame follows
`mock.config.ts`'s `theme` — but the page offers no way to change it.

**Everything else is untouched.** Device toggles, Notes toggle, Mark an area, the journey
breadcrumb, note pins, dialogs and the client role's page are all unchanged by this spec.

## Data Model

No shape change. `approval.theme` is still read and still tolerated by `ApprovalSchema`; it simply
stops being written by anything and stops being read by the page. Existing hosts keep whatever value
they have; the field is removed in the version flip that follows this spec.

## Behavior

**Approving a screen** now happens in one place: the session runs `mock-review approve --screen
<name>` after the user replies `approve` at a look stop. The verb re-derives the screen's hash from
a fresh `check`, so an approval can never record a hash for bytes nobody looked at.

**The three refusals** exist so the record cannot lie: an unknown name is a typo, a failing check
means the screen does not render, and an open note means somebody is still waiting for an answer
about that screen. Each prints one sentence and writes nothing.

**Theme** is whatever `mock.config.ts` declares. Screenshot capture, the reviewer frames and the
components catalog all read that one value, so a capture and the page can no longer disagree.

## Acceptance Criteria

- **AC-20260918-03-1**: WHEN `mock-review approve --screen home` runs against a host whose `home`
  screen renders cleanly THE SYSTEM SHALL exit 0, print `approved home <hash>`, and write
  `approval.screens.home` with all six fields → writes tests/cli/approve.test.ts
- **AC-20260918-03-2**: WHEN the verb approves a screen THE SYSTEM SHALL write the same `hash` that
  `mock-review check --json` reports for that screen in the same host state (verb's `hash` ===
  `check.screens[name].hash`), and the same `screenshots` array the server's own context builds
  → writes tests/cli/approve.test.ts
- **AC-20260918-03-3**: WHEN the named screen is unknown, or `check.ok` is false, or the screen has
  at least one `open` note THE SYSTEM SHALL exit 2 with the matching sentence and leave
  `design/approval.json` byte-identical (`approve --screen nope` → `mock-review: unknown screen
  nope`; a screen with one open note → `mock-review: home has 1 open note(s) — answer or close them
  first`) → writes tests/cli/approve.test.ts
- **AC-20260918-03-4**: WHEN the owner opens a screen in the reviewer page THE SYSTEM SHALL render
  no control that approves a screen (no button whose name matches `/Approve screen/i`, and no
  status line above the notes list) → writes tests/browser/surfaces.test.ts
- **AC-20260918-03-5**: WHEN the owner opens a host that declares themes THE SYSTEM SHALL render no
  theme selector, and the mock frame SHALL request the stylesheet named by `mock.config.ts`. The
  fixture ships `theme: null` (`tests/fixtures/host/mock.config.ts:11`) and `src/themes/nova.css`
  exists, so the test edits the scratch host's config to `theme: 'nova'` **before** `startServe` —
  anchored on the parsed value, never on source text (pipeline rules § Gotchas) — and asserts the
  frame requests `nova.css`
  → rewrites tests/browser/surfaces.test.ts :: AC-20260915-03-10
- **AC-20260918-03-6**: WHEN any request posts `{op:'theme', key:'nova'}` THE SYSTEM SHALL answer
  400 and leave `design/approval.json` byte-identical, the op no longer being a member of the
  approval patch union → rewrites tests/server/api.test.ts :: AC-20260917-02-11:
- **AC-20260918-03-7**: WHEN a client-role request posts `{op:'approveScreen', name:'home'}` THE
  SYSTEM SHALL CONTINUE TO answer 403 and leave `design/approval.json` byte-identical
  → reuses tests/server/api.test.ts :: AC-20260915-02-10

## Assumptions (escalation triggers)

- **A1** — `mocks-driver.js` reads the theme from `check.config.theme` at both its THEME sites and
  never reads `approval.theme`; a plugin-wide grep for `approval.theme` finds nothing. Verified by
  reading; **not executed**. — **if false:** the theme retirement moves into the version-flip spec
  where the plugin is already being edited, and D5 shrinks to the page half.
- **A2** — `runCheck(cwd)` is safe to run beside a live `serve`, because every one-shot verb already
  gets its own `cacheDir` (pipeline rules § Gotchas, D20/D22). The driver runs `check` constantly
  against hosts with a server up. — **if false:** the verb must refuse while `design/.serve.json`
  pings, and the session runs it after stopping `serve`.
- **A3** — `applyApprovalPatch`'s `approveScreen` case needs only `hash`, `config`, `statesOf` and
  `screenshotsFor` from its context — `beatsHash` is used by `clientOk` alone — so the verb can
  supply `beatsHash: () => null`. Verified by reading `src/server/patches.ts`. — **if false:** the
  verb must build a full context and the move in D3 widens.
- **A4** — Executed 2026-09-18, zod 4.6.5: removing a member from a `discriminatedUnion` makes that
  `op` fail `safeParse`, which the route layer already turns into 400. — **if false:** the removed
  op would be accepted and silently ignored; STOP.
- **A5** — `StatusLine` has exactly one importer (`NotesPanel.tsx:10`). Verified by grep. — **if
  false:** every other importer joins the File Plan before the deletion.

## Rationale

The contradiction this spec resolves is between two pipeline stages, not inside one. The mocks stage
says the operator never touches the page; the design stage and `/spec:sketch` say approval is set
"only on the served page". Both cannot be true, and the package has been shipping the control the
first one abolished. Moving the writer rather than deleting the record is what satisfies both: the
design stage keeps the per-screen hash it needs as a drift oracle, and the page keeps no control the
doctrine says should not exist.

A journey-level hash cannot carry that oracle, which is why the record stays per-screen. The
journey's `beats` hash covers the story's sentences, not the screens' bytes, so a screen edited after
a client confirmed the journey would change nothing in it — and pinning screen hashes at confirm
time would leave every off-journey screen ungated and void a whole journey's confirmation on a
one-line copy edit.

The theme retirement is the smaller half and the more clearly correct one: the field the page wrote
has never had a reader. What makes it worth doing here rather than later is that the page and the
screenshot capture currently follow different sources for the same question, so a capture can
disagree with what the reviewer saw — a quiet wrongness in exactly the artifact a spec cites as
evidence.

The verb's third refusal — an open note blocks approval — is the user's ruling, taken with the
alternative on screen. Allowing it would have been defensible, since rule 6 wipes the approval the
moment a note is added; the decision was that a sign-off which can be undone seconds later is not
worth recording.

Collision closure was re-run after review against `StatusLine`, `pickTheme`, `Approve screen` and
`op: 'theme'`, and the first draft's claim — that the surviving `approveScreen` hits were only the
wire op and its server tests — was **wrong**: two browser tests and one end-to-end test click the
button by name, and a design-reference consistency test asserts the control is described. Nine test
files are now File Plan rows and **fixed, not waived**. What genuinely survives untouched is the
`approveScreen` wire op itself and the server tests that exercise it directly, which D4 keeps on
purpose because the new verb's reducer call uses it.

## Canonical Delta

`docs/canonical/package.md` — the verbs table gains `approve`: `mock-review approve --screen <name>`
re-derives the screen's hash from a fresh `check` and records it in `design/approval.json`, refusing
when the screen is unknown, when the host does not render cleanly, or when the screen still carries
an open note. It is the only writer of `approval.screens`. The reviewer page no longer offers a
screen-approve control or a theme picker: the operator works from files and the CLI, and the theme
is whatever `mock.config.ts` declares — the one value the screenshot capture, the reviewer frames and
the components catalog all read.
