---
name: project-frame-preamble-defect
description: (RESOLVED by D18d, server worker) src/server/plugin.ts's frameHtml() was missing the @vitejs/plugin-react dev preamble, breaking every browser test that renders inside the mock iframe
metadata:
  type: project
---

**Resolved 2026-09-15 per D18d** — the server worker's `frameHtml()` now runs the HTML through
`server.transformIndexHtml()`, which injects the preamble. `tests/server/api.test.ts`'s frame-
content case and 13/16 browser tests pass as of this fix. Kept below for the original diagnosis.


`src/server/plugin.ts`'s `frameHtml()` (server layer, spec 02 D8/D17) emits only
`<script type="module" src="/@fs/<entry.tsx>">` with no React-refresh preamble. The host's own
`vite.config.ts` uses `@vitejs/plugin-react`, and in this installed version its dev-mode transform
requires the preamble script (`import RefreshRuntime from "/@react-refresh"; ...
window.__vite_plugin_react_preamble_installed__ = true`) to run before any JSX-transformed module
loads in the *document*, or it throws `@vitejs/plugin-react can't detect preamble. Something is
wrong.` — a hard, render-blocking error that surfaces to React as `Maximum update depth exceeded`
(the mount loop retries forever).

**Why this matters:** confirmed by direct reproduction (2026-09-15, spec 02 build) — the frame's
`#root` never renders anything (`GET /?frame=1#/home?state=Default` never shows `[data-component]`
elements), independent of any `src/ui/**` code. This blocks AC-20260915-02-13 and every browser
test that depends on mock content rendering inside the iframe (roundtrip AC-18/19/20 — drawing a
note, the theme stylesheet check). The `src/ui/**` code that depends on this (note anchoring,
journey guide, `--look` screenshots) is implemented and unit-tested but cannot be verified
end-to-end until this is fixed.

**How to apply:** the fix is one snippet prepended to `frameHtml()`'s `<head>`, before the entry
`<script>` tag:
```html
<script type="module">
  import RefreshRuntime from "/@react-refresh"
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true
</script>
```
This lives in `src/server/plugin.ts`, a different File Plan layer than `src/ui/**` — do not fix it
from a `reviewer-ui` dispatch; hand it to whichever wave owns `src/server/**`, or flag it for the
spec's review stage.
