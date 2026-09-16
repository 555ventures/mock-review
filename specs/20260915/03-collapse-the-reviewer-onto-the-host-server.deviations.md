# Deviations — 03-collapse-the-reviewer-onto-the-host-server

- `tests/setup.ts`'s D6 change (dropping `pageDir`/`frameDir`/`frameEntryPath`/`pageBuildIsStale`/
  `buildPageAndFrame`) was authored at TESTS, then reverted to the pre-image before red-check and
  re-applied in the implementation wave. Reason: removing the page build makes the pre-image's
  `serve` answer the 503 fallback, which turns AC-5/-9/-10/-11's `SHALL CONTINUE TO` pins red on
  a tree that has not changed — red-check reported three `broken-pin` HARD findings whose cause
  was the ordering, not the pins. This is the mirror of the documented red-check gotcha ("a config
  edit a test author needs must be reverted before red-check and re-applied in a wave", D16 of
  specs/20260915/01). The intended post-wave content was preserved verbatim and re-applied
  unchanged; no assertion or Decision was altered.
- `tests/server/api.test.ts`'s AC-20260915-03-1 assertion `expect(scriptMatches).toHaveLength(1)`
  (matching `<script[^>]+type="module"[^>]+src="([^"]+)"` against the full `GET /` body) cannot
  pass against real `server.transformIndexHtml` output with `apply: 'serve'`'s `config()` merged:
  Vite's own built-in `devHtmlHook` unconditionally injects `<script type="module" src="/@vite/client">`
  at `head-prepend` (`node_modules/vite/dist/node/chunks/node.js`, the `CLIENT_PUBLIC_PATH` tag
  object) on every dev HTML page it transforms, alongside `@vitejs/plugin-react`'s inline (no-`src`)
  refresh-preamble script. Verified by starting `serve` on a scratch copy of the fixture host and
  curling `GET /` directly: the body contains exactly two `type="module" ... src="…"` tags — Vite's
  own `/@vite/client` and this plugin's `/@id/__x00__mock-review:entry` — never one, and the AC's
  own next clause ("contains `/@vite/client`") is unsatisfiable at the same time as
  `toHaveLength(1)` for that reason, not from a plugin.ts defect. `src/server/plugin.ts` implements
  D1 exactly (one script tag written into `ENTRY_HTML`, passed through `transformIndexHtml`
  unmodified) and every other AC-1 clause (no `/__mock-review/page/`, no `/@fs/`, the entry body's
  one `import "…/src/ui/main.tsx"` line) passes. Flagged rather than fixed — the assertion lives
  outside the server layer's File Plan rows; the tests layer should scope the regex/count to
  exclude Vite's own `/@vite/client` tag (e.g. filter matches to `url !== '/@vite/client'` before
  asserting length 1).
- Resolution of the above: the AC-20260915-03-1 assertion was authored over-broad (it counted every
  `type="module"` script in the document, including Vite's own unconditionally-injected
  `/@vite/client` tag), not under-specified in the AC itself — AC-1 requires exactly one script
  whose `src` equals the entry URL and, separately, that `/@vite/client` appears somewhere in the
  document; both hold at once. Narrowed `tests/server/api.test.ts`'s AC-1 case to filter the
  regex's matches to `match[1] === ENTRY_URL` before asserting `toHaveLength(1)`, leaving the
  `/@vite/client` containment check and every other clause of the test unchanged. No change to the
  AC's meaning or to `src/server/plugin.ts`.
- `tests/browser/hmr.test.ts`'s AC-20260915-03-6 host edit used a non-global
  `original.replace('Account', 'Account (edited)')`, which replaces only the first occurrence of
  `Account` in `tests/fixtures/host/src/screens/home.tsx`; since `<Button data-to="Account">Account</Button>`
  places the `data-to` attribute before the rendered child text, the edit landed on the attribute
  (`data-to="Account (edited)"`) and never changed the visible button text, so the test's
  `toContain('Account (edited)')` assertion could never pass. An executed spike confirmed the D9
  mechanism under test is healthy: after the edit the iframe still fired a real `load` event
  ~20ms later and the server served the newly transformed bytes for `/src/screens/home.tsx` — only
  the mutation was misaimed. Re-aimed the replace at the rendered text node
  (`original.replace('>Account</Button>', '>Account (edited)</Button>')`), which leaves the
  `data-to="Account"` attribute (relied on elsewhere, e.g. the journey graph and
  `tests/browser/surfaces.test.ts`) intact. No change to D9 or to any other assertion in the test.
- `tests/server/api.test.ts`'s AC-20260915-03-1 assertion `expect(importLines).toHaveLength(1)` over
  the entry module body (`GET /@id/__x00__mock-review:entry`) counted every non-blank line without
  excluding Vite's own dev-mode instrumentation. Executed evidence: a `cat -A` capture of the live
  response body showed `import "/@fs/<abs>/src/ui/main.tsx"$`, a blank line, then
  `//# sourceMappingURL=data:application/json;base64,...` — two non-blank lines, not one. A control
  capture of an unrelated module (`src/ui/main.tsx` served over `/@fs/`) showed the identical
  trailing blank-line-plus-sourcemap-comment shape, confirming Vite's dev `transformRequest`
  appends this to every module it serves, with no per-module plugin opt-out. The plugin's `load`
  hook returns exactly `import "<path>"\n` — one line — matching D10 and AC-1's literal requirement
  ("one `import` statement ending in `src/ui/main.tsx`"; a sourcemap comment is not a statement).
  `src/server/plugin.ts` was verified correct and left unchanged. Fixed by stripping trailing
  `//# sourceMappingURL=` and `//# sourceURL=` comment lines from the split body before counting
  non-blank lines, keeping `toHaveLength(1)` and both existing regex assertions on `importLines[0]`
  unchanged.
- `tests/package/installed-serve.test.ts`'s network-log assertion `expect(reactDomClientHits).toHaveLength(1)`
  counted raw `page.on('response')` events matching `/react-dom_client\.js/` rather than distinct
  URLs. Executed evidence: a live installed-layout Playwright run (cold optimizer start) logged two
  response events for `http://127.0.0.1:5182/node_modules/.vite/deps/react-dom_client.js?v=60385333`
  — byte-identical path and `?v=` hash — one requested by the reviewer document
  (`http://127.0.0.1:5182/#/home`) and one by the mock iframe
  (`http://127.0.0.1:5182/?frame=1#/home?state=Default`). Two independent browsing contexts each
  issue their own request; Chromium does not collapse them into one `page.on('response')` event, and
  there is no duplicate-React split (Decision D4 / Assumption A6's invariant — one physical
  optimized React build — holds). Fixed by de-duplicating matching URLs into a `Set` and asserting
  `size` equals 1, which still fails if a second build with a different `?v=` hash or path ever
  appears; every other assertion in the test (zero 504/5xx, zero page errors, sidebar width > 0,
  ConsoleShell in the iframe) is unchanged.
