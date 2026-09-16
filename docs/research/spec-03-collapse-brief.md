# Design brief: collapse the reviewer onto the host's Vite server (input for spec 03)

Written at the close of spec 02, from a read-only design pass. Spec 02 split one Vite pipeline into
a prebuilt static reviewer page plus a frame compiled from a file outside the host root over `/@fs/`,
with **zero executed spikes** (`.claude/spec-runs.jsonl`: spec 01 `spikes: 9`, spec 02 `spikes: 0`),
and froze that split as locked Decisions. Two thirds of spec 02's defects — dep-cache eviction and
its 504s, the failed pre-bundle, the missing react preamble, the theme reaching the frame, the role
carrier, the incomplete release artifact — are consequences of that split, not bad luck. This brief
is the target shape that removes the family.

## 1. Target shape

One HTML document, one entry, one module graph, both roles, both modes.

- `GET /` (owner, `?client=`, `?frame=1`) answers one template
  `<div id="root"><script type="module" src="/@id/__x00__mock-review:entry">`, passed through
  `server.transformIndexHtml` so the host's own react plugin injects `/@vite/client` and the refresh
  preamble. D24's 403 branch and `Set-Cookie` stay on this route unchanged.
- `resolveId` / `load` for `\0mock-review:entry` return **plain JS, no JSX**:
  `import '<abs pkg>/src/ui/main.tsx'`, where `<abs pkg>` derives from `import.meta.url` of the
  compiled plugin (identical for `dist/` and `.test-dist/`). The virtual id exists only to give a
  layout-independent script URL; the browser never sees whether the package is symlinked or installed.
- `src/ui/main.tsx` becomes the design reference §0.1 shape verbatim: if the URL carries `frame`,
  dynamically import the frame mount; otherwise the reviewer. Dynamic imports keep the graphs
  separate — the frame document never loads the reviewer's CSS, shadcn, radix or cmdk; the reviewer
  never loads host screens. `src/frame/entry.tsx` moves to `src/ui/frame/mount.tsx` unchanged.
- CSS isolation: `src/ui/index.css` becomes `@import "tailwindcss" source(none); @source "./";` so the
  reviewer's classes come from its own tree only, while the host's stylesheet keeps scanning the host
  root. The mock still gets the host's Tailwind and aliases because the frame branch imports host
  files by root-relative path through the host's resolver.
- Production safety (ADR-0028): nothing in the host's `index.html` imports the entry, and the plugin
  gains `apply: 'serve'` so even a host that mounts it in `vite.config.ts` builds clean. AC-20260915-02-13's
  `vite build` grep survives as the proof.
