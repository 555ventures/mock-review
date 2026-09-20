# Deviations — 01-pins-are-their-own-switch

- AC-20260919-01-5's prose cites "59 scanned files"; D4's own rationale (Executed 2026-09-19)
  states 60 (`src/ui/**/*.{ts,tsx}` minus `store.ts`), and a direct `find` over the current tree
  also counts 60. `tests/unit/store.test.ts`'s scan test does not hard-code either number — it only
  asserts `files.length > 0` (a vacuous-glob guard) plus the real SHALL clause (zero regex hits),
  matching D14's own stated reason for never baking a soon-stale count into a test.
- `tests/unit/store.test.ts` imports `initialUi` directly from `src/ui/store/store.ts`
  (`import { createStore, enterMarking, initialUi } from '../../src/ui/store/store.js'`), but D1's
  Contract block shows only `enterMarking` gaining the `export` keyword — `initialUi` was
  module-private before this spec. Exported `initialUi` (no behavior change, same body) to satisfy
  the test import; tests/** is out of my batch so the import could not be changed instead.
- D9's scroll-to-row effect (`ScreenPage.tsx`) is specified as three literal edits with no mention
  of timing. Applying exactly those three verbatim still failed AC-20260919-01-11 by ~240px
  (`rowBox.y + rowBox.height` overshot the scroll container's bottom edge) — confirmed by an ad hoc
  debug script (chromium, same fixture/seed as the AC) that `[data-notes-scroll]`'s enclosing
  `ResizablePanel` (`react-resizable-panels`) reports `clientHeight: 655` (near full-list height) at
  the moment the effect's synchronous `getBoundingClientRect()` runs on remount, settling to its
  real `402` only after a `ResizeObserver` callback fires a frame later — a race D9's fix newly
  makes reachable (it's the first case where this effect fires on the exact render a fresh
  `[data-notes-scroll]` mounts). Added a double-`requestAnimationFrame` around the existing
  measure-and-scroll body (same coalescing idiom already used by `DeviceFrames.tsx`'s `bump`, rule
  17) so the measurement runs after the panel's own resize settles; the three literal edits (marker
  clear moved below the guard, `notesPanel` in the deps array, unconditional marker write in
  `select`) are unchanged. Re-verified with the same debug script: `scrollTop` lands at the correct
  clamped maximum and the row sits fully inside the container.
- AC-20260919-01-12's test (`tests/browser/surfaces.test.ts:591-594`) reads `page.getByRole('button',
  { name: 'Pins' })` and expects `count() > 0` while the Command Palette's `CommandDialog` (a modal
  Radix `Dialog`, `modal` defaults `true`) is still open — before `toggleItem.click()`. Verified via
  an ad hoc debug script that this codebase's own documented gotcha applies here exactly as
  everywhere else (AC-20260915-02-19: an open modal Radix dialog's `hideOthers` marks the entire app
  root `aria-hidden="true"`, confirmed on the live DOM — the Pins button is present with its text but
  `closestAriaHidden: true`), so `getByRole` can never find it while the palette stays open, in any
  implementation that keeps the palette a stock modal `Dialog` (D11 says nothing about `modal`, and
  `components/ui/dialog.tsx`/`command.tsx` are outside my batch regardless). Every other place in
  this same test file that needs an element behind an open palette either scopes the query to
  `palette.getByRole(...)` or closes the dialog first (e.g. AC-20260915-02-2's own group-heading
  check, `:222-225`), matching the gotcha's own prescription. `src/ui/shell/CommandPalette.tsx` and
  `src/ui/shell/TopBar.tsx` implement D10/D11 verbatim and the Pins toggle is independently
  confirmed working (5 of the 7 `AC-20260919` browser tests, including two others that query
  `getByRole('button', { name: 'Pins' })` outside any open dialog, pass). This one assertion's
  ordering — checking `pinsToggle` while `palette` is still open — looks like a test defect to me
  (the `aria-pressed` check for the SAME element after `toggleItem.click()` already reads it
  post-close, at `:597`, so the natural fix is moving the `pinsToggle` existence/pressed checks
  either before `Control+k` or after the palette closes). I did not edit the test — tests/** is out
  of my batch. This is the one AC-20260919 browser test still red after my changes; everything else
  under `tests/unit` and `tests/browser/surfaces.test.ts` (24/25 non-skipped) is green.
- Test-owner repair (post-handback): applied the reordering the implementer diagnosed above —
  `tests/browser/surfaces.test.ts` AC-20260919-01-12 now reads the `pinsToggle` baseline
  (`count() > 0`, `aria-pressed === 'true'`) BEFORE `Control+k` opens the palette, then opens the
  palette, asserts the `Toggle pins` option exists, clicks it, and asserts the flip to `'false'`
  after the dialog closes (unchanged from before). Also fixed a real `tsc --noEmit` error in
  `tests/unit/design-reference.test.ts` (`TS18048: 'a' is possibly 'undefined'` on the
  newest-Amendments-date `reduce`) by filtering `headingDates` to `string[]` with a type predicate
  before reducing, instead of the `?? ''` fallback that was defeating the initial-value type
  inference — no change to the assertion's meaning.
- AC-20260919-01-13 bans the literal `showNotes` doc-wide, but the spec's own paste-ready §2 prose
  (D13/UI section) names it twice — the two clauses cannot both hold. Kept the AC and its literal
  test unchanged and reworded the four amendment markers instead, citing the prototype's boolean by
  line (`ReviewLayer.tsx:512-515`, `:524`) rather than by name. Precedent checked: the same test
  already bans three other literals doc-wide and the 2026-09-17/18 Amendments entries were written
  around that ban, so a history entry that avoids the banned string is this document's established
  convention, not a new constraint. Second-opinion consult (Fable) concurred and supplied the
  wording.
