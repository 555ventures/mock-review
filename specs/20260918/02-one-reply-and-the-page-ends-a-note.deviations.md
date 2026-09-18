# Deviations — 02-one-reply-and-the-page-ends-a-note

- `tests/browser/surfaces.test.ts`'s pre-existing `AC-20260917-02-20 (escape)` test ("a write the
  server refuses shows one notice instead of failing silently") briefly failed under my build,
  because it was pinned to the exact bug this spec's Goal removes: it had a client reopen a note
  they raised and Reply, asserting the server answers 403 (`op:'update'` used to be unconditionally
  refused for a client, and the pre-image's reply UI sent `update`). Under D1/D2 a client's reply is
  now `op:'reply'`, which the server correctly admits (200), so that specific path through the page
  no longer refuses. Resolved concurrently by the test-owner worker: the test was rewritten to seed
  an outdated-anchor note directly and drive it through **Re-anchor** instead, which still
  legitimately sends `op:'update'` (unconditionally refused for a client role by
  `clientNotesOpPatch`, `src/server/plugin.ts`) — see the test's own updated comment. Confirmed
  green after the rewrite; `src/ui`'s reply path was never the bug (`useNoteActions.ts` correctly
  sends `op:'reply'`).

- Gate repair (post-build): rewrote `tests/browser/surfaces.test.ts`'s `AC-20260917-02-20 (escape)`
  test in place, keeping its title/AC-ID and its intent (a refused write surfaces exactly one
  `[data-notice]`, never a silent failure, never the D24 dead-link notice). Replaced the refusal
  source: instead of a client Reply (now admitted, 200, per the bullet above), it seeds a note
  whose anchor `snippet` no longer matches WalletSummary's rendered text (reference rule 12), opens
  it via its panel row (`button[data-row]` — an outdated note draws no pin, so the pin locator the
  old test used no longer finds it), and drags a new anchor over WalletSummary through
  Re-anchor. `op:'update'` is still unconditionally refused for a client role
  (`clientNotesOpPatch` in `src/server/plugin.ts` returns `null` for it regardless of ownership),
  so this is a genuine server 403 the page can still trigger — no `page.route` mocking needed.
  Verified: `npm run build` clean, `npx vitest run tests/browser/surfaces.test.ts
  tests/browser/roundtrip.test.ts` — 25 passed, 2 loud-skip guards, 0 failed.
- The `other` layer's one row (`docs/design/design-reference.md`, D10) was authored by the ui-wave
  worker alongside the UI it documents, not in a separate `other` wave; the `other` wave landed no
  further edits.