- Hooks: `config` (`optimizeDeps.include` for the reviewer's deps, `resolve.dedupe: ['react','react-dom']`),
  `resolveId` + `load` (the entry), `configureServer` (`fs.allow` for symlinked layouts, plus the
  existing middleware). No `transform`, no `enforce`.

## 2. What this deletes or supersedes

Files: `vite.page.config.ts`, `src/ui/index.html`, `src/frame/`, `scripts/release-check.mjs`,
`dist/page/`, `dist/frame/`, `tests/server/build-fallback.test.ts`, `tests/cli/release-check.test.ts`.
In `src/server/plugin.ts`: `FALLBACK_HTML`, `serveIndex`, `serveStaticAsset`, `CONTENT_TYPES`, the
self-heal script, both startup warnings, `/__mock-review/page/*`, `pageDir`, `frameEntryPath`. In
`tests/setup.ts`: the page/frame build. In `package.json`: `build` returns to `tsc && chmod`,
`release:check` goes, `files` gains `src/ui`, and the page's UI libraries move from devDependencies
to dependencies. `tsconfig.build.json` stops excluding `src/frame/**`.

Decisions retired: D8 (rewritten — both modes through the host), D15, D17, D18c, D18d, D19, D25.
Surviving verbatim: D20 (one runner inside `serve`), D21, D22 (a one-shot `createServer` beside
`serve` still evicts deps, so its own `cacheDir` stays), D23, D24 (the cookie now also covers the
entry URL), D26, D27. AC-20260915-02-13 loses its `/__mock-review/page/` clause; AC-20260915-02-10
replaces the `/@fs/` frame-entry request with the entry URL. The canonical doc's reviewer-page
section and the `[host]` gotcha citing D17 are rewritten.

## 3. Spikes — all of these run and are recorded BEFORE anything is locked

Run each against the fixture host in **both** layouts: symlinked package, and a real `npm i` under
`node_modules`.

1. **JSX through the host server.** Vite 8's transform keys on the id's extension, and plugin-react
   excludes `node_modules` from refresh; this is exactly why spec 02's virtual id failed. Check the
   served module contains a `jsx(`/`jsxDEV(` call and no raw markup, and the browser console shows no
   preamble complaint. Pass: both layouts render the reviewer's sidebar.
2. **CSS leak.** Mount the plugin in the fixture's own config, run `vite build`, grep the output for
   `data-sidebar`, `Geist`, `mock-review`. Pass: zero hits, while the served reviewer CSS does contain
   the reviewer's own selectors.
3. **Optimizer.** Twenty cold starts (`rm -rf node_modules/.vite`), each opening the page and waiting
   for the mock's shell, logging every 504 and full reload, with and without `optimizeDeps.include`.
   Pass: zero 504s in 20 of 20, at most one reload.
4. **HMR.** With the reviewer open and a pin visible, edit a host screen's text. Pass within 2 s: the
   frame shows the new text, the iframe's `src` is unchanged, the pin survives, exactly one `files`
   event, and the screen's hash in `GET state` changed.
5. **Remote client.** With a forwarded-header request on every call: the tokenized load sets the
   cookie; the entry URL, module URLs, `state` and `events` all answer 200 with it; `state` without it
   answers 403. Pass: the mock renders for that remote context.
6. **One React.** Installed layout with `resolve.dedupe`. Pass: a single react-dom client URL in the
   network log and no invalid-hook-call error.

## 4. Risks and fallbacks

- Optimizer churn or 504s (spike 3) → prebundle the reviewer as one ESM library with react external
  plus prebuilt CSS, imported by the entry. Still one server, one graph, no page build.
- A host without the react or Tailwind plugin → the plugin appends its own copies when absent, then
  re-run spike 2.
- Duplicate React (spike 6) → the same library fallback with react external.
- Abandon the collapse only if spike 3 fails in both include modes **and** the library fallback also
  504s, which would indict `serve`'s own server that spec 02 already depends on.

## 5. Scope and sequencing

One spec, two waves. Wave 1 (server + ui): the `config`/`resolveId`/`load` hooks, the HTML route, the
entry switch, the frame mount move, the CSS change, `package.json`, `tests/setup.ts`. Wave 1 is done
when the plugin's real driver reaches APPROVED on the fixture host with the browser tests enabled.
Wave 2: the deletions, the doc rewrites and the test migrations.

Must stay green throughout: every unit test, the server API tests, both browser suites, the look and
serve CLI tests, the install test, the driver e2e test, and the runner cache-isolation test.

## 6. Acceptance-criterion style

Spec 02's criteria pinned DOM shapes, which is why tests stayed green while five behaviours were
wrong. Write them as a user action and the state change it must produce:

- WHEN a reviewer confirms Approve on the screen line THE SYSTEM SHALL write `design/approval.json`
  `screens.home.hash` equal to `check --json`'s hash for that screen within 1 s, and the next
  `GET state` SHALL report it.
- WHEN the host's screen file changes while the reviewer shows it THE SYSTEM SHALL render the edited
  text in the frame within 2 s without the iframe's `src` changing, and emit exactly one `files` event.
- WHEN `vite build` runs on a host that mounts the plugin THE SYSTEM SHALL emit no output file
  containing the reviewer's own markers, and `serve` SHALL still answer `GET /` with the virtual entry
  script.
