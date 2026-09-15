---
date: 2026-09-15
status: done
open_markers: 0
tier: critical
area: package
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260915/02-the-reviewer-page.md]
brief: 01
spiked: 2026-09-15
build_base: main
diff_base: 15d874e4d614d53e02620ae5de796ecb20aecdd0
---

# Schemas, the headless CLI and the bare serve

## Goal

`@555/mock-review` becomes a real, installable package whose CLI satisfies the spec plugin's
contract (`~/projects/claude-plugins/spec/templates/mock/contract.json`, contractVersion 1) for
every verb the plugin's driver, genesis and run stage read: `contract`, `check`, `sweep`,
`answer`, and a bare `serve` whose liveness `check` reports. Done means the plugin's own
`mocks-driver.js`, run against a fresh host with the built binary and no stub anywhere, records
`seed-done`, `shell-drawn` and `journey-drawn`, and `check --json` validates against the
contract's required-key lists. The reviewer page itself is spec 02; `serve` here mounts a stub
route so the URL and portfile exist.

## Decisions (locked — workers apply verbatim, never override)

| ID  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | One-line rationale                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | `src/schemas/` holds one zod schema per contract shape — `contract`, `check`, `sweep`, `notes`, `approval`, `decisions`, `config` — each exporting the schema and its inferred type; objects the package writes are `.strict()`, `approval.journeys[*]` and `notes.notes[*]` are `.passthrough()` (the plugin's `client waive` adds `reason`/`at`; `project` is optional). A test validates every CLI JSON output against the contract file's `shapes.<verb>.required` lists read from `tests/fixtures/contract.json` (a byte copy of the plugin's file). (AC-20260915-01-1, AC-20260915-01-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | One source of truth for CLI, server and UI; the contract file is the oracle, never a hand-typed list. Rejected: TypeScript-only types (no runtime validation of files the page and plugin write).                                                                                                |
| D2  | Every JSON verb writes exactly one `JSON.stringify(result) + "\n"` to stdout and nothing else; every diagnostic goes to stderr; Vite is created with `logLevel: 'silent'` and `appType: 'custom'`; `--json` is accepted at any argv position. `contract` never imports Vite, never reads the host. Exit 0 on success, 2 on usage or refusal with `mock-review: <reason>` on stderr. (AC-20260915-01-3, AC-20260915-01-4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `mock-cli.js:146` does `JSON.parse(stdout)` with no tolerance (spike a showed `[vite] (ssr) connected.` on stdout). `contract` is the first call on every driver mark and must work in an empty dir.                                                                                             |
| D3  | Host discovery is filesystem globbing relative to the cwd (the app dir): screens `src/screens/*.tsx`, components `src/components/*.tsx` (never `src/components/ui/**`), shells `src/shells/*.tsx`, records `src/records/*.ts`, themes `src/themes/*.css`, journeys `src/journeys.ts`, config `mock.config.ts`; `design/examples/` is never read. Names are the file basenames without extension. (AC-20260915-01-5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The contract's host globs verbatim; `design/examples/` sits outside them by design (plugin AC-20260914-01-22). Rejected: `import.meta.glob` (browser-only, and the prototype's slice-by-index naming was brittle).                                                                               |
| D4  | `check` loads host modules through one Vite dev server in middleware mode (`createServer({ root: cwd, configFile: <cwd>/vite.config.ts, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true } })`) and `server.environments.ssr.runner.import(<abs path>)`; `mock.config.ts`'s default export, `src/journeys.ts`'s `journeys`, and each screen's `meta`/`examples` come from that runner; the server closes before the JSON prints. (AC-20260915-01-6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Spike a: both `ssrLoadModule` and the Environment API work on Vite 8.3.0; the host's own aliases and plugins resolve for free. Rejected: a second esbuild/tsx pipeline (duplicates the host config).                                                                                             |
| D5  | `check` findings, exact kinds and severities: **error** `type` (one per TypeScript pre-emit diagnostic under `src/`, from `ts.createProgram` on `tsconfig.app.json`; `message` = `TS<code>: <text>` at `<line>:<col>`), `layer` (a screen file whose import specifier is not `react`, `react/…`, `@/components/ui/…`, `@/components/…`, `@/shells/…`, `@/records/…`; one finding per offending import, `message` = `imports <specifier>`), `doc` (a component or shell without a `/** … */` JSDoc immediately above an exported declaration, or without a named export `examples`; `message` = `missing doc line` or `missing examples export`), `render` (an `examples` entry of a screen whose `renderToString` throws; `message` = `<state>: <error.message>`), `config` (`mock.config.ts` missing, not loadable, or failing the config schema; `message` = the zod pretty error's first line). **warn** `size` (a screen over 150 lines; `message` = `<n> lines`), `states` (a `meta.states` entry with no `examples` key equal to it case-insensitively; `message` = `state <s> has no example`), `twin` (stubbed: never emitted in this spec). `ok = !findings.some(f => f.severity === 'error')`. (AC-20260915-01-7, AC-20260915-01-8, AC-20260915-01-9, AC-20260915-01-10)                                                                                                                                         | The plugin's contract fixes the kinds; the driver refuses on `error` only. Spike c fixed the TS entry (`tsconfig.app.json`, the root file is a references stub). `twin` deferred per the Fable ruling.                                                                                           |
| D6  | `check.screens[]` = `{ name, file, states: meta.states, shell: <basename of the first @/shells/<X> import or null>, hash: sha256 hex of the file bytes, lines }`; `shells[]` = `{ name, file, examples: Object.keys(examples) }`; `themes` = theme basenames; `config` = the validated config or `{name:null,port:null,targets:null,theme:null,client:null}` alongside a `config` finding; `serve` = `{ url }` per D8. A screen whose `meta` is missing is reported with `states: []` plus a `render` finding `meta: missing`. (AC-20260915-01-11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Every key the contract requires is present even on failure (`null` counts as present for the plugin's key check, `mock-cli.js:14-17`). Spike g: a byte hash flips on a one-character edit — sufficient drift oracle.                                                                             |
| D7  | Journey resolution: `check.journeys[]` = `{ id, title, steps, edges, resolved, unresolved }` from `src/journeys.ts`; an edge resolves when the rendered default example HTML of `steps[from].screen` (the first `examples` entry, or the one named like `meta.states[0]`) contains the attribute `data-to="<edge.label>"` on any element; `unresolved[]` = `{ from, to, reason }` with reasons `edge has no label`, `step <from> names unknown screen <s>`, or `no control with data-to="<label>" on <screen>`; `resolved = unresolved.length === 0`. Journey edges never produce findings. The plugin's `journeys.ts` template is unchanged. (AC-20260915-01-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The plugin's seed template already says each edge's control carries `data-to="<label>"`; a pure attribute search is computable in SSR HTML with no DOM library and needs no template change. Rejected: Fable's `via: {component, text}` (needs a plugin template edit and text matching in SSR). |
| D8  | `serve` = `createServer({ root: cwd, configFile, logLevel: 'silent', plugins: [mockReview()], server: { port: config.port, strictPort: false, host: '127.0.0.1' } })`; after `listen()` it writes `design/.serve.json` = `{ url, pid }` with `url = resolvedUrls.local[0]` minus any trailing slash, prints `url + "\n"` as its first stdout line, and deletes the portfile on `SIGINT`/`SIGTERM`/normal exit. The plugin middleware serves `GET /__mock-review/ping` → `{"ok":true,"pid":<pid>}` and `GET /` → a stub HTML page reading `mock-review: reviewer page lands in spec 02` (replaced by spec 02). `check` sets `serve.url` = the portfile's `url` when `GET <url>/__mock-review/ping` answers 200 within 500 ms, else `null` (any thrown error counts as dead). (AC-20260915-01-13, AC-20260915-01-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Spike f executed this exact sequence; a dead port fails as a fetch `TypeError`, so liveness keys on any error. The driver concatenates `url + '/?client='` — no trailing slash.                                                                                                                  |
| D9  | Any verb that runs in a host (`check`, `sweep`, `answer`, `serve`) first ensures `design/notes.json` = `{"contractVersion":1,"notes":[],"journeys":{}}` and `design/approval.json` = `{"contractVersion":1,"screens":{},"journeys":{},"theme":null}` exist (created only when absent, never overwritten), and every file write goes through `writeJsonAtomic(path, obj)` (write `<path>.tmp` then `rename`). (AC-20260915-01-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The driver hard-refuses on a missing notes/approval file (`mocks-driver.js:265-275`); nothing else creates them. One helper is the whole "file layer".                                                                                                                                           |
| D10 | `answer (--note <id> \| --journey <id>) --text <t> [--decision <d>]`: appends `{ by: "session", text: t }` to the target's `thread`, sets its `status` to `answered`, and with `--decision` appends `{ screen: <note.screen or null>, text: d, at: <ISO now> }` to `design/decisions.json` (created as `{"contractVersion":1,"decisions":[]}` when absent). Prints `answered <id>` on stdout, exit 0. Unknown id → exit 2 `mock-review: no note <id>` / `no conversation for journey <id>`; neither or both targets → exit 2 usage. Never sets `approved`, never deletes. (AC-20260915-01-16, AC-20260915-01-17)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Doctrine § Mocks: Page Notes — only the page ends a note. `by: "session"` matches the Fable attribution ruling (`client` for the page's client role in spec 02).                                                                                                                                 |
| D11 | `sweep --json` = `{ contractVersion: 1, inventory, queue }`. `inventory[]` = one row per component and shell from one `react-docgen-typescript` parser built with `withCustomConfig('tsconfig.app.json', { savePropValueAsString: true, propFilter: <drop node_modules parents> })` and one `parse([...files])` call: `{ name, kind: 'component'\|'shell', props: { [prop]: <type string> }, doc: <description>, usedOn: [<screens importing it>] }`. `queue[]` = journey conversations whose `status === 'open'` first (`kind: 'journey'`, `id`, `screen: null`, `state: null`, `file: 'src/journeys.ts'`, `line: <line of  id: '<id>'  or 1>`, `last: <last thread text or ''>`, `reuse: []`), then notes whose `status === 'open'` (`kind: 'note'`, `id`, `screen`, `state`, `file: src/screens/<screen>.tsx`, `line: <first line containing  <<component>  or 1>`, `last`, `reuse: <inventory component names not in usedOn of this screen>`), each group sorted by `file` then `id`. Text form: when the queue is empty print exactly one line `queue empty`; otherwise the inventory (one line per row: `<name> (<kind>) — <doc> — props: a: string, b: number — used on: x, y`) then a blank line, then the queue grouped by `file` with a `## <file>` heading and one line per item `[<kind>] <id> <screen>/<state> line <line> — <last> — reuse: a, b`. (AC-20260915-01-18, AC-20260915-01-19, AC-20260915-01-20) | Spike b: one parser + one parse call keeps the sweep under a second. Doctrine: open items only, journeys first, grouped by file, one line when empty (the session's loop terminator).                                                                                                            |
| D12 | The package's `dependencies` carry everything the built bin needs at runtime on a fresh host: `zod`, `react-docgen-typescript`, `typescript` pinned `~6.0.0`; `vite`, `react`, `react-dom` stay peers; `playwright` an optional peer. `dist/` is committed at release (`npm run build`, then `git tag -f v1`); no `prepare` script. Install form documented in README: `npm i -D github:555ventures/mock-review#v1`. (AC-20260915-01-21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Spike e proved the tag install and bin symlink; leaving `typescript` dev pulled TypeScript 7 into the host through docgen's open peer.                                                                                                                                                           |
| D13 | `tests/fixtures/host/` is a committed host: the plugin's four templates copied to their SEED destinations (`mock.config.ts`, `src/journeys.ts` with one journey `first-visit` (`home` → `account`, edge label `Account`), `design/examples/*`), `src/records/customers.ts`, `src/shells/ConsoleShell.tsx` (doc line + `examples`), `src/screens/home.tsx` and `src/screens/account.tsx` (doc line, `meta`, `examples`, `home` carries `<button data-to="Account">`), `src/components/ui/button.tsx` and `card.tsx` copied from the shadcn scaffold, `src/themes/nova.css`, `vite.config.ts`, `tsconfig.app.json`, `components.json`; `node_modules` is a symlink to the package's own `node_modules` created by `tests/setup.ts` (gitignored). A second fixture `tests/fixtures/host-broken/` overlays a layer violation, a missing doc line, a throwing state and a type error. (AC-20260915-01-22)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The only way to test the real chain without a network install per run; the package's devDependencies already carry react, vite, tailwind and the shadcn deps.                                                                                                                                    |
| D14 | The end-to-end test copies the fixture host to `<scratch>/app`, links `<scratch>/app/node_modules/.bin/mock-review` → `dist/cli.js`, writes `<scratch>/design/mocks/seed.md` from the plugin's `mocks-seed.md` template with `## Records` `- customers` and `### first-visit`, then runs `node $SPEC_PLUGIN_ROOT/spec/scripts/mocks-driver.js --root <scratch> --mark seed-done`, `--mark shell-drawn`, `--mark journey-drawn --journey first-visit` and asserts exit 0 and the marks in `status.json`. `SPEC_PLUGIN_ROOT` defaults to `~/projects/claude-plugins`. The driver's `client open` check moved to spec 02 (D16). (AC-20260915-01-23)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | This is the exit check: the plugin's real driver, the real binary, no stub. Brief 26 closed on stub-green; this spec cannot.                                                                                                                                                                     |
| D15 | User ruling 2026-09-15 (build, red-check `unsanctioned-green`): the substrate commit `15d874e` already carries D12's `package.json` shape and a committed `dist/`, so AC-20260915-01-21 is a `SHALL CONTINUE TO` pin, not a new promise; the `package.json` row is verify-only. (AC-20260915-01-21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Honest about the pre-image; the test still guards the install path against later edits. Rejected: a `[pre-green:]` reason (none fits — the promise already landed).                                                                                                                              |
| D16 | User ruling 2026-09-15 (build, second opinion from Fable): the former AC-20260915-01-24 (`client open` prints `<url>/?client=replace-me`, and exits 2 with `remedy: npx mock-review serve` when serve is down) moves to spec 02. `mocks-driver.js` `cmdClientOpen` refuses outside state `CLIENT`, which needs every seed journey approved (`approval.journeys[j].approvedAt` + per-screen `approvedAt`) and `theme-picked`; no plugin verb writes `approvedAt`, so spec 01 could reach it only through a hand-written `approval.json` — a stand-in the Rationale forbids. Root `tsconfig.json` gains an `exclude` of both fixture hosts (they are typechecked per-host by `check`, never by the root program). [no-ac: records a scope move to spec 02 plus a build-config exclude whose only observable is `npm run typecheck` passing, which the gate itself executes]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Spec 02's page is the real writer of `approval.json`. Rejected: keeping the check with a hand-written approval file.                                                                                                                                                                             |
| D17 | Orchestrator ruling 2026-09-15 (build, D5 vs AC-8 conflict): the `render` finding message follows D5 verbatim — `<examples key>: <error.message>` (e.g. `Broken: boom`); a screen module that fails to import reports `module failed to load: <error.message>` (user ruling after a Fable second opinion — no colon-prefixed label an examples key could collide with); a loaded module without `meta` keeps D6's `meta: missing`; AC-20260915-01-8's former literal `Error: boom` was the defect and is amended. (AC-20260915-01-8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Decisions are authoritative over a worker's reading of an AC; the state name is what tells the author which example threw, matching D6's `meta: missing` pattern. Rejected: `String(error)` (drops the state).                                                                                   |
| D18 | Orchestrator ruling 2026-09-15 (build, gate): AC-20260915-01-14's "within 1 s" bounds the liveness probe, not the whole `check` run. Measured on the green fixture: `check --json` takes ~1.45 s with no portfile and ~1.45 s with a dead portfile, while `serveUrl` alone returns `null` in ~35 ms; a whole-command bound therefore measured pipeline startup, not liveness, and failed at ~2.3 s under suite load. (AC-20260915-01-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The promise D8 makes is "a dead server never stalls check"; timing the probe itself tests exactly that and is not load-sensitive. Rejected: widening the whole-command bound (would still flake and proves nothing about liveness).                                                              |
| D19 | Orchestrator ruling 2026-09-15 (review iteration 1, fixes s0–s3 + leg:reconcile). (a) Tests never write the committed `dist/`: `tests/setup.ts` compiles `tsconfig.build.json` into the gitignored `.test-dist/` (same layout as `dist/`) whenever `.test-dist/cli.js` is missing or any `src/**` file is newer than it, under an atomic `mkdir` lock so parallel test files build once; every CLI, e2e and schema test spawns `.test-dist/cli.js`, and the e2e bin link points at it. `tests/package/install.test.ts` keeps reading the real `package.json`/`npm pack`. (b) `src/cli.ts` loads each verb module with a dynamic `import()` inside its dispatch branch, so `contract` never loads Vite (D2). (c) `answer --decision` creates `design/decisions.json` only when the file is absent; a present file that fails to parse or validate is a refusal — exit 2, stderr `mock-review: design/decisions.json is invalid`, file left byte-identical, the note/journey untouched. (d) A screen module that fails to import yields exactly one `render` finding (`module failed to load: <msg>`) and no `meta: missing`. (AC-20260915-01-3, AC-20260915-01-8, AC-20260915-01-17, AC-20260915-01-22, AC-20260915-01-23)                                                                                                                                                                                                  | A clean checkout must test the source, not the committed stub, and the gate must not dirty the release artifact; the other three are the Decisions D2/D10/D17 applied literally. Rejected: rebuilding into `dist/` (every gate run dirties release output).                                      |

## File Plan

| Path                          | Action | Layer    | Summary                                                                                                                                                                                     |
| ----------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| package.json                  | MODIFY | other    | D12/D15: verify-only — the pre-image already carries D12's shape; touch only if a later wave needs a script or dependency change                                                            |
| README.md                     | MODIFY | other    | D12: install form, verbs, host layout, release steps (`npm run build`, commit `dist/`, `git tag -f v1`)                                                                                     |
| tsconfig.json                 | MODIFY | other    | D16: `exclude` `tests/fixtures/host/**` and `tests/fixtures/host-broken/**`                                                                                                                 |
| eslint.config.js              | MODIFY | other    | D19: add `.test-dist/**` to `ignores` next to `dist/**` (the test build is compiled output)                                                                                                 |
| .gitignore                    | MODIFY | other    | D13: `tests/fixtures/host/node_modules`, `tests/fixtures/host-broken/node_modules`, `design/.serve.json`; D19: `.test-dist/` and its build lock                                             |
| src/schemas/contract.ts       | CREATE | schemas  | D1: `ContractSchema` `{contractVersion: literal 1, package, version}`                                                                                                                       |
| src/schemas/config.ts         | CREATE | schemas  | D1: `ConfigSchema` `{name, port: int, targets:{viewports: string[], schemes: string[]}, theme: string\|null, client:{token}}` strict                                                        |
| src/schemas/check.ts          | CREATE | schemas  | D1/D5/D6/D7: `FindingSchema` (discriminated by `kind`, `severity` enum), `ScreenSchema`, `ShellSchema`, `JourneySchema`, `CheckSchema`                                                      |
| src/schemas/sweep.ts          | CREATE | schemas  | D1/D11: `InventoryRowSchema`, `QueueItemSchema`, `SweepSchema`                                                                                                                              |
| src/schemas/notes.ts          | CREATE | schemas  | D1: `ThreadEntrySchema {by, text}`, `NoteSchema` (passthrough, `project?: true`), `NotesSchema {contractVersion, notes, journeys: record {status, thread}}`                                 |
| src/schemas/approval.ts       | CREATE | schemas  | D1: `ApprovalSchema {contractVersion, screens: record {hash, approvedAt, states, viewports, schemes, screenshots}, journeys: record passthrough {approvedAt, client}, theme: string\|null}` |
| src/schemas/decisions.ts      | CREATE | schemas  | D1: `DecisionsSchema {contractVersion, decisions: [{screen: string\|null, text, at}]}`                                                                                                      |
| src/schemas/index.ts          | CREATE | schemas  | D1: re-exports; `EMPTY_NOTES`, `EMPTY_APPROVAL`, `EMPTY_DECISIONS` constants                                                                                                                |
| src/analysis/discover.ts      | CREATE | analysis | D3: `discoverHost(cwd)` → file lists + names; never `src/components/ui/**`, never `design/examples/**`                                                                                      |
| src/analysis/vite-runner.ts   | CREATE | analysis | D4: `withRunner(cwd, fn)` — creates the silent middleware server, hands `import(absPath)` to `fn`, always closes                                                                            |
| src/analysis/typecheck.ts     | CREATE | analysis | D5: `typeFindings(cwd)` via `ts.readConfigFile`/`parseJsonConfigFileContent`/`createProgram`/`getPreEmitDiagnostics`, filtered to `<cwd>/src/`                                              |
| src/analysis/imports.ts       | CREATE | analysis | D5/D6/D11: `importsOf(file)` via `ts.createSourceFile` import declarations (static, multi-line safe); `layerFindings(screens)`; `shellOf(screen)`; `usedOn(components, screens)`            |
| src/analysis/docs.ts          | CREATE | analysis | D5: `docFindings(files)` — JSDoc-above-export and `examples` named export via the TS AST                                                                                                    |
| src/analysis/screens.ts       | CREATE | analysis | D5/D6: `screenReport(cwd, runner)` → `screens[]`, `render`/`states`/`size` findings via `renderToString` per `examples` entry; sha256 hash; line count                                      |
| src/analysis/shells.ts        | CREATE | analysis | D6: `shellReport(runner)` → `shells[]` with `examples` keys                                                                                                                                 |
| src/analysis/journeys.ts      | CREATE | analysis | D7: `journeyReport(journeys, renderedDefault)` — `data-to` attribute search, reasons verbatim                                                                                               |
| src/analysis/config.ts        | CREATE | analysis | D5/D6: `loadConfig(cwd, runner)` → `{config, finding?}`                                                                                                                                     |
| src/analysis/liveness.ts      | CREATE | analysis | D8: `serveUrl(cwd)` — portfile + 500 ms ping, `null` on any error                                                                                                                           |
| src/analysis/inventory.ts     | CREATE | analysis | D11: `inventory(cwd, files)` — one docgen parser, one parse call                                                                                                                            |
| src/analysis/check.ts         | CREATE | analysis | D5–D8: `runCheck(cwd)` composes the above into a `Check` (zod-validated before return)                                                                                                      |
| src/files/json.ts             | CREATE | server   | D9: `readJson(path, schema)`, `writeJsonAtomic(path, obj)`, `ensureDesignFiles(cwd)`                                                                                                        |
| src/server/plugin.ts          | CREATE | server   | D8: `mockReview()` Vite plugin — `configureServer` middleware for `/__mock-review/ping` and the `/` stub page                                                                               |
| src/server/serve.ts           | CREATE | server   | D8: `startServe(cwd)` — createServer with the plugin, portfile write/cleanup, first-line URL                                                                                                |
| src/vite.ts                   | MODIFY | server   | D8: export `mockReview` from `src/server/plugin.ts`                                                                                                                                         |
| src/cli/args.ts               | CREATE | cli      | D2: `parseArgs(argv)` → `{verb, flags, json}`; `--json` anywhere                                                                                                                            |
| src/cli/io.ts                 | CREATE | cli      | D2: `printJson(obj)`, `fail(reason)` (stderr + exit 2)                                                                                                                                      |
| src/cli/contract.ts           | CREATE | cli      | D2: `contract` verb — reads the package version from `package.json` next to `dist/`, no host access                                                                                         |
| src/cli/check.ts              | CREATE | cli      | D5–D8: `check` verb — JSON and text forms (text: one line per finding `<severity> <kind> <file>: <message>`, then `ok`/`not ok`)                                                            |
| src/cli/sweep.ts              | CREATE | cli      | D11: `sweep` verb — JSON and text forms                                                                                                                                                     |
| src/cli/answer.ts             | CREATE | cli      | D10: `answer` verb                                                                                                                                                                          |
| src/cli/serve.ts              | CREATE | cli      | D8: `serve` verb                                                                                                                                                                            |
| src/cli.ts                    | MODIFY | cli      | D2: dispatch table; unknown verb → exit 2                                                                                                                                                   |
| src/index.ts                  | MODIFY | cli      | export schemas and `runCheck` for programmatic use                                                                                                                                          |
| tests/fixtures/contract.json  | CREATE | tests    | D1: byte copy of the plugin's `spec/templates/mock/contract.json`                                                                                                                           |
| tests/fixtures/host/**        | CREATE | tests    | D13: the committed green host (files listed in D13)                                                                                                                                         |
| tests/fixtures/host-broken/** | CREATE | tests    | D13: the red overlay host                                                                                                                                                                   |
| tests/setup.ts                | CREATE | tests    | D13: links `node_modules` into both fixture hosts; builds `dist/` once (`npm run build`)                                                                                                    |
| tests/helpers/cli.ts          | CREATE | tests    | runs `dist/cli.js` with a cwd, captures stdout/stderr/status; `requiredKeys(contract, verb)` walker mirroring `mock-cli.js` key-presence semantics                                          |
| tests/schemas/schemas.test.ts | CREATE | tests    | AC-20260915-01-1, AC-20260915-01-2                                                                                                                                                          |
| tests/cli/contract.test.ts    | CREATE | tests    | AC-20260915-01-3, AC-20260915-01-4                                                                                                                                                          |
| tests/cli/check.test.ts       | CREATE | tests    | AC-20260915-01-5, AC-20260915-01-6, AC-20260915-01-7, AC-20260915-01-8, AC-20260915-01-9, AC-20260915-01-10, AC-20260915-01-11, AC-20260915-01-12                                           |
| tests/cli/serve.test.ts       | CREATE | tests    | AC-20260915-01-13, AC-20260915-01-14                                                                                                                                                        |
| tests/cli/files.test.ts       | CREATE | tests    | AC-20260915-01-15                                                                                                                                                                           |
| tests/cli/answer.test.ts      | CREATE | tests    | AC-20260915-01-16, AC-20260915-01-17                                                                                                                                                        |
| tests/cli/sweep.test.ts       | CREATE | tests    | AC-20260915-01-18, AC-20260915-01-19, AC-20260915-01-20                                                                                                                                     |
| tests/package/install.test.ts | CREATE | tests    | AC-20260915-01-21                                                                                                                                                                           |
| tests/e2e/driver.test.ts      | CREATE | tests    | AC-20260915-01-22, AC-20260915-01-23                                                                                                                                                        |
| tests/cli.test.ts             | DELETE | tests    | superseded by tests/cli/contract.test.ts                                                                                                                                                    |

## Contracts

```ts
// src/schemas/check.ts (shape; zod in code)
type Severity = 'error' | 'warn'
type Finding =
  | {
      kind: 'type' | 'layer' | 'doc' | 'render' | 'config'
      severity: 'error'
      file: string
      message: string
    }
  | { kind: 'size' | 'twin' | 'states'; severity: 'warn'; file: string; message: string }
type Screen = {
  name: string
  file: string
  states: string[]
  shell: string | null
  hash: string
  lines: number
}
type Shell = { name: string; file: string; examples: string[] }
type Step = { screen: string }
type Edge = { from: number; to: number; label?: string }
type Journey = {
  id: string
  title: string
  steps: Step[]
  edges: Edge[]
  resolved: boolean
  unresolved: { from: number; to: number; reason: string }[]
}
type Config = {
  name: string
  port: number
  targets: { viewports: string[]; schemes: string[] }
  theme: string | null
  client: { token: string }
}
type NullConfig = { name: null; port: null; targets: null; theme: null; client: null }
type Check = {
  contractVersion: 1
  ok: boolean
  findings: Finding[]
  screens: Screen[]
  shells: Shell[]
  journeys: Journey[]
  themes: string[]
  config: Config | NullConfig
  serve: { url: string | null }
}

// src/schemas/sweep.ts
type InventoryRow = {
  name: string
  kind: 'component' | 'shell'
  props: Record<string, string>
  doc: string
  usedOn: string[]
}
type QueueItem = {
  kind: 'note' | 'journey'
  id: string
  screen: string | null
  state: string | null
  file: string
  line: number
  last: string
  reuse: string[]
}
type Sweep = { contractVersion: 1; inventory: InventoryRow[]; queue: QueueItem[] }

// src/schemas/notes.ts
type ThreadEntry = { by: string; text: string }
type Note = {
  id: string
  screen: string | null
  state: string | null
  component: string | null
  key: string | null
  snippet: string | null
  status: 'open' | 'answered' | 'approved'
  thread: ThreadEntry[]
  project?: true
}
type Notes = {
  contractVersion: 1
  notes: Note[]
  journeys: Record<string, { status: 'open' | 'answered' | 'approved'; thread: ThreadEntry[] }>
}

// src/schemas/approval.ts
type ScreenApproval = {
  hash: string
  approvedAt: string
  states: string[]
  viewports: string[]
  schemes: string[]
  screenshots: string[]
}
type JourneyApproval = {
  approvedAt: string | null
  client: 'ok' | 'waived' | null
  [k: string]: unknown
}
type Approval = {
  contractVersion: 1
  screens: Record<string, ScreenApproval>
  journeys: Record<string, JourneyApproval>
  theme: string | null
}

// src/schemas/decisions.ts
type Decisions = {
  contractVersion: 1
  decisions: { screen: string | null; text: string; at: string }[]
}

// portfile design/.serve.json
type Portfile = { url: string; pid: number }
```

CLI grammar (D2): `mock-review <verb> [flags]`, verbs `contract | check | sweep | answer | serve`;
`--json` anywhere; `answer` flags `--note <id>`, `--journey <id>`, `--text <t>`, `--decision <d>`.
`check --look` is spec 02 and exits 2 `mock-review: --look lands in spec 02` here.

Fixture host `tests/fixtures/host/src/journeys.ts`:

```ts
export const journeys: Journey[] = [
  {
    id: 'first-visit',
    title: 'First visit',
    steps: [{ screen: 'home' }, { screen: 'account' }],
    edges: [{ from: 0, to: 1, label: 'Account' }],
  },
]
```

## Behavior

`check` order: ensure design files (D9) → discover (D3) → config (D5) → open runner (D4) → screens,
shells, journeys (D6/D7) → close runner → type pass (D5, in parallel with the runner phase is
allowed) → layer, doc, size, states → liveness (D8) → validate with `CheckSchema` → print. A
runner failure that is not per-state (Vite cannot start, `vite.config.ts` missing) is one `config`
finding with `file: 'vite.config.ts'` and the report still prints with empty screens/shells/journeys.

`serve` keeps running until a signal; on `SIGINT`/`SIGTERM` it removes the portfile, closes the
server and exits 0. A stale portfile (dead pid, no ping) is simply overwritten by the next `serve`.

`sweep` text output never mixes with the JSON form; `--json` wins when present.

## Acceptance Criteria

- **AC-20260915-01-1**: WHEN `CheckSchema.safeParse` receives the green fixture's `check --json` output THE SYSTEM SHALL return `success: true`, and WHEN it receives that output with `findings[0].severity` set to `"fatal"` THE SYSTEM SHALL return `success: false` with an issue path `findings.0.severity` → writes tests/schemas/schemas.test.ts
- **AC-20260915-01-2**: WHEN each of `contract --json`, `check --json`, `sweep --json` runs on the green fixture host THE SYSTEM SHALL produce an object in which every key listed under `tests/fixtures/contract.json` `shapes.<verb>.required`, every `<array>[]` element key list and every `<map>{}` value key list is present (null counting as present), and the same walker over `design/notes.json`, `design/approval.json` and `design/decisions.json` after `answer --decision` SHALL find every `shapes.notes|approval|decisions` key → writes tests/schemas/schemas.test.ts
- **AC-20260915-01-3**: WHEN `dist/cli.js contract --json` runs in an empty directory THE SYSTEM SHALL exit 0 with stdout exactly `{"contractVersion":1,"package":"@555/mock-review","version":"<package.json version>"}\n` and empty stderr, and WHEN `dist/cli.js --json contract` runs THE SYSTEM SHALL print the same; and WHEN `contract --json` runs from a copy of the built CLI whose `node_modules` cannot resolve `vite` THE SYSTEM SHALL still exit 0 with that stdout (D19) → writes tests/cli/contract.test.ts
- **AC-20260915-01-4**: WHEN `dist/cli.js frobnicate` runs THE SYSTEM SHALL exit 2 with stderr starting `mock-review: unknown verb frobnicate` and empty stdout, and WHEN `check --json` runs on the green fixture host THE SYSTEM SHALL write stdout that `JSON.parse` accepts as a whole (no leading `[vite]` line) → writes tests/cli/contract.test.ts
- **AC-20260915-01-5**: WHEN `check --json` runs on the green fixture host THE SYSTEM SHALL list `screens[].name` = `["account","home"]` (sorted), `shells[].name` = `["ConsoleShell"]`, `themes` = `["nova"]`, and no screen or finding whose `file` starts with `design/examples/` or `src/components/ui/` → writes tests/cli/check.test.ts
- **AC-20260915-01-6**: WHEN `check --json` runs on the green fixture host THE SYSTEM SHALL report `config` = `{"name":"app","port":5180,"targets":{"viewports":["360x800","1280x800"],"schemes":["light","dark"]},"theme":null,"client":{"token":"replace-me"}}` (loaded through the Vite runner from `mock.config.ts`) → writes tests/cli/check.test.ts
- **AC-20260915-01-7**: WHEN `check --json` runs on the broken fixture host THE SYSTEM SHALL report `ok: false` and findings containing `{"kind":"layer","severity":"error","file":"src/screens/home.tsx","message":"imports @/lib/utils"}`, `{"kind":"doc","severity":"error","file":"src/components/Badge.tsx","message":"missing doc line"}`, and a `type` error finding for `src/screens/account.tsx` whose message starts `TS2322:` → writes tests/cli/check.test.ts
- **AC-20260915-01-8**: WHEN `check --json` runs on the broken fixture host THE SYSTEM SHALL report a finding `{"kind":"render","severity":"error","file":"src/screens/account.tsx","message":"<that state's examples key>: boom"}` (D5's `<state>: <error.message>`; D17) for the state whose example throws, and every other state's absence of a finding; and WHEN a screen module throws on import THE SYSTEM SHALL report exactly one `render` finding for that file, `module failed to load: <error.message>` (D17, D19) → writes tests/cli/check.test.ts
- **AC-20260915-01-9**: WHEN `check --json` runs on the broken fixture host THE SYSTEM SHALL report `{"kind":"config","severity":"error","file":"mock.config.ts","message":<first line of the zod pretty error>}` and `config` = `{"name":null,"port":null,"targets":null,"theme":null,"client":null}` (the host's config lacks `client`) → writes tests/cli/check.test.ts
- **AC-20260915-01-10**: WHEN `check --json` runs on the green fixture host after appending 140 blank lines to `src/screens/home.tsx` and adding `"ghost"` to its `meta.states` in a scratch copy THE SYSTEM SHALL report `ok: true` with findings `{"kind":"size","severity":"warn","file":"src/screens/home.tsx","message":"<n> lines"}` (n > 150) and `{"kind":"states","severity":"warn","file":"src/screens/home.tsx","message":"state ghost has no example"}` and no `twin` finding → writes tests/cli/check.test.ts
- **AC-20260915-01-11**: WHEN `check --json` runs on the green fixture host THE SYSTEM SHALL report for `home` `states` = `["default","empty"]`, `shell` = `"ConsoleShell"`, `hash` = the sha256 hex of `src/screens/home.tsx`'s bytes, `lines` = its line count, and `shells[0].examples` = `["Default"]`; and WHEN one character of `home.tsx` changes in a scratch copy THE SYSTEM SHALL report a different `hash` → writes tests/cli/check.test.ts
- **AC-20260915-01-12**: WHEN `check --json` runs on the green fixture host THE SYSTEM SHALL report `journeys` = one entry `id: "first-visit"` with `resolved: true` and `unresolved: []`; WHEN the same host's `home.tsx` has its `data-to="Account"` attribute removed in a scratch copy THE SYSTEM SHALL report `resolved: false`, `unresolved: [{"from":0,"to":1,"reason":"no control with data-to=\"Account\" on home"}]` and `ok: true` (no finding) → writes tests/cli/check.test.ts
- **AC-20260915-01-13**: WHEN `dist/cli.js serve` starts on the green fixture host THE SYSTEM SHALL print as its first stdout line a URL without a trailing slash, write `design/.serve.json` = `{"url":<that url>,"pid":<its pid>}`, answer `GET <url>/__mock-review/ping` with 200 `{"ok":true,"pid":<pid>}` and `GET <url>/` with 200 HTML containing `reviewer page lands in spec 02`; WHEN it receives `SIGTERM` THE SYSTEM SHALL remove `design/.serve.json` and exit 0 → writes tests/cli/serve.test.ts
- **AC-20260915-01-14**: WHEN `check --json` runs while that `serve` is up THE SYSTEM SHALL report `serve.url` equal to the portfile url; WHEN it runs after `serve` exited THE SYSTEM SHALL report `serve.url: null`; WHEN a portfile names a port nothing listens on THE SYSTEM SHALL report `null`, and the liveness probe (`serveUrl(cwd)`) SHALL return `null` within 1 s (D18) → writes tests/cli/serve.test.ts
- **AC-20260915-01-15**: WHEN `check --json` runs on a scratch host with no `design/` directory THE SYSTEM SHALL create `design/notes.json` = `{"contractVersion":1,"notes":[],"journeys":{}}` and `design/approval.json` = `{"contractVersion":1,"screens":{},"journeys":{},"theme":null}`; WHEN it runs again after `approval.json` was edited THE SYSTEM SHALL leave it byte-identical; and `writeJsonAtomic` SHALL leave no `*.tmp` file behind → writes tests/cli/files.test.ts
- **AC-20260915-01-16**: WHEN `answer --note N1 --text "moved it"` runs on a host whose `notes.json` has note `N1` with `status: "open"` and an empty thread THE SYSTEM SHALL exit 0 printing `answered N1`, and `notes.json` SHALL show `N1` with `status: "answered"` and `thread: [{"by":"session","text":"moved it"}]`, every other byte of the file's other notes unchanged; WHEN `answer --journey first-visit --text "ok"` runs on a host whose `notes.journeys["first-visit"]` is `{"status":"open","thread":[]}` THE SYSTEM SHALL flip it to `answered` with that thread entry → writes tests/cli/answer.test.ts
- **AC-20260915-01-17**: WHEN `answer --note N1 --text "use the card" --decision "cards, not tables"` runs THE SYSTEM SHALL append `{"screen":"home","text":"cards, not tables","at":<ISO timestamp>}` to `design/decisions.json` (created if absent); WHEN `answer --note NOPE --text x` runs THE SYSTEM SHALL exit 2 with stderr `mock-review: no note NOPE`; WHEN `answer --text x` runs with neither target THE SYSTEM SHALL exit 2; WHEN `design/decisions.json` exists but fails the decisions schema and `answer --note N1 --text x --decision d` runs THE SYSTEM SHALL exit 2 with stderr `mock-review: design/decisions.json is invalid` and leave both `decisions.json` and `notes.json` byte-identical (D19) → writes tests/cli/answer.test.ts
- **AC-20260915-01-18**: WHEN `sweep --json` runs on the green fixture host THE SYSTEM SHALL report `inventory` containing `{"name":"ConsoleShell","kind":"shell","props":{...},"doc":"The console shell with sidebar and header.","usedOn":["account","home"]}` and `{"name":"WalletSummary","kind":"component","props":{"balance":"number","currency":"string"},"doc":"Shows the wallet balance.","usedOn":["home"]}`, and complete in under 5 s → writes tests/cli/sweep.test.ts
- **AC-20260915-01-19**: WHEN `sweep --json` runs on a host whose `notes.json` has open note `N1` (screen `home`, state `default`, component `WalletSummary`), answered note `N2`, and `journeys["first-visit"]` open with thread `[{"by":"client","text":"add a back link"}]` THE SYSTEM SHALL report `queue` = `[{"kind":"journey","id":"first-visit","screen":null,"state":null,"file":"src/journeys.ts","line":<line of id: 'first-visit'>,"last":"add a back link","reuse":[]},{"kind":"note","id":"N1","screen":"home","state":"default","file":"src/screens/home.tsx","line":<first line containing <WalletSummary>,"last":"","reuse":[<component names not used on home>]}]` and no entry for `N2` → writes tests/cli/sweep.test.ts
- **AC-20260915-01-20**: WHEN `sweep` (text) runs on a host with no open items THE SYSTEM SHALL print exactly one line `queue empty`; WHEN it runs on the AC-19 host THE SYSTEM SHALL print the inventory lines first, a blank line, then `## src/journeys.ts` before `## src/screens/home.tsx`, and a line starting `[journey] first-visit` before any `[note]` line → writes tests/cli/sweep.test.ts
- **AC-20260915-01-21**: WHEN `package.json` is read THE SYSTEM SHALL CONTINUE TO list `zod`, `react-docgen-typescript` and `typescript` (range `~6.0.0`) under `dependencies`, `react`, `react-dom`, `vite` under `peerDependencies`, `playwright` under `peerDependencies` with `peerDependenciesMeta.playwright.optional: true`, `bin["mock-review"]` = `dist/cli.js`, `files` = `["dist"]`, no `prepare` script; and WHEN `npm pack --dry-run --json` runs THE SYSTEM SHALL CONTINUE TO list `dist/cli.js` → writes tests/package/install.test.ts
- **AC-20260915-01-22**: WHEN `tests/setup.ts` has run THE SYSTEM SHALL have `.test-dist/cli.js` compiled from the current `src/` (rebuilt when missing or older than any `src/**` file; the committed `dist/` untouched, D19) and `tests/fixtures/host/node_modules` resolving `react`, `vite`, `@/components/ui/button` (through the host `vite.config.ts` alias) so that `check --json` on the fixture reports `ok: true` → writes tests/e2e/driver.test.ts
- **AC-20260915-01-23** `[env: SPEC_PLUGIN_ROOT]`: WHEN the fixture host is copied to `<scratch>/app`, `<scratch>/app/node_modules/.bin/mock-review` links to the test build's `cli.js` (`.test-dist/cli.js`, D19), `<scratch>/design/mocks/seed.md` declares `- customers` and `### first-visit`, and `node $SPEC_PLUGIN_ROOT/spec/scripts/mocks-driver.js --root <scratch>` runs `--mark seed-done`, then `--mark shell-drawn`, then `--mark journey-drawn --journey first-visit` THE SYSTEM SHALL exit 0 on each and `<scratch>/design/mocks/status.json` SHALL show `marks.seedDone`, `marks.shellDrawn` and `marks.journeys["first-visit"].drawn` set → writes tests/e2e/driver.test.ts

## Assumptions (escalation triggers)

- A1: Vite 8.3.0 `server.environments.ssr.runner.import()` loads a host `.tsx` screen with `@/` resolution and `renderToString` yields markup — **executed 2026-09-15** (spike a: `{"hasEnvRunner":true,"envRunner":{"ok":true,…"html":"<div data-component=\"Home\">…"}}`; a throwing state rejected with `Error: boom`). — **if false:** fall back to `server.ssrLoadModule` (also executed green in the same spike).
- A2: With `logLevel` unset Vite prints `[vite] (ssr) connected.` on **stdout** — **executed 2026-09-15** (spike a). — **if false:** keep `logLevel: 'silent'` anyway; D2 stands.
- A3: `react-docgen-typescript@2.4.0` `withCustomConfig('<host>/tsconfig.app.json')` returns `description` from the `/** */` line and typed props — **executed 2026-09-15** (spike b: `"description":"The console home screen.","props":{"title":{"type":"string"…}}`, 678 ms for two files). — **if false:** STOP, ask the user (inventory is contract-mandated).
- A4: `ts.parseJsonConfigFileContent` on `tsconfig.app.json` + `createProgram` + `getPreEmitDiagnostics` reports `TS2322` at file/line/col for `src/**` — **executed 2026-09-15** (spike c). — **if false:** shell out to `tsc -p tsconfig.app.json --noEmit --pretty false` and parse lines.
- A5: zod 4.6.5 `.strict()`, `z.discriminatedUnion('kind', …)`, `z.prettifyError` — **executed 2026-09-15** (spike d). — **if false:** pin zod to the executed version.
- A6: `npm i -D git+file://<repo>#v1` with a committed `dist/` and no `prepare` yields `node_modules/.bin/mock-review` → `dist/cli.js` invocable through `mock-cli.js`'s PATH-prepend — **executed 2026-09-15** (spike e: `status 0`, pure-JSON stdout; `playwright` skipped as optional peer). — **if false:** STOP, ask the user (install path is a fixed decision).
- A7: leaving `typescript` in devDependencies lets npm install TypeScript 7.0.2 into the host through docgen's open peer; pinning `~6.0.0` in `dependencies` yields 6.0.3 — **executed 2026-09-15** (spike e re-run). — **if false:** keep the pin; harmless.
- A8: `port: 0` + `resolvedUrls.local[0]` (trailing slash) + portfile + 500 ms ping from another process; dead port throws a fetch `TypeError` — **executed 2026-09-15** (spike f). — **if false:** probe with `net.connect` instead of fetch.
- A9: sha256 of file bytes flips on a one-character edit — **executed 2026-09-15** (spike g). — **if false:** impossible by construction.
- A10: The plugin's `mocks-driver.js` `--mark seed-done` requires only the contract call, `## Records` entities present as `src/records/<entity>.ts` and `mock.config.ts` (per `docs/research/plugin-requirements.md` §A.1, C.1, C.5) — **if false:** read `mocks-driver.js:311-334` and extend the fixture seed; never stub the binary.
- A11: The shebang `#!/usr/bin/env node` resolves under a real session's PATH; it fails only under `mock-cli.js`'s bare `/bin:/usr/bin` fallback on this machine (spike e, Surprise 2) — **if false** (a real session hits 127): the plugin's fallback PATH must include `dirname(process.execPath)` — a plugin-side fix, queued, never a package workaround.

## Rationale

The plugin was built and merged against a stub of this CLI, so this spec's exit criterion is the
plugin's real driver on a real host with the built binary (D14): nothing here may be judged
green through a stand-in. Critical tier because every JSON shape is a contract surface another
repo parses with zero tolerance, and the install path is boot-path code for every future
product.

D4 chooses Vite as the single loader because the host's own `vite.config.ts` already knows the
`@/` alias, Tailwind and React; a second pipeline would drift from it. Rendering with
`renderToString` catches throwing states cheaply; layout-dependent judgment is the human's on
the served page (doctrine § Look and Serve), so Playwright stays out of `check --json`.

D7 departs from the Fable ruling (`via: {component, text}`): the plugin's seed template already
tells authors to put `data-to="<label>"` on the control that leads to the next step, and an
attribute search in SSR HTML needs no DOM library and no plugin template change. The runtime
guide in spec 02 uses the same attribute, so both halves agree by construction.

D11's `reuse` is deterministic on purpose: the components a screen does not yet use are the
candidates worth reaching for; fuzzy text matching would be a guess dressed as a hint. `twin`
is stubbed, per the ruling, because import-set similarity is a heuristic with no consumer yet.

No `SHALL CONTINUE TO` pin: greenfield package, nothing pre-existing to protect. Two specs
(this and 02) rather than one: JJ's call on 2026-09-15 after the split was proposed at the
browser boundary, where the test runtime changes.

Fragile: `check` time on a large host (program creation ~0.5 s, runner start ~0.5 s) — watch it
during the e2e test; a slow check is a warning to record, never a reason to cache across runs.

Build departures folded at close (2026-09-15, one-offs):

- The green fixture adds `src/components/WalletSummary.tsx`, which D13 does not list, because AC-18
  asserts it.
- Each test file calls `ensureFixtures()` from `tests/setup.ts` in its own `beforeAll`, instead of
  vitest `setupFiles`.
- CLI tests run on scratch copies of the fixtures, so the committed fixtures stay byte-stable.
- `FindingSchema` discriminates on `severity`, with a `kind` enum per branch. It accepts the same
  shapes as the Contracts union.
- `serve` creates Vite without a port and adds `appType: 'custom'`, because the hosts have no
  `index.html`. It reads `mock.config.ts` through `ssrLoadModule`, then calls `listen(port)`, and
  falls back to Vite's default port when the config is invalid. The review recorded this as
  advisory.
- Review iteration 1 fixed four problems under D19:
  - a stale or stub test binary;
  - `contract` loading Vite;
  - `answer` wiping an invalid `decisions.json`;
  - a double finding on screen import failure.
- The fix-delta pass closed CLEAN. Seven advisory findings are recorded in the run ledger
  (`rv_c55342b11c4b`), not dispositioned.

## Canonical Delta

Creates `docs/canonical/package.md`: the verb table (argv, stdout, exit codes), the file layer
(`design/notes.json`, `approval.json`, `decisions.json`, `.serve.json` — who writes what), the
check pipeline order, the finding kinds with their exact messages, and the release procedure
(`npm run build` → commit `dist/` → `git tag -f v1` → push tags).
