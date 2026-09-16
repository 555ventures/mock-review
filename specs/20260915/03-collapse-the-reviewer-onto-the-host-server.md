---
date: 2026-09-15
status: implementing
build_base: main
open_markers: 0
tier: critical
area: reviewer-page
design: false
breaking: false
depends_on: [specs/20260915/02-the-reviewer-page.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-15
diff_base: 5ee095701aada8cd787ce2eb2ba68b21217d4caf
---

# Collapse the reviewer onto the host's Vite server

## Goal

`mock-review serve` serves the reviewer page and the mock frame as one HTML document from one
module entry through the host's own Vite dev server, and the package stops shipping a prebuilt page
and an out-of-root frame file. Spec 02's split (a static `dist/page/` plus a frame compiled over
`/@fs/`) caused two thirds of its defects; this spec deletes that machinery, keeps every reviewer
behaviour and contract file exactly as they are, and keeps the host's production build free of
reviewer code. Done means the browser and server suites are green on both package layouts (linked
package and a package installed under the host's `node_modules`), the CSS-leak build check stays
green, and the plugin's real driver still reaches APPROVED on the fixture host.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **One document, one entry.** `GET /` (owner, `?client=`, and `?frame=1`) answers one template — `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>mock-review</title></head><body><div id="root"></div><script type="module" src="/@id/__x00__mock-review:entry"></script></body></html>` — passed through `server.transformIndexHtml(req.url, html)` so the host's own `@vitejs/plugin-react` injects `/@vite/client` and its refresh preamble. D24's role gate, 403 bodies and `Set-Cookie` on this route stay byte-for-byte as they are. The plugin's `resolveId` maps `mock-review:entry` to `\0mock-review:entry`; `load` answers that id with plain JS and no JSX: `import "<pkgRoot>/src/ui/main.tsx"`, where `pkgRoot = path.resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')` of the compiled plugin (`dist/server/plugin.js` and `.test-dist/server/plugin.js` both resolve to the package root). (AC-20260915-03-1, AC-20260915-03-2, AC-20260915-03-7) | The browser only ever sees `/@id/__x00__mock-review:entry`, so the URL is identical whether the package is symlinked or installed; the real `.tsx` files are transformed by extension by the host's pipeline (spike 1 — the D17 gotcha was about JSX *inside* a virtual id, which this design never has). |
| D2 | **The entry switches on `?frame`, with dynamic imports.** `src/ui/main.tsx` becomes exactly: `if (new URLSearchParams(location.search).has('frame')) { void import('./frame/mount.js') } else { void import('./reviewer.js') }`. The reviewer's current `main.tsx` body (including `import './index.css'`) moves unchanged to `src/ui/reviewer.tsx`; `src/frame/entry.tsx` moves unchanged (same content, same root-relative `import.meta.glob` patterns, same `_theme`/`scheme`/`ensureStylesheet` behaviour) to `src/ui/frame/mount.tsx`. The frame document therefore never loads `index.css`, the shadcn primitives, `radix-ui`, `cmdk` or the store; the reviewer never loads host screens. (AC-20260915-03-3) | Two module graphs behind one entry keep the mock's document as clean as spec 02's separate frame did (design reference §0.1 is this exact shape), without a second HTML route or a second transport. |
| D3 | **CSS isolation.** `src/ui/index.css` starts with `@import "tailwindcss" source(none);` followed by `@source "./";` and is otherwise unchanged, so the reviewer's utility classes are generated from `src/ui/**` only; the host's own Tailwind stylesheet keeps scanning the host root and never sees the package (it lives outside the root when linked, under `node_modules` when installed — both ignored by Tailwind's automatic detection). (AC-20260915-03-2, AC-20260915-03-4) | Spike 2b: host-only utilities injected into a screen do not appear in the reviewer's CSS, and the reviewer's own `--sidebar-*` tokens do; spike 2: a host production build emits no reviewer marker. |
| D4 | **Plugin hooks, and nothing else.** `apply: 'serve'`; `config()` returns `{ optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'radix-ui', 'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react', 'cmdk', 'react-resizable-panels'] }, resolve: { dedupe: ['react', 'react-dom'] } }` — the `include` list is load-bearing and exactly this set (spike 3: it is the complete first-load graph, 12 optimized entries, nothing discovered later; without it the linked layout re-optimizes mid-load with a `504 Outdated Optimize Dep` on `react-resizable-panels` in 15 of 20 cold starts plus one full reload in 20 of 20, and the installed layout never mounts because `react-dom/client` is served as raw CJS from under `node_modules`, which Vite's scanner does not crawl); `resolveId`/`load` per D1; `configureServer` pushes `pkgRoot` onto `server.config.server.fs.allow` and mounts the existing middleware; `hotUpdate` per D9. No `transform`, no `enforce`, no `transformIndexHtml` hook of its own. Mounting the plugin twice (a host that also lists it in `vite.config.ts`, plus `serve`'s own mount) must keep working: the middleware answers each route once, `resolveId`/`load` are idempotent, and both `config()` results merge to the same arrays. (AC-20260915-03-2, AC-20260915-03-4) | Spike 6: `resolve.dedupe` is not load-bearing in either layout (one realpath of React) and is kept as cheap insurance for a host with a nested `node_modules/react`; spike 2: the double mount is benign today and the AC-4 test pins that. |
| D5 | **Production safety is `apply: 'serve'` plus nothing in the host's `index.html`.** A host that mounts `mockReview()` in its own `vite.config.ts` builds clean; the host must be an ESM package (`"type": "module"` in its `package.json`, which the shadcn scaffold already has) because the plugin's `./vite` entry is ESM-only and Vite 8 bundles a CJS-typed host config with `require`. The fixture host has no `package.json`; the test that mounts the plugin writes `{"name":"app","private":true,"type":"module"}` into its scratch copy only. (AC-20260915-03-4) | Spike 2's first attempt failed at config load for exactly this reason; recorded as a documented host requirement (README + canonical) rather than a CJS build of the plugin. |
| D6 | **Deleted and superseded surfaces.** Files removed: `vite.page.config.ts`, `src/ui/index.html`, `src/frame/entry.tsx` (moved, D2), `scripts/release-check.mjs`, `tests/server/build-fallback.test.ts`, `tests/cli/release-check.test.ts`. Removed from `src/server/plugin.ts`: `FALLBACK_HTML`, `CONTENT_TYPES`, `contentTypeFor`, `serveStaticAsset`, `serveIndex`, `frameHtml` and its self-heal script, both startup warnings, the `/__mock-review/page/*` route, `pageDir`, `frameEntryPath`, `frameDir`. `tests/setup.ts` loses the page/frame build (`pageDir`, `frameDir`, `frameEntryPath`, `pageBuildIsStale`, `buildPageAndFrame`) and builds `.test-dist/` with `tsc` alone. `tsconfig.build.json` `exclude` becomes `["src/ui/**"]`. Spec 02's D8, D15, D17, D18c, D18d, D19 and D25 are superseded (a one-line note under spec 02's Decisions says so); D20, D21, D22, D23, D24, D26 and D27 stand verbatim — D22's own `cacheDir` stays because a one-shot `createServer` beside `serve` still evicts deps. (AC-20260915-03-1, AC-20260915-03-8) | Every removed piece exists only to serve or repair the split; leaving any of it would keep the release gate and the fallback branches alive for a layout that no longer exists. |
| D7 | **Install shape.** `package.json`: `files` = `["dist", "src/ui"]`; `build` = `tsc -p tsconfig.build.json && chmod +x dist/cli.js`; `release:check` removed; `dependencies` gain `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `react-resizable-panels`, `tw-animate-css`, `@fontsource-variable/geist` (moved out of `devDependencies`, same ranges); `peerDependencies` gain `tailwindcss: "^4"` (the reviewer's `index.css` imports it, resolved from the CSS file's own location) while `react`, `react-dom`, `vite` stay peers and `playwright` stays an optional peer; `@vitejs/plugin-react` and `@tailwindcss/vite` are host-provided (the host's config mounts them; the reviewer relies on the host's react plugin for the preamble and on the host's Tailwind plugin for its CSS) and are documented as requirements, not declared. `dist/` stays committed at release, now holding the compiled CLI/plugin only; the reviewer ships as source under `src/ui/`. (AC-20260915-03-2, AC-20260915-03-8) | The reviewer is compiled by the host at serve time, so its runtime libraries must install with the package; `files` is the only way source reaches an installed host. |
| D8 | **The installed layout is a first-class test target.** `tests/helpers/cli.ts` gains `installPackageInto(hostDir)`: copies `.test-dist/` as `<hostDir>/node_modules/@555/mock-review/dist/`, `src/ui/` as `…/src/ui/`, and the package's `package.json`, and returns that `dist/cli.js` path. A browser test starts `serve` from that CLI (the reviewer's TSX physically under the host's `node_modules`, where `@vitejs/plugin-react` excludes it from Fast Refresh) and proves the page and the mock render with zero `504` responses and one `react-dom` client module. (AC-20260915-03-2) | Spec 02's release gap (a package installed from git served a blank mock) was invisible because every test ran the linked layout; spike 1 ran both and the installed one is where JSX-under-`node_modules` and duplicate-React risks live. |
| D9 | **A host edit reloads the frame, never the reviewer document.** `mockReview({ standalone: true })` (what `serve.ts` mounts; a host config's own `mockReview()` omits it) adds a `hotUpdate` hook that, in the `client` environment and for any file under `<root>/src/`, sends `{ type: 'custom', event: 'mock-review:frame-reload', data: { file } }` and returns `[]`; `src/ui/frame/mount.tsx` ends with `if (import.meta.hot) import.meta.hot.on('mock-review:frame-reload', () => location.reload())`, and the reviewer branch has no listener. The `files` SSE event and the reviewer's state refetch are unchanged, so a screen edit costs one frame-document reload with the iframe `src` untouched, and every reviewer-side state (open dialog, draft, marking mode, scroll) survives. The event fires for every host `src/**` change whether or not the frame's graph holds the file (a `journeys.ts` edit also reloads the frame once — accepted, ~130 ms and no reviewer state lives there). Edits to `mock.config.ts` (never in the client graph; the `files` SSE is its only signal, D23) or to the package's own `src/ui/**` keep Vite's default handling. The frame reloads on every host edit and never Fast-Refreshes; the pre-image behaved the same. (AC-20260915-03-6) | Spike 4 on the prototype: with plain HMR, plugin-react finds every mock screen an invalid refresh boundary (it exports `meta` and `examples`), the frame's client calls `import.meta.hot.invalidate()`, and Vite broadcasts `full-reload` to every connected client — the reviewer document included, which spec 02's static page never was (pre-image: 0 main-frame reloads, 114 ms to the edited text; prototype without D9: 1 main-frame reload per edit, 1.2–1.7 s). Returning `[]` from `hotUpdate` is the documented way to take over an update, and only the frame listens. |
| D10 | **Gotcha and canonical rewrites.** The `[host]` gotcha citing spec 02 D17 ("a hand-rolled virtual module id has no `.tsx` extension…") is rewritten in place to what spike 1 proved: a virtual id that carries JSX is not transformed, but a virtual id that only *imports* a real `.tsx` file is transformed by extension by the host's pipeline, even under `node_modules`; keep JSX out of virtual modules. The canonical doc's "The reviewer page" section, its route table row for `/` and `/?frame=1`, its "Tests and builds" paragraph and the release procedure are rewritten per Canonical Delta. `README.md` drops the release-check step and the frame-copy wording and gains the host requirements (ESM host, react + Tailwind Vite plugins). [no-ac: prose] | The gotcha as written would steer the next session back to `/@fs/`; the docs would describe a release artifact that no longer exists. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/server/plugin.ts | MODIFY | server | D1/D4/D6: `apply`, `config`, `resolveId`, `load`, `fs.allow` push, one HTML template for `/` and `/?frame=1` through `transformIndexHtml`; delete the page/frame/fallback code; every API route and the role gate unchanged |
| src/frame/entry.tsx | DELETE | server | D2: moved to `src/ui/frame/mount.tsx` |
| src/server/serve.ts | MODIFY | server | D9: mounts `mockReview({ standalone: true })` |
| src/ui/main.tsx | MODIFY | ui | D2: the `?frame` switch with two dynamic imports, nothing else |
| src/ui/reviewer.tsx | CREATE | ui | D2: the former `main.tsx` body verbatim (`index.css` import, `ForbiddenNotice`, `StoreProvider`, the `createRoot` mount) |
| src/ui/frame/mount.tsx | CREATE | ui | D2: the former `src/frame/entry.tsx` verbatim, plus D9's one `import.meta.hot.on('mock-review:frame-reload', …)` line |
| src/ui/index.css | MODIFY | ui | D3: `@import "tailwindcss" source(none);` + `@source "./";` |
| src/ui/index.html | DELETE | ui | D6: no page build |
| vite.page.config.ts | DELETE | other | D6 |
| scripts/release-check.mjs | DELETE | other | D6 |
| tsconfig.build.json | MODIFY | other | D6: `exclude` = `["src/ui/**"]` |
| package.json | MODIFY | other | D7: `files`, `build`, no `release:check`, dependency moves, `tailwindcss` peer |
| package-lock.json | MODIFY | other | D7: the lockfile for the dependency moves (`npm install`, no version changes) |
| README.md | MODIFY | other | D10: release section, reviewer-page section, host requirements |
| .claude/rules/spec-pipeline.md | MODIFY | other | D10: rewrite the D17 gotcha in place (count unchanged) |
| specs/20260915/02-the-reviewer-page.md | MODIFY | other | D6: one line under Decisions: D8, D15, D17, D18c, D18d, D19, D25 superseded by specs/20260915/03 |
| tests/setup.ts | MODIFY | tests | D6: drop the page/frame build and its exports |
| tests/helpers/cli.ts | MODIFY | tests | D8: `installPackageInto(hostDir)` |
| tests/server/build-fallback.test.ts | DELETE | tests | D6 |
| tests/cli/release-check.test.ts | DELETE | tests | D6 |
| tests/server/api.test.ts | MODIFY | tests | AC-20260915-03-1, AC-20260915-03-3, AC-20260915-03-4, AC-20260915-03-7 (drop the `pageDir` import) |
| tests/package/install.test.ts | MODIFY | tests | AC-20260915-03-8 |
| tests/package/installed-serve.test.ts | CREATE | tests | AC-20260915-03-2 |
| tests/browser/hmr.test.ts | CREATE | tests | AC-20260915-03-6 |
| tests/browser/roundtrip.test.ts | MODIFY | tests | AC-20260915-03-5 (tag the existing AC-20260915-02-20 test's title; assertions unchanged) |
| tests/cli/look.test.ts | MODIFY | tests | AC-20260915-03-9 (tag the existing happy-path test's title; assertions unchanged) |
| tests/browser/surfaces.test.ts | MODIFY | tests | AC-20260915-03-10 (tag the existing AC-20260915-02-15 theme test's title; assertions unchanged) |
| tests/e2e/approved.test.ts | MODIFY | tests | AC-20260915-03-11 (tag the existing driver test's title; assertions unchanged) |

## Contracts

```ts
// src/server/plugin.ts — the only new public surface is the entry id
const ENTRY_ID = 'mock-review:entry'            // what resolveId receives
const RESOLVED_ENTRY_ID = '\0mock-review:entry' // what load receives; browser URL /@id/__x00__mock-review:entry
// load(RESOLVED_ENTRY_ID) → `import ${JSON.stringify(path.resolve(pkgRoot, 'src', 'ui', 'main.tsx'))}\n`

// GET /                      → ENTRY_HTML through server.transformIndexHtml (owner or client)
// GET /?client=<token>       → same, plus Set-Cookie (D24 unchanged)
// GET /?frame=1[&_theme=k]   → same document; main.tsx picks the frame branch
// frame URL grammar, /@id entry aside, is unchanged: /?frame=1[&_theme=<key>]#/<screen>?state=<s>&scheme=<light|dark>

// src/server/plugin.ts — the plugin factory gains one option; serve.ts passes it, a host config omits it
export function mockReview(options: { standalone?: boolean } = {}): Plugin
// D9: with `standalone`, hotUpdate (client environment, file under <root>/src/) sends
//   { type: 'custom', event: 'mock-review:frame-reload', data: { file: '<root-relative>' } } and returns []

// tests/helpers/cli.ts
export function installPackageInto(hostDir: string): string // returns <hostDir>/node_modules/@555/mock-review/dist/cli.js
```

```json
// package.json (the fields this spec changes)
{
  "files": ["dist", "src/ui"],
  "scripts": { "build": "tsc -p tsconfig.build.json && chmod +x dist/cli.js" },
  "peerDependencies": { "playwright": "^1.63.0", "react": "^19", "react-dom": "^19", "tailwindcss": "^4", "vite": "^8" },
  "dependencies": { "@fontsource-variable/geist": "^5.3.0", "class-variance-authority": "^0.7.1", "clsx": "^2.1.1", "cmdk": "^1.1.1", "lucide-react": "^1.46.0", "radix-ui": "^1.6.7", "react-docgen-typescript": "^2.4.0", "react-resizable-panels": "^4.12.4", "tailwind-merge": "^3.7.0", "tw-animate-css": "^1.4.0", "typescript": "~6.0.0", "zod": "^4.6.5" }
}
```

## UI

No visible change. The reviewer page and the frame render exactly as spec 02 froze them
(`docs/design/design-reference.md`); only the transport changes. The design stage does not run.

## Behavior

Startup: `serve` creates the one Vite server (unchanged), the plugin's `config()` merges its
`optimizeDeps`/`resolve` additions, and `GET /` answers the template. The browser loads
`/@vite/client`, the react preamble, then `/@id/__x00__mock-review:entry` → `main.tsx` → either
`reviewer.tsx` (reviewer graph: store, sync, shadcn, `index.css`) or `frame/mount.tsx` (frame graph:
`react-dom/client` plus the host's screens, components, shells via root-relative globs, plus the
host's `/src/index.css` and the picked theme as `<link>`s). The iframe `src` grammar, `_theme`
reload rule (D18e), `replaceFrameHash` rule 16, SSE events, patches and roles are untouched.

A host that lists `mockReview()` in its own `vite.config.ts` gets two plugin instances under
`serve`; both register the same middleware, the first answers each route, and `vite build` ignores
both (`apply: 'serve'`).

## Acceptance Criteria

- **AC-20260915-03-1**: WHEN `GET <url>/` and `GET <url>/?frame=1` run on the served fixture host from loopback THE SYSTEM SHALL answer 200 `text/html` whose body contains exactly one `<script type="module" src="/@id/__x00__mock-review:entry">`, contains `/@vite/client`, and contains no `/__mock-review/page/` or `/@fs/` reference; and WHEN `GET <url>/@id/__x00__mock-review:entry` runs THE SYSTEM SHALL answer 200 JavaScript whose body is one `import` statement ending in `src/ui/main.tsx"` (e.g. `import "/@fs/<abs pkg>/src/ui/main.tsx"` when linked, `import "/node_modules/@555/mock-review/src/ui/main.tsx"` when installed) → rewrites tests/server/api.test.ts :: serves the prebuilt
- **AC-20260915-03-2** `[env: SKIP_BROWSER]`: WHEN the package is materialised under a scratch host's `node_modules/@555/mock-review/` (`installPackageInto`; the host has no `node_modules/.vite`, so this is a cold optimizer start), `serve` starts from that `dist/cli.js`, and Chromium opens `<url>/#/home` THE SYSTEM SHALL render the reviewer's left sidebar with a computed width greater than 0 px (its own Tailwind CSS compiled through the host), render `[data-component="ConsoleShell"]` inside the iframe whose `src` starts `/?frame=1#/home`, and the page's network log SHALL contain zero responses with status 504 or ≥ 500, exactly one URL matching `/react-dom_client\.js/`, and zero page errors (e.g. no `can't detect preamble`, no `Invalid hook call`) → writes tests/package/installed-serve.test.ts
- **AC-20260915-03-3** `[env: SKIP_BROWSER]`: WHEN `GET <url>/?frame=1#/home?state=Default` is loaded in Chromium THE SYSTEM SHALL render `[data-component="ConsoleShell"]` containing `<button data-to="Account">`, have zero `[data-sidebar]` elements, have no stylesheet in the frame document that defines `--sidebar-width`, and its resource timing entries SHALL include one URL ending `src/ui/main.tsx` and one ending `src/ui/frame/mount.tsx` and no other URL containing `src/ui/`; WHEN the hash is `#/home?state=Default&scheme=dark` THE SYSTEM SHALL have `html.dark` → rewrites tests/server/api.test.ts :: serves the frame
- **AC-20260915-03-4** `[env: SKIP_BROWSER]`: WHEN a scratch fixture host is given `package.json` `{"name":"app","private":true,"type":"module"}`, an `index.html` importing `/src/screens/home.tsx`, and a `vite.config.ts` whose plugins are `[react(), tailwindcss(), mockReview()]` (imported from the built `vite.js`), and `npx vite build --outDir dist` runs THE SYSTEM SHALL exit 0 and emit no `.js`/`.css`/`.html` file containing `data-sidebar`, `Geist` or `mock-review` once every literal occurrence of the host's and the package's absolute paths is stripped; and WHEN `serve` then starts on that same host (the plugin mounted twice) THE SYSTEM SHALL answer `GET <url>/` with the `/@id/__x00__mock-review:entry` script and `GET <url>/__mock-review/state` with 200 → rewrites tests/server/api.test.ts :: a production
- **AC-20260915-03-5** `[env: SKIP_BROWSER]`: WHEN, with no open note on `home`, the "Approve screen" line's Approve is confirmed THE SYSTEM SHALL CONTINUE TO write `design/approval.json` `screens.home.hash` equal to `check --json`'s `screens[home].hash`, and WHEN a new note is then saved on `home` THE SYSTEM SHALL CONTINUE TO remove `approval.screens.home` → reuses tests/browser/roundtrip.test.ts :: AC-20260915-02-20
- **AC-20260915-03-6** `[env: SKIP_BROWSER]`: WHEN the reviewer shows `#/home` with pin `N001` visible, the test has set `window.__spec03 = 'alive'` on the reviewer document, and the host's `src/screens/home.tsx` changes its button text from `Account` to `Account (edited)` THE SYSTEM SHALL render `Account (edited)` inside the iframe within 2 s, keep the iframe's `src` attribute byte-equal to its value before the edit, keep `window.__spec03 === 'alive'` on the reviewer document (it never reloaded), keep pin `N001`, emit exactly one `files` SSE event, and the next `GET state` SHALL report a `screens[home].hash` different from the one read before the edit → writes tests/browser/hmr.test.ts
- **AC-20260915-03-7**: WHEN `GET /?client=replace-me` runs with header `X-Forwarded-For: 203.0.113.9` THE SYSTEM SHALL answer 200 with the entry script and `Set-Cookie: mock-review-client=replace-me; Path=/; HttpOnly; SameSite=Lax`; WHEN `GET /`, `GET /?frame=1`, `GET /@id/__x00__mock-review:entry`, the module URL that entry imports, `GET /__mock-review/state` and `GET /__mock-review/events` run with that header, `Cookie: mock-review-client=replace-me` and no `?client=` THE SYSTEM SHALL answer 200 each (`role: "client"` for `state`); WHEN `GET /__mock-review/state` runs with that header and no cookie, or with `Cookie: mock-review-client=stale`, or with only `Referer: <url>/?client=replace-me` THE SYSTEM SHALL answer 403 and change no file → rewrites tests/server/api.test.ts :: AC-20260915-02-8/-10
- **AC-20260915-03-8**: WHEN `package.json` is read THE SYSTEM SHALL have `files` = `["dist", "src/ui"]`, `scripts.build` = `tsc -p tsconfig.build.json && chmod +x dist/cli.js`, no `scripts["release:check"]`, `dependencies` containing each of `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `react-resizable-panels`, `tw-animate-css`, `@fontsource-variable/geist`, `peerDependencies.tailwindcss` = `^4`, and none of those nine in `devDependencies`; and WHEN `npm pack --dry-run --json` runs THE SYSTEM SHALL list `dist/cli.js`, `dist/vite.js`, `src/ui/main.tsx` and `src/ui/index.css` and no path under `dist/page/` or `dist/frame/` → rewrites tests/package/install.test.ts :: AC-20260915-01-21: bin/files/prepare
- **AC-20260915-03-9**: WHEN `check --look home --state Default` runs on the fixture host with `serve` running THE SYSTEM SHALL CONTINUE TO write `design/screenshots/home-Default-1280x800-light.png`, `…-1280x800-dark.png`, `…-360x800-light.png`, `…-360x800-dark.png` as non-empty PNGs and print the four paths → reuses tests/cli/look.test.ts :: writes
- **AC-20260915-03-10** `[env: SKIP_BROWSER]`: WHEN `nova` is chosen in the theme Select THE SYSTEM SHALL CONTINUE TO write `approval.theme` = `nova`, and the frame document SHALL CONTINUE TO include a stylesheet whose href contains `themes/nova.css`, and the catalog preview iframe's `src` SHALL CONTINUE TO carry `_theme=nova` → reuses tests/browser/surfaces.test.ts :: AC-20260915-02-15: the
- **AC-20260915-03-11** `[env: SPEC_PLUGIN_ROOT]` `[env: SKIP_BROWSER]`: WHEN, on spec 01's scratch host after `journey-drawn`, the browser approves screens `home` and `account`, approves journey `first-visit`, picks theme `nova`, and the client confirms the journey THE SYSTEM SHALL CONTINUE TO let `mocks-driver.js --mark journey-approved --journey first-visit`, `--mark theme-picked` and `--mark approved` each exit 0 with `status.json` reading `APPROVED` → reuses tests/e2e/approved.test.ts :: after

## Assumptions (escalation triggers)

- A1: Vite 8.3.0 transforms a `.tsx` file by its extension even when it sits under the host's `node_modules`, and `@vitejs/plugin-react` 6.1.1's default `exclude: /node_modules/` only withholds the Fast Refresh wrapper — **executed 2026-09-15**, spike 1, both layouts: `GET /node_modules/@555/mock-review/src/ui/reviewer.tsx` → 200, body contains `jsxDEV(` and no raw JSX; sidebar 255 px; no `can't detect preamble` — **if false:** the fallback in the brief §4: prebundle the reviewer as one ESM library with `react` external and import it from the entry.
- A2: `server.transformIndexHtml` on a string template (no file on disk) injects `/@vite/client` and the react preamble — **executed 2026-09-15**, spike 1 and spike 5: `GET /` body carries both; frame document renders JSX with no preamble error — **if false:** STOP, ask the user (this is D1's whole mechanism).
- A3: `@import "tailwindcss" source(none); @source "./";` in a CSS file outside the host root (or under its `node_modules`) is compiled by the host's `@tailwindcss/vite` 4.3.3 and scans only the package's `src/ui/` — **executed 2026-09-15**, spike 2 + 2b: reviewer CSS 116,931 bytes containing `--sidebar-width`; host-only utilities `columns-3`/`backdrop-invert` absent from it — **if false:** the plugin appends its own `@tailwindcss/vite` instance (brief §4).
- A4: `apply: 'serve'` keeps the reviewer out of the host's production build — **executed 2026-09-15**, spike 2: `npx vite build --outDir dist` on a host mounting the plugin exits 0, emits `dist/index.html` + `dist/assets/index-*.js` only, zero hits for `data-sidebar`/`Geist`/`mock-review` after path stripping — **if false:** STOP, ask the user (ADR-0028).
- A5: A host whose `package.json` lacks `"type": "module"` cannot mount the plugin from its config (Vite 8 bundles the config as CJS and `@555/mock-review/vite` is ESM-only) — **executed 2026-09-15**, spike 2's first attempt: `[plugin externalize-deps] Error: Failed to resolve "@555/mock-review/vite". This package is ESM only but it was tried to load by require` — **if false (a CJS host works):** drop the requirement from the docs, nothing else changes.
- A6: Only one physical React exists in both layouts, so `resolve.dedupe` is inert insurance — **executed 2026-09-15**, spike 6, installed layout, dedupe on and off: one `react-dom_client.js?v=…` URL, no `Invalid hook call`, zero 504s — **if false (a host with a nested `node_modules/react`):** keep dedupe; if duplicates persist, the brief §4 library fallback with `react` external.
- A7: With D4's `optimizeDeps.include`, a cold start (`rm -rf node_modules/.vite`) renders the mock with no `504` and no reload — **executed 2026-09-15**, spike 3, 20 cold starts per cell (fresh Chromium context each): linked/include 0 504s, 0 reloads, 20/20 shell, median 2.28 s to shell; installed/include 0 504s, 0 reloads, 20/20, median 2.28 s; linked/no-include 15/20 runs with one `504 Outdated Optimize Dep` on `/node_modules/.vite/deps/react-resizable-panels.js` and 20/20 with one main-frame full reload; installed/no-include 0/20 rendered (`SyntaxError: The requested module '/@fs/…/react-dom/client.js' does not provide an export named 'createRoot'` — raw CJS, `_metadata.json` holds 4 entries instead of 12) — **if false (a 504 or a missing-export error appears with `include` present):** the brief §4 fallback — prebundle the reviewer as one ESM library with `react` external and import it from the entry; only if that also 504s is the collapse abandoned.
- A8: D9's `hotUpdate` interception stops the reviewer document from reloading on a host edit while the frame still shows the edit — **executed 2026-09-15**, spike 4 and 4b (Playwright, pin `N001` drawn first, `home.tsx` button text edited twice, SSE reader counting `files` events): pre-image linked 114/124 ms to the edited text, 0 main-frame reloads, 1 frame reload per edit; prototype without D9 1222/1692 ms (linked) and 1326/1531 ms (installed) with **1 main-frame reload per edit** (Vite's client reloads on any `full-reload` payload whose path is not `.html`, and plugin-react invalidates every screen because `examples` is not a component export); prototype with D9 149/135 ms (linked) and 124/121 ms (installed), 0 main-frame reloads, 1 frame reload per edit, 1 `files` event per edit, pin kept, iframe `src` unchanged, `screens[home].hash` changed each time; a `src/journeys.ts` edit → 1 `files` event, 1 frame reload, 0 main reloads; a `mock.config.ts` edit → 1 `files` event and no HMR payload at all (it is only in the SSR runner's graph, so the `files` SSE is its sole signal — D23 stands) — **if false (the reviewer document still reloads with the hook in place):** STOP, ask the user; the fallback would be routing `full-reload` per client through `server.ws.clients`, an undocumented surface this spec refuses to lock without a spike.
- A9: The D24 cookie reaches every request the one-document design makes, so a remote client sees a rendered mock — **executed 2026-09-15**, spike 5, both layouts, every request with `X-Forwarded-For: 203.0.113.9`: `GET /` no token → 403 text/plain; `GET /?client=replace-me` → 200 with the entry script and `Set-Cookie: mock-review-client=replace-me; Path=/; HttpOnly; SameSite=Lax`; cookie only → `GET /`, `/?frame=1`, the entry, its `main.tsx` import, `state` (`role: "client"`), `events` all 200; no cookie → `state`/`events`/`?frame=1` 403; stale cookie → 403; Playwright with the forwarded header renders `[data-sidebar]`, the frame's `ConsoleShell` and one `Confirm journey` button, then `/#/home` without the token still renders (cookie carries), then `/?client=wrong` clears the cookie and the page shows "This review link is no longer valid." (observed, unchanged D24 detail: the request that carries both `?client=wrong` and a still-valid cookie answers 200 with the clearing header; the 403 starts on the next request) — **if false:** STOP, ask the user (D24 is locked).
- A10: Mounting the plugin twice is benign — **executed 2026-09-15**, spike 2: host config `[react(), tailwindcss(), mockReview()]` plus `serve`'s own mount; `GET /` answered once, reviewer rendered, CSS 200 — **if false:** `configureServer` returns early when `server.config.plugins` already holds an earlier instance named `mock-review`.
- A11: The main checkout's `node_modules` was stale after the squash merge (113 entries, no `radix-ui`, `cmdk`, `playwright`) — **executed 2026-09-15**: `npm install --no-audit --no-fund` added 84 packages, lockfile unchanged — **if false:** nothing; recorded so the build orchestrator runs `setupCommand` before the gate.

## Rationale

Spec 02 split one Vite pipeline in two and froze the split with no executed spike (ledger: spec 01
`spikes: 9`, spec 02 `spikes: 0`); the dep-cache eviction and 504s, the failed pre-bundle, the
missing react preamble, the theme not reaching the frame, the role carrier and the incomplete
release artifact all descend from it (`docs/research/spec-03-collapse-brief.md`, the design brief
this spec hydrates). This spec is the brief's target shape, and every load-bearing claim was
executed against a working prototype before locking — six spikes, both package layouts.

Why a virtual entry that only imports: spec 02's D17 gotcha says a virtual id has no `.tsx`
extension for the react plugin to key on. That is true of a virtual module *containing* JSX. Here the
virtual module is one `import` line; the JSX lives in real `.tsx` files that the host's pipeline
transforms by extension, including under `node_modules` (spike 1). The virtual id exists only so the
browser-facing URL is layout-independent.

A second reason to collapse, found by spike 4's pre-image run: spec 02's design does not work at all
for a package installed under the host's `node_modules` — its frame entry served over `/@fs/` from
inside `node_modules` fails on `react-dom/client` (`does not provide an export named 'createRoot'`,
raw CJS because Vite's scanner never crawls it), so the mock is blank for every real host. The
collapse's D4 `optimizeDeps.include` is what fixes that (spike 3), and AC-2 is the first test that
runs the installed layout at all.

Why dynamic imports rather than two entries: one entry keeps one HTML route and one role gate; the
dynamic import boundary is what keeps the frame's document free of the reviewer's CSS and libraries
(spike 1: the frame's only stylesheet link is the host's `/src/index.css`).

Why `dependencies` and `files: src/ui`: the host compiles the reviewer at serve time, so the
reviewer's libraries must be installed next to the package and its source must be in the tarball.
`tailwindcss` is a peer because the reviewer's `index.css` imports it and the host already has it.

Rejected: keeping `release:check` for the CLI only — with `dist/` holding compiled TypeScript alone,
the existing "tests spawn `.test-dist`" rule plus the install test cover it. Rejected: guarding the
double mount by name — spike 2 shows it benign and the middleware is stateless; A10 holds the
fallback. Rejected: making the plugin bundle its own react/Tailwind plugins for hosts lacking them —
every host is a shadcn scaffold that ships both; recorded as A3's fallback, not built.

Fragile: the `@fontsource-variable/geist` webfont resolves through a host's package symlink to a
realpath outside both the host root and the package root in the test's linked layout (spike 1
installed run: one 403 on `…/geist-latin-wght-normal.woff2`); a real install keeps it inside the host
root, and rendering does not depend on it. `/src/index.css` 404s on a host without one (the fixture)
with a MIME console message; harmless and pre-existing.

Collision closure (`collision-closure.js --literal dist/page --literal /@fs --literal release-check
--literal frame/entry --literal __mock-review/page --literal vite.page.config`): every literals-leg
hit on a source, test, `package.json`, `tsconfig.build.json`, `README.md`, `.claude/rules/spec-pipeline.md`
or spec 02 path is a File Plan row above (the `/@fs` mention in `tests/browser/surfaces.test.ts` is a
comment on the AC-15 theme test, which that row's worker rewords while tagging). Waived: hits in
`docs/canonical/package.md` (rewritten by the Canonical Delta at close, not a row by convention),
`docs/research/spec-03-collapse-brief.md` (historical research prose that must keep naming what it
retired), `.claude/spec-runs/*.jsonl` (ledger history), and untracked build artifacts under
`.test-dist/`, `src/ui/.test-dist/` and `.claude/worktrees/` (gitignored, never read). The one
`executes` hit (`tests/cli/release-check.test.ts` runs `scripts/release-check.mjs`) is a DELETE pair.

Pins: AC-5, AC-9, AC-10 and AC-11 are `SHALL CONTINUE TO` pins on behaviours that must outlive this
spec — approval hash, screenshots, theme, and the driver reaching APPROVED all travel through the
frame this spec re-plumbs. AC-6's status is settled by spike 4.

## Canonical Delta

`docs/canonical/package.md`:

- Replace the first two paragraphs of "The reviewer page" with: "`serve` mounts the package's Vite
  plugin on the host's own dev server. `GET /` — owner, `?client=<token>` and `?frame=1` alike —
  answers one HTML document whose single module script is `/@id/__x00__mock-review:entry`; the plugin
  resolves that virtual id to one import of the package's `src/ui/main.tsx`, which loads the reviewer
  or, when the URL carries `frame`, the mock frame. Both compile through the host's own Vite pipeline
  (aliases, `@vitejs/plugin-react`, `@tailwindcss/vite`), so the package ships its reviewer as source
  (`files` includes `src/ui`) and no prebuilt page. The reviewer's stylesheet uses
  `@import "tailwindcss" source(none)` with `@source "./"`, so its classes come from `src/ui/` only and
  the host's stylesheet never scans the package. The plugin is `apply: 'serve'`: a host that lists
  `mockReview()` in its `vite.config.ts` builds clean, and such a host must be an ESM package
  (`"type": "module"`). Inside `serve` nothing creates a second Vite server: every host module load goes
  through the running server's own SSR runner. A one-shot verb (`check`, `check --look`) keeps its own
  short-lived server and its own `node_modules/.vite/mock-review-check` cache, so it can never evict
  the deps `serve` is serving."
- Server API table, row `/` and `/?frame=1`: "the entry document (one template for both; `?frame=1`
  selects the frame branch in `main.tsx`)".
- "Tests and builds": "`tests/setup.ts` compiles `tsconfig.build.json` into the gitignored
  `.test-dist/` with `tsc` alone, rebuilding whenever `src/**` is newer, under a lock; the reviewer
  needs no build. Browser tests run both layouts: the linked package (the repo's `.test-dist`) and a
  package materialised under a scratch host's `node_modules/@555/mock-review/`."
- Release procedure: step 1 becomes "`npm run build` (writes `dist/`: the compiled CLI and plugin
  only)"; delete step 3 (`release:check`) and renumber; the closing paragraph gains "The runtime
  `dependencies` also carry the reviewer's UI libraries (`radix-ui`, `cmdk`, `lucide-react`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `react-resizable-panels`, `tw-animate-css`,
  `@fontsource-variable/geist`); `tailwindcss ^4` is a peer; the host provides `@vitejs/plugin-react`
  and `@tailwindcss/vite`."
