---
name: project-remaining-test-findings
description: two locked browser tests (roundtrip AC-18, AC-19) have data/assumption mismatches independent of src/ui/** correctness, found while chasing D18 rulings
metadata:
  type: project
---

After D18a/b/d landed (2026-09-15), `tests/browser/roundtrip.test.ts`'s AC-18 and AC-19 still fail;
both reproduced as test-data/assumption issues, not `src/ui/**` defects:

- **AC-18** computes the drag start/end position as `frameBox.x + walletBox.x` where `frameBox` is
  `page.locator('iframe').boundingBox()` (the ON-SCREEN, CSS-transform-scaled box) and `walletBox`
  is `el.contentDocument.querySelector(...).getBoundingClientRect()` (the IFRAME-NATIVE, unscaled
  box). Mixing them is only correct when `scale === 1`. With Chromium's default 1280×720 viewport
  and the pinned layout (256px left sidebar + 320px right notes panel + ~64px workspace padding),
  a 1280px-wide desktop device can never render at `scale === 1`, so this math always lands on the
  wrong element — confirmed by widening the test's viewport to 1920×1200 (`scale` then measures
  close to 1) and observing the saved note's `component` become the correct `WalletSummary` instead
  of the outer `ConsoleShell`. `anchorFor`/the drag pointer math in `DeviceFrames.tsx` are correct
  (they convert screen deltas through `wrapRef`'s own scaled bounding rect); it's the *test's*
  bounding-box arithmetic across the iframe boundary that assumes no scaling.
- **AC-19** pre-seeds `design/notes.json` with `{component: 'WalletSummary', snippet: 'Balance', ...}`
  before the page ever loads. The fixture's real `WalletSummary` renders `"{currency} {balance}"` →
  `"USD 128.50"` — the substring `"Balance"` never appears in its `innerText`. Reference rule 12
  ("an outdated note draws no box") plus this repo's `anchorEl` (`src/ui/notes/anchor.ts`) treats
  that as a genuinely outdated note and correctly renders no pin — confirmed by removing the
  `snippet` mismatch causes the pin to render immediately. This is the seeded fixture's data, not
  behavior `src/ui/**` controls.
- A third finding, **AC-15**'s theme-stylesheet check, is real but timing-sensitive: after picking
  a theme the iframe does a genuine full reload (unavoidable — the frame entry only reads
  `approval.theme` once at script load, D18e), which in this sandboxed environment takes roughly
  900ms–1.5s (`server.transformIndexHtml` + `/@fs` transpile + a `fetch` round trip) before the new
  `<link>` appears. `expect.poll`'s default window is sometimes too tight for that under load;
  reproduced consistently succeeding within ~1s standalone (isolated script, no other tests
  competing for CPU) but consistently failing inside the full suite run. Not something
  `src/ui/**` can shorten further without breaking D18e's mechanism (theme must be read fresh on
  reload, not injected inline).

**How to apply:** if asked to make these three green, the fix belongs in the test files
(`tests/browser/roundtrip.test.ts`'s coordinate math and seeded snippet; `surfaces.test.ts`'s poll
window for the theme-stylesheet check), not in `src/ui/**`. Do not "fix" this by changing
`DeviceFrames.tsx`'s scale math to always render `scale===1` — that would break D9's actual
multi-viewport fit-to-width requirement for every other surface.
