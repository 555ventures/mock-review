---
paths:
  - 'specs/**'
  - '.claude/**'
  - 'src/**'
  - 'tests/**'
---

# Spec pipeline grounding

## Risk Tiers

`critical` when a change touches the contract surface the spec plugin reads (`contract --json`, `check --json` shapes, `design/notes.json`, `design/approval.json`) or the install path (`package.json` `bin`/`exports`/`files`/`dependencies`, the committed `dist/`). Everything else is `standard`.

## Planning

Ground every claim in `~/projects/claude-plugins/spec/templates/mock/contract.json` (the binding contract, contractVersion 1) and `docs/research/plugin-requirements.md` (what the plugin actually reads, cited). The reviewer page's look and behaviour are frozen in `docs/design/design-reference.md` + `docs/design/atlas/` — a visible change is a user decision, never a planning choice. Third-party shapes (Vite Environment API, react-docgen-typescript, TypeScript compiler API, zod v4, Playwright) are spiked before they enter a Decision; `docs/research/spikes.md` holds the executed evidence and the installed versions.

## Build

Layers in wave order: `schemas` (src/schemas — zod, the one source of truth) → `analysis` (src/analysis — discovery, TypeScript, layer lint, docgen, hash, journeys, render) and `server` (src/server — Vite plugin, endpoints, portfile) → `cli` (src/cli) and `ui` (src/ui — feature folders). `npm run build` must succeed after every wave; `dist/` is committed at release only, never in a build batch. JSON verbs print only JSON on stdout — every log goes to stderr.

## Worker Rules

TypeScript strict, ESM, `verbatimModuleSyntax`. No `!` non-null assertions, no `as any`, no `any`. Shared shapes are imported from `src/schemas` — never redeclared. UI: feature folders (`src/ui/<feature>/`), one store with selectors (`src/ui/store/`), a separate sync layer (`src/ui/sync/`) using per-note patches, a real router, stock shadcn parts composed from the official example shape; presentational parts take props only, containers read the store. No seed data, no scattered sessionStorage, no host-alias imports (`@/…`) inside the package.

## Test Rules

Vitest. Test files under `tests/**/*.test.ts(x)`; the AC-ID appears in the test title (`AC-YYYYMMDD-NN-k: …`). Unit tests for schemas, selectors, analysis and the notes writer; CLI tests spawn `dist/cli.js` or `tsx src/cli.ts` against `tests/fixtures/host` (a host mirroring the plugin's `spec/templates/mock/` exactly); browser tests (Playwright, `tests/browser/`) for raise/answer/approve. A test that needs a built `dist/` declares it in its title; `npm run check` never depends on the network.

## Review Checks

1. `contract --json` and `check --json` stdout parse as JSON with no other bytes. 2. Every shape in `spec/templates/mock/contract.json` `shapes` has a zod schema and a test that validates the CLI output against the contract's required-key lists. 3. The plugin's real `mocks-driver.js` is exercised against `tests/fixtures/host` with the built binary (never a stub). 4. No file under `src/` imports `@/…`. 5. Reviewer surfaces match `docs/design/design-reference.md` control for control.

## Gotchas (evidence-cited)

<!-- One line per entry: a provenance tag — [host] (this repo/stack) or [plugin] (traces to
a spec-plugin template/command/generated artifact) — the rule with its mechanism, and
one owner citation (spec path, AC-ID, D-number, ADR, run id).
Never dates, people, hosts, versions, or prior behavior (/spec:doctor check 16 scans this
layer). Writers: the review stage's close step and /spec:escape only. /spec:doctor prunes dead
citations and rolls [plugin] entries up as an upstream bug list. -->

- [host] Vite's `createServer()` registers its own `SIGINT`/`SIGTERM` handlers that exit with 128+signal before any handler registered later runs; a CLI that owns shutdown must remove them right after `createServer()` resolves. — AC-20260915-01-13
- [host] `server.environments.ssr` is typed as the base `DevEnvironment`; narrow it with vite's `isRunnableDevEnvironment` before touching `.runner`. — D4 of specs/20260915/01-schemas-cli-and-bare-serve.md
- [host] Tests spawn the gitignored `.test-dist/cli.js`, rebuilt when `src/**` is newer, never the committed `dist/` (a release artifact that can be a stub); a gate that builds into `dist/` dirties release output on every run. — D19 of specs/20260915/01-schemas-cli-and-bare-serve.md
- [host] A test that runs a host verb in place on a committed fixture creates `design/*.json` inside it and every later scratch copy inherits them; fixture copies exclude `design/{notes,approval,decisions}.json` and `.serve.json`, and in-place runs remove only what they created. — AC-20260915-01-22
- [host] A whole-command wall-clock bound on `check` measures Vite and TypeScript startup (well over a second), not the unit named in the AC; time the function under test directly. — D18 of specs/20260915/01-schemas-cli-and-bare-serve.md
- [host] A one-shot CLI verb that loads Vite must end with an explicit `process.exit` after its output flushes, because a handle that survives `server.close()` (e.g. an inotify watcher) keeps the event loop alive indefinitely; every synchronous CLI spawn in tests carries a timeout so such a hang fails fast. — D20 of specs/20260915/01-schemas-cli-and-bare-serve.md
- [host] Inside `serve`, nothing may build a second Vite server: a `createServer` on the same root computes a different `optimizeDeps` config hash (its plugin list differs) and deletes the shared `node_modules/.vite/deps` the running server is serving, after which the next module request answers `504 Outdated Optimize Dep` with no reload and the frame stays blank; load host modules through the running server's own SSR runner, and give one-shot verbs their own `cacheDir`. — D20 and D22 of specs/20260915/02-the-reviewer-page.md
- [host] An unstable value passed into a hook dependency array (`journey?.edges ?? []`, a fresh object from a selector) is a real infinite render loop that a production page build hides — React's depth warning is dev-only — and that only surfaces as unrelated timeouts under CPU load; hoist the empty constant and make a no-op state reset return the previous value. — specs/20260915/02-the-reviewer-page.md build (gate repair)
- [host] A hash-only change is a same-document navigation and never reloads an iframe; when a frame must re-read something it reads once at load, fold a marker into the real search string so `src` actually changes. — D18e of specs/20260915/02-the-reviewer-page.md
- [host] Playwright's `getByRole` reads the accessibility tree, so nothing outside an open Radix modal is findable while it is open (the dialog `aria-hidden`s the app root); assert on elements behind a dialog with a non-role locator or close the dialog first. — AC-20260915-02-19
- [host] A hand-rolled virtual module id has no `.tsx` extension for `@vitejs/plugin-react` to key its transform off, so JSX inside it is not reliably transformed; serve the real file through Vite's `/@fs/` route with its directory added to `server.fs.allow`. — D17 of specs/20260915/02-the-reviewer-page.md
- [plugin] `red-check.js` lists files with a walker that treats directory symlinks as files and crashes with `EISDIR`; remove the fixture hosts' `node_modules` links before a red-check run (test runs recreate them). — specs/20260915/01-schemas-cli-and-bare-serve.md build (TESTS→RED_FINDINGS)
- [plugin] `red-check.js` refuses when any non-tests File Plan path already differs from `diff_base`, so a config edit a test author needs must be reverted before red-check and re-applied in a wave. — D16 of specs/20260915/01-schemas-cli-and-bare-serve.md
