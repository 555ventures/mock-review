---
date: 2026-09-16
status: done
tier: critical
area: server
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-16
open_markers: 0
build_base: main
diff_base: 659ca1e8d792d781530d0b92f0939f9f96c3ef7e
---

# No reviewer reload on design writes

## Goal

Saving a note or an approval in the reviewer page must never reload the reviewer window, in
`mock-review serve` and in a host that mounts `mockReview()` in its own `vite.config.ts` alike.
Today the host's Tailwind stylesheet scans `design/**`, so every write the reviewer (or the spec
pipeline's drivers) makes under `design/` is answered by `@tailwindcss/vite` with a full-page
reload of every connected document. Done means: a design write costs the reviewer nothing but
its SSE-driven state refetch, a host `src/**` edit reloads the mock iframe alone in both mounts,
and the `standalone` switch that made the second half `serve`-only is gone.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **One unconditional, `order: 'pre'` `hotUpdate` hook.** `mockReview()` always carries `hotUpdate: { order: 'pre', handler }`; the handler acts only when `this.environment.name === 'client'` and returns `undefined` for every other environment and for any file outside `<root>/design/` and `<root>/src/`. (AC-20260916-01-1, AC-20260916-01-2, AC-20260916-01-5) | Vite 8 sorts `hotUpdate` hooks by the hook object's own `order`, never by plugin `enforce` (spike S1: plugin-level `enforce: 'pre'` with a plain-function hook still let Tailwind reload 3×; object-form `order: 'pre'` gave 0); `pre` puts the handler ahead of every host plugin regardless of where the host lists `mockReview()`. |
| D2 | **Every file under `<root>/design/` is silent.** For any `type` (`create`, `update`, `delete`) and any file whose first root-relative segment is `design` — `notes.json`, `approval.json`, their `.tmp` siblings, `mocks/*.json`, `mocks/*.md`, `doctrine.md`, `shell/app.html`, `screenshots/*.png`, anything — the handler returns `[]` and sends nothing. (AC-20260916-01-1, AC-20260916-01-2, AC-20260916-01-4) | Returning `[]` is Vite's documented "take over this update" (Context7 excerpt in Contracts): later plugins receive `modules: []`, and Tailwind's hook returns before sending on an empty list. The spec pipeline writes many `design/**` files besides notes and approval (status, ledger, seed, doctrine, shell), every one of which would trigger the same reload; nothing in a host imports from `design/` (contract: `design/examples/` sits outside every glob), so no HMR is ever lost. Rejected S2 (move the files: breaks contract v1; dot-dirs are still scanned) and S3 (wrap `environments.client.hot.send`: no API contract, swallows the reviewer's own reloads, misses `server.ws.send`). |
| D3 | **`src/**` reloads the frame alone in every mount.** For a client-environment file whose first segment is `src`, the handler sends `{ type: 'custom', event: 'mock-review:frame-reload', data: { file: '<root-relative posix path>' } }` and returns `[]` — spec 03 D9's behaviour, now also in an embedded host, where `@vitejs/plugin-react`'s invalid-boundary `full-reload` reloaded the reviewer document too. (AC-20260916-01-1, AC-20260916-01-5, AC-20260916-01-6) | Executed D9 repro: an embedded host's `src/**` edit reloads the reviewer window today because the hook was `serve`-only. `src/ui/frame/mount.tsx`'s listener is unchanged and stays the only reloader. |
| D4 | **The `standalone` option is removed.** `mockReview()` takes no options: the signature becomes `mockReview(): Plugin`; `src/server/serve.ts` mounts `mockReview()`. [no-ac: a type-level removal with no runtime surface — `npm run check` (the `gate` leg) type-checks `serve.ts`'s bare call and rejects any survivor of `{ standalone: true }`] | Only `serve.ts` passed it; neither the README nor `docs/canonical` mentions it; keeping a switch whose only effect was to reintroduce this bug in embedded hosts is a trap. |
| D5 | **The SSE layer is untouched.** `src/server/watch.ts` keeps listening on `server.watcher` for `notes`/`approval`/`files`; `hotUpdate` returning `[]` has no effect on it. (AC-20260916-01-3) | Spike S1 and the plan-time micro-spike both observed the `notes`/`approval` events arriving with the hook in place; the watcher and the HMR pipeline are independent subscribers of the same chokidar instance. |
| D6 | **No Tailwind configuration is required of the host.** The fix is entirely in the plugin; the README's "Mounting in a host" section gains one sentence saying a host *may* add `@source not "../design";` to its stylesheet to keep Tailwind from scanning design files at all, as an optimisation, never a requirement. [no-ac: documentation only; the behaviour it describes is AC-20260916-01-5's] | A required CSS edit in every host is exactly the kind of setup step that gets forgotten and reintroduces the bug; the plugin owns the boundary. |
| D7 | **Vite's own `.html` fallback is left alone.** When the handler returns `[]` for `design/shell/app.html`, Vite's server sends `{ type: 'full-reload', path: '/design/shell/app.html' }` itself; the Vite client only acts on an `.html`-suffixed path when it equals `location.pathname`, and both reviewer documents live at `/`, so the payload is inert. The plugin does not try to suppress it. (AC-20260916-01-2) | Micro-spike M1 (Assumptions A2): the path-carrying payload appears and neither document navigates. Suppressing it would mean sending from the plugin's own copy of Vite's logic or wrapping `hot.send` — S3's rejected surface. |
| D8 | **Server tests build their own Vite server on a scratch host with a scratch-local `cacheDir`.** AC-2/AC-3's test calls Vite's `createServer` with the same inline config `serve.ts` uses (`root`, the scratch host's `vite.config.ts`, `logLevel: 'silent'`, `appType: 'custom'`, `plugins: [mockReview()]`, `server.host: '127.0.0.1'`) plus `cacheDir: '<host>/.vite-test'`, and talks to it over a raw `WebSocket(url, 'vite-hmr')` (Node 24's global). (AC-20260916-01-2, AC-20260916-01-3) | The Gotcha about second servers is about a server *inside* `serve` evicting the shared `node_modules/.vite/deps`; a test-owned server with its own `cacheDir` on a copied host can evict nothing, and a raw HMR socket is the only way to count `full-reload` frames without a browser. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/server/plugin.ts | MODIFY | server | D1–D4: replace the `standalone`-gated plain-function `hotUpdate` with the unconditional object-form hook; replace `srcRelativePath` with a root-relative first-segment classifier (`design` / `src` / other) — the old helper must go, `noUnusedLocals` rejects a leftover; drop the `options` parameter and its doc comment; update the `mockReview` JSDoc to describe both rules. |
| src/server/serve.ts | MODIFY | server | D4: `plugins: [mockReview()]`. |
| README.md | MODIFY | other | D6: one sentence in "Mounting in a host" — saves never reload the page, and `@source not "../design";` is an optional optimisation. |
| tests/unit/plugin.test.ts | CREATE | tests | AC-20260916-01-1 |
| tests/server/hot-update.test.ts | CREATE | tests | AC-20260916-01-2, AC-20260916-01-3 |
| tests/browser/reload.test.ts | CREATE | tests | AC-20260916-01-4, AC-20260916-01-5 |
| tests/browser/hmr.test.ts | MODIFY | tests | AC-20260916-01-6 — the reused AC-20260915-03-6 titles also carry this AC's ID (review fix: ac-matrix coverage); no assertion changes |

`src/ui/frame/mount.tsx` is deliberately not in the plan: its `mock-review:frame-reload` listener is unchanged, and a concurrent session (journey guide ring) is editing that file.

## Contracts

The plugin's public signature and the hook, verbatim:

```ts
// src/server/plugin.ts
export function mockReview(): Plugin

// the hook, as installed on the plugin object (D1–D3)
hotUpdate: {
  order: 'pre',
  handler(options) {
    if (this.environment.name !== 'client') return undefined
    const rel = rootRelative(options.server.config.root, options.file) // undefined outside root
    if (rel === undefined) return undefined
    const top = rel.split('/')[0]
    if (top === 'design') return []
    if (top === 'src') {
      this.environment.hot.send('mock-review:frame-reload', { file: rel })
      return []
    }
    return undefined
  },
}
```

`rootRelative(root, file)` returns the posix, root-relative path or `undefined` when `file` is
outside `root` (`path.relative` starting with `..` or absolute), exactly what `srcRelativePath`
does today minus its `src` check. The custom event's wire shape is unchanged from spec 03 D9:
`{ type: 'custom', event: 'mock-review:frame-reload', data: { file: 'src/screens/home.tsx' } }`.

Vite 8.3.0 `hotUpdate` (Context7, `/vitejs/vite`, api-environment-plugins):

> `(this: { environment: DevEnvironment }, options: HotUpdateOptions) => Array<EnvironmentModuleNode> | void`
> — `options.type` is `'create' | 'update' | 'delete'`; `options.modules` are the modules in this
> environment affected by the file. Return an empty array `[]` after calling manual invalidation
> or custom events to handle updates manually. Send custom events with
> `this.environment.hot.send({ type: 'custom', event, data })` (or the `send(event, data)`
> shorthand) and return `[]`.

Installed Vite's dispatcher (node_modules/vite/dist/node/chunks/node.js, `getSortedPluginsByHotUpdateHook`): a plugin whose `hotUpdate` is an object with `order: 'pre'` is spliced ahead of every plain-function hook; the client environment's hooks run first and each returned array replaces `options.modules` for the next plugin. After the hooks, an environment whose module list is empty gets no update, except a client-environment file ending in `.html`, which gets `{ type: 'full-reload', path: '/<root-relative file>' }` (D7).

`@tailwindcss/vite` 4.3.3 `hotUpdate` (installed dist): returns immediately unless `modules.length > 0` and every module is an asset; otherwise, for a scanned non-JS, non-CSS file, sends a path-less `{ type: 'full-reload' }` through `this.environment.hot` (client) or `server.hot`.

Tailwind CSS v4 (Context7, `/tailwindlabs/tailwindcss.com`, detecting-classes-in-source-files): automatic source detection scans every file under the project root except `.gitignore`d paths, binaries and CSS; `@source not "<relative dir>";` excludes a directory. The optional README sentence (D6) uses it.

## Behavior

| Event (client environment) | Handler | Later plugins see | What the documents do |
|---|---|---|---|
| `design/notes.json` written via `.tmp` + rename (`create` of `.tmp`, `create`/`update` of the target) | `[]` | `modules: []` → Tailwind returns early | nothing reloads; the `notes` SSE event triggers the reviewer's state refetch |
| `design/approval.json` same path | `[]` | same | nothing reloads; `approval` SSE |
| `design/mocks/status.json`, `design/mocks/ledger.md`, `design/doctrine.md` … any create/update/delete | `[]` | same | nothing reloads, no SSE (not a watched file) |
| `design/shell/app.html` | `[]` | same; Vite itself sends `full-reload` with `path: '/design/shell/app.html'` | inert: neither document is at that path (D7) |
| `src/**` (host source or `mock.config.ts`? — no: `mock.config.ts` is at root, not `src/`) | send `mock-review:frame-reload`, `[]` | `modules: []` → plugin-react does nothing | the frame document reloads once; the reviewer document keeps every state; `files` SSE refetches state |
| `mock.config.ts`, `vite.config.ts`, the package's own `src/ui/**` (outside the host root) | `undefined` | Vite's default handling | unchanged from today |
| any file, `ssr` environment | `undefined` | Vite's default handling | no client is attached to the SSR hot channel |

## Acceptance Criteria

- **AC-20260916-01-1**: WHEN `mockReview()` is called THE SYSTEM SHALL return a plugin whose `hotUpdate` is an object with `order === 'pre'` and a `handler` function, and WHEN that handler is invoked with a fake context `{ environment: { name: 'client', hot: { send } } }` and `server.config.root = '/host'` THE SYSTEM SHALL return `[]` and call `send` zero times for each of `{ type: 'update', file: '/host/design/notes.json' }`, `{ type: 'create', file: '/host/design/notes.json.tmp' }`, `{ type: 'delete', file: '/host/design/mocks/ledger.md' }` and `{ type: 'update', file: '/host/design/shell/app.html' }`; SHALL return `[]` and call `send('mock-review:frame-reload', { file: 'src/screens/home.tsx' })` exactly once for `{ type: 'update', file: '/host/src/screens/home.tsx' }`; and SHALL return `undefined` with zero sends for `{ type: 'update', file: '/host/mock.config.ts' }`, for `{ type: 'update', file: '/elsewhere/design/notes.json' }`, and for `/host/design/notes.json` when `environment.name === 'ssr'` → writes tests/unit/plugin.test.ts
- **AC-20260916-01-2**: WHEN a Vite dev server is created per D8 on a scratch copy of `tests/fixtures/host` (whose `vite.config.ts` lists `react()` and `tailwindcss()`, whose `src/themes/nova.css` imports Tailwind without `source()`), with `design/notes.json`, `design/approval.json` (seeded with `"theme": "nova"`, A8), `design/mocks/status.json` and `design/shell/app.html` present before the server starts, a raw `vite-hmr` WebSocket client connected, and `GET /` plus `GET /src/themes/nova.css` fetched once so Tailwind has scanned (the test asserts `server.environments.client.moduleGraph.getModulesByFile(<abs nova.css>)?.size` is `1` before mutating, so a silent no-scan can never pass it), and THEN `design/notes.json` is rewritten through a `.tmp` + rename, `design/approval.json` likewise, `design/mocks/status.json` overwritten, `design/mocks/ledger.md` created then deleted, and `design/shell/app.html` overwritten THE SYSTEM SHALL, within 1500 ms of each write, have sent the socket zero `full-reload` frames without a `path` and zero `full-reload` frames whose `path` is `/` or `*`, and for `app.html` exactly one `full-reload` frame whose `path` is `/design/shell/app.html` (Vite's own, D7) (e.g. rename `notes.json.tmp` → `notes.json` → frames since last step: `[]`; write `app.html` → frames: `[{ type: 'full-reload', path: '/design/shell/app.html' }]`; pre-image: `[{ type: 'full-reload' }, { type: 'full-reload', path: '/design/shell/app.html' }]`) → writes tests/server/hot-update.test.ts
- **AC-20260916-01-3**: WHEN, on the AC-2 server, `design/notes.json` and then `design/approval.json` are rewritten through `.tmp` + rename while a `GET /__mock-review/events` stream is open THE SYSTEM SHALL CONTINUE TO deliver exactly one `event: notes` and exactly one `event: approval` frame on that stream within 2000 ms of each write → writes tests/server/hot-update.test.ts
- **AC-20260916-01-4** `[env: SKIP_BROWSER]`: WHEN `mock-review serve` runs on a scratch copy of `tests/fixtures/host` whose `design/approval.json` was seeded with `"theme": "nova"` before `serve` started (A8), the reviewer page is open at `/#/home` with the mock iframe showing the `home` screen, a marker is planted on the reviewer `window` and another on the iframe's `contentWindow`, and a note is added by `POST /__mock-review/notes` with `{ op: 'add', note: { screen: 'home', state: 'Default', component: 'WalletSummary', key: '0', snippet: 'USD 128.50', status: 'open', thread: [{ by: 'owner', text: 'bigger' }] } }` THE SYSTEM SHALL, within 3000 ms, show the new note's pin (`button[aria-label^="Open note "]` count goes from 0 to 1) while both markers are still present and the iframe's `src` attribute is unchanged (e.g. `window.__spec04` → `'alive'` before and after; pre-image: the reviewer document navigates and the marker is `undefined`) → writes tests/browser/reload.test.ts
- **AC-20260916-01-5** `[env: SKIP_BROWSER]`: WHEN a scratch copy of `tests/fixtures/host` (its `design/approval.json` seeded with `"theme": "nova"`, A8) is given an ESM `package.json`, an `index.html` and a `vite.config.ts` listing `react(), tailwindcss(), mockReview()` (the package materialised under its `node_modules` exactly as `AC-20260915-03-4`'s test does), `npx vite --host 127.0.0.1 --port 0`-equivalent dev server is spawned in it and its printed URL opened at `/#/home` with markers planted as in AC-4, THEN (a) a note is added by the same `POST /__mock-review/notes` THE SYSTEM SHALL keep both markers and the iframe `src` while the pin appears within 3000 ms; and (b) `src/screens/home.tsx`'s `>Account</Button>` is replaced with `>Account (edited)</Button>` THE SYSTEM SHALL, within 3000 ms, show `Account (edited)` inside the iframe with the reviewer-window marker still present, the iframe-window marker gone (the frame document reloaded once), and the iframe `src` unchanged (pre-image: the reviewer window reloads on both (a) and (b), so the reviewer marker is `undefined`) → writes tests/browser/reload.test.ts
- **AC-20260916-01-6** `[env: SKIP_BROWSER]`: WHEN, under `mock-review serve`, a host screen file is edited THE SYSTEM SHALL CONTINUE TO show the edit inside the iframe within 2 s with the iframe `src` unchanged, the reviewer document not reloaded, the drawn pin kept, one `files` SSE event and a changed `screens[home].hash` → reuses tests/browser/hmr.test.ts :: AC-20260915-03-6:

## Assumptions (escalation triggers)

- A1: An object-form `hotUpdate: { order: 'pre', handler }` on a plugin listed *after* `react()` and `tailwindcss()` runs before both, and its `[]` empties `modules` for them — **executed 2026-09-15**, spike S1 (worktree, standalone `serve` and an embedded host, both plugin orders; harness counted `full-reload` frames on a raw HMR socket and top-level navigations in Playwright): baseline on a note save `navCount=4, wsFullReloads=3`; with the hook `0` and `0` in every layout, `notes`/`approval` SSE still delivered; a plugin-level `enforce: 'pre'` with a plain-function hook still gave 3 reloads — **if false (a reload survives in some plugin order):** STOP, ask the user; the only alternative is S3's wrapped `hot.send`, refused without its own spike.
- A2: With the hook returning `[]` for `design/shell/app.html`, Vite's server sends `full-reload` with `path: '/design/shell/app.html'` and neither the reviewer document nor the frame navigates — **executed 2026-09-16**, micro-spike M1: on a scratch fixture host (`approval.theme: "nova"` seeded so `nova.css` is loaded and Tailwind has scanned), edit / delete / recreate of `design/shell/app.html` each produced exactly one WebSocket frame `{ type: 'full-reload', path: '/design/shell/app.html' }`, `topNav=0`, `frameNav=0`, reviewer marker `__alive=1`; baseline (hook deleted) produced two frames per event (`path: null` from Tailwind plus the path-carrying one), `topNav=1`, marker gone — **if false (a document at `/` reloads):** the handler additionally returns `[]` only for non-`.html` design files and D7 is rewritten to invalidate nothing and send nothing for `.html` — STOP and ask the user before that rewrite.
- A3: In an embedded host (`react()`, `tailwindcss()`, then `mockReview()`), a `src/screens/*.tsx` edit with the hook in place yields one `custom` `mock-review:frame-reload` frame, zero `full-reload` frames, one frame navigation and zero top-level navigations, and the edited text renders inside the iframe — **executed 2026-09-16**, micro-spike M2: `react()`, `tailwindcss()`, then `mockReview()` (run B) and `mockReview()` first (run C) both gave: 1 `custom` `mock-review:frame-reload` frame, 0 `full-reload`, 0 `update`, `topNav=0`, `frameNav=1`, marker kept, `Account (edited)` inside the iframe after 198 ms (B) / 184 ms (C); baseline: 1 `full-reload` with `path: "*"`, 1 top navigation, text after 1065 ms via the whole page reloading — **if false:** STOP, ask the user (plugin-react's `hotUpdate` would be acting on an empty module list, which contradicts its installed source).
- A4: `.tmp` create, rename-over, and create/delete of arbitrary `design/**` files send nothing — **executed 2026-09-16**, micro-spike M3: `notes.json.tmp` write + rename, `approval.json` likewise, `mocks/status.json` overwrite, `mocks/ledger.md` create and delete → 0 WebSocket frames each with the hook, `topNav=0`, marker kept, `notes`/`approval` SSE 1/1; baseline: 1 path-less `full-reload` and 1 top navigation on each of notes, approval and status (the `.md` create/delete sent nothing even at baseline — Tailwind never registered it as an asset module); a plain-function variant of the same handler without `order: 'pre'` (run D) reverted to the baseline rows for every `design/` write while still catching `src/**` — `order: 'pre'` is load-bearing — **if false:** the classifier is wrong for that event type; fix the classifier, never widen to a `hot.send` wrapper.
- A5: The `ssr` environment never reaches the browser: the host stylesheet is absent from the SSR module graph, so Tailwind's hook has `modules: []` there and returns early — **executed 2026-09-16**, micro-spike M4: `client.moduleGraph.getModulesByFile(nova.css).size=1`, `(design/notes.json).size=1` with type `asset`; `ssr.moduleGraph.getModulesByFile` → `undefined` for both, before and after `ssr.runner.import('/src/screens/home.tsx')`; `ssr.hot` is a plain object whose `send` is a function, so only the `environment.name !== 'client'` guard keeps the SSR pass inert; a repeat notes write after the SSR import → 0 frames — **if false (an SSR-side send reaches the client):** the handler must also act for `this.environment.name === 'ssr'` on design files; add that branch and an AC-1 case, no other change.
- A8: The reload exists only when the host stylesheet is loaded by a document — the frame links `/src/themes/<theme>.css` only when the reviewer's iframe `src` carries `_theme`, which comes from `approval.theme` — **executed 2026-09-16**, micro-spike setup: with the stock fixture (`theme: null`) even the baseline showed 0 `full-reload` on a notes write and `getModulesByFile(nova.css) === undefined`; seeding `design/approval.json` with `"theme": "nova"` before the server starts reproduces every baseline row above. Every AC-2/4/5 test therefore seeds that theme first, or it measures nothing — **if false (the reload appears without a theme):** the tests still pass; only the precondition was over-specified.
- A6: `standalone` has no consumer outside `src/server/serve.ts` — verified 2026-09-16 by `grep -rn standalone src tests docs README.md`: `serve.ts:44` and `plugin.ts:480/484/599` only — **if false:** keep the option as an accepted-and-ignored no-op for one release and note it in the README.
- A7: No host module imports anything under `design/` — verified 2026-09-16: `spec/templates/mock/contract.json:7` places `design/examples/` "outside every glob below"; a grep of the fixture hosts and the mock template found no import from `design/` — **if false:** that import's file gets a `src`-style frame reload, not silence; add a Behavior row and an AC-1 case.

## Rationale

The reload is a plugin-ordering problem, not a React problem. Both reviewer documents (the page and the mock iframe are the same HTML at `/`) are HMR clients of the host's Vite server. The host's stylesheet imports Tailwind without `source()`, so Tailwind's automatic source detection watches every non-ignored file under the project root, `design/**` included, and its `hotUpdate` answers any scanned non-JS, non-CSS change with a path-less `full-reload` to every client. The reviewer's own stylesheet already uses `source(none)` and is not the trigger; it is the host's, which the plugin cannot edit.

Spec 03's D9 already intercepted `src/**` edits with the same mechanism, but installed the hook only under `serve` and as a plain function, so it never ran ahead of Tailwind (Vite orders `hotUpdate` by the hook object's `order`, not by plugin `enforce`) and never ran in an embedded host at all. This spec keeps D9's approach and fixes both gaps: object-form `order: 'pre'`, always installed, and a second rule that silences every `design/**` event. Silencing the whole directory rather than the two contract files is deliberate: the drivers write status, ledger, seed, doctrine and shell files there, each of which would reload the page for the same reason, and no host code imports from `design/`.

Alternatives rejected: moving the design files (breaks contract v1 and Tailwind still scans dot-directories); asking hosts to add `@source not` (a required setup step that gets forgotten — offered as an optimisation only, D6); wrapping the client hot channel's `send` (no API contract, swallows the reviewer's legitimate reloads, misses `server.ws.send`).

What is fragile: D7 relies on the Vite client's `.html` path comparison; if a future host serves the reviewer at a path other than `/` this still holds (the comparison is against the html file's own path), but a host that moves `design/shell/app.html` to the served pathname would reload — not a supported layout. The frame still reloads (never Fast-Refreshes) on every host edit, as before.

Two spike facts test authors must not trip over: the reload exists only once a theme is picked (A8 — seed `approval.theme`), and a rewrite of `approval.json` legitimately re-derives the iframe `src` (one child-frame navigation, no HMR involved), so AC-4/5 assert the iframe `src` on a *notes* write only. `design/*.md` files never became Tailwind asset modules in the spike, so their silence is already Vite's; the classifier still covers them for uniformity.

Collision closure (D4 retires `standalone`, the File Plan retires `srcRelativePath`): every literals-leg hit outside the three planned files is waived — the copies under `.claude/worktrees/*` belong to other sessions' checkouts and are never edited from here; `dist/**` is the committed release artifact, regenerated only by the release procedure (queued); `tests/server/api.test.ts:488` uses "standalone" as an English word in a comment about a Vite app, not the option.

Build deviation (2026-09-16, one-off): AC-5's embedded-host `vite.config.ts` also carries the fixture host's `resolve.alias['@']` — without it every screen's `@/…` import 500s and no screen renders; AC-20260915-03-4's embedded host omits it too but never renders a screen.

Review note (2026-09-16): the first two leg runs went red on unrelated browser tests that passed in isolation (`surfaces.test.ts` AC-20260915-02-1 counts tabs once right after `networkidle` instead of polling); the third run was green. Queued as a follow-up.

Regression pins: AC-3 (SSE delivery) and AC-6 (spec 03's frame-only reload under `serve`) are the behaviours a future change must not break; AC-1/2/4/5 expire at close.

## Canonical Delta

In `docs/canonical/package.md`, under "The reviewer page", after the paragraph ending "…so it can never evict the deps `serve` is serving.", add:

> The plugin owns the HMR boundary between the host and the reviewer with one `hotUpdate` hook, installed unconditionally and ordered `pre` so it runs ahead of every host plugin in every mount (`serve` and a host's own `vite.config.ts` alike). In the client environment, any change under `<root>/design/` (the contract files, their `.tmp` siblings, the drivers' `mocks/*`, `doctrine.md`, `shell/app.html`, screenshots) returns `[]` and sends nothing, so `@tailwindcss/vite`'s automatic source detection — which scans `design/**` whenever the host stylesheet imports Tailwind without `source()` — never full-reloads the page on a save; the SSE `notes`/`approval` events remain the reviewer's only signal. Any change under `<root>/src/` sends the custom `mock-review:frame-reload` event (the frame document alone listens and reloads) and returns `[]`. Everything else, and every non-client environment, keeps Vite's default handling; Vite's own `full-reload` for an edited `.html` file carries that file's path and is inert for documents served at `/`. A host may add `@source not "../design";` to its stylesheet as an optimisation; nothing requires it. `mockReview()` takes no options.

In the "Server API" table, the `events` row's description is unchanged.
