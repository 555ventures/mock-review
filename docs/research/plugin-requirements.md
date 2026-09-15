# Requirements for `@555/mock-review` (contract v1) — exhaustive, cited

Every citation is `path:line` in `~/projects/claude-plugins`. Produced 2026-09-15 by a read-only investigation of the plugin after specs 20260914/01–03 merged.

---

## A. Every CLI invocation the plugin makes

### A.0 Spawn mechanics (binding, D2)
Only `spec/scripts/lib/mock-cli.js` spawns the package on the plugin's behalf.

- `spawnSync('mock-review', [verb, ...args], { cwd: appDir, shell: false, encoding: 'utf8', env })` — `spec/scripts/lib/mock-cli.js:73-78`.
- `env.PATH = <appDir>/node_modules/.bin + path.delimiter + (process.env.PATH || '/usr/bin:/bin')` — `spec/scripts/lib/mock-cli.js:64-68`. So the bin **must** be installed as `node_modules/.bin/mock-review` by an install in the app dir (`spec/scripts/mocks-driver.js:624`, `spec/doctrine/mocks.md:122`).
- Because PATH may be bare `/bin:/usr/bin`, the shebang must be `#!/usr/bin/env node` — the comment at `spec/scripts/lib/mock-cli.js:59-63` calls out the hazard. No shell features (`shell: false`).
- `appDir` = `path.join(root, status.app)`, `status.app` default `"app"` — `spec/scripts/mocks-driver.js:195`, `160-164`.
- ENOENT on spawn → plugin exits 2 with `mock-review not found — remedy: npm i -D @555/mock-review` (`spec/scripts/lib/mock-cli.js:81-83`, `141`).
- Every JSON verb is invoked as `mock-review <verb> [...args] --json` — **`--json` is appended last** (`spec/scripts/lib/mock-cli.js:139`).
- **stdout of a JSON verb must be pure JSON** — `JSON.parse(r.stdout)` with no stripping (`spec/scripts/lib/mock-cli.js:146`). Any banner/progress line breaks the plugin (exit 2, `147-150`). Diagnostics go to stderr.
- The plugin **ignores the exit status** of `contract` and `check`: it only looks at `r.error` and parses stdout (`spec/scripts/lib/mock-cli.js:140-152`). Print valid JSON, exit 0.

### A.1 `mock-review contract --json`
- argv `["contract","--json"]`; cwd `<root>/<status.app>`. Consumed by `contractOrDie()` — `spec/scripts/lib/mock-cli.js:158-166`.
- Called before every driver command once `marks.seedDone` is set (`spec/scripts/mocks-driver.js:704`); first line of every mark handler (`:312`, `:340`, `:362`, `:390`, `:433`, `:456`, `:571`); genesis `--mark skeleton-landed` when the mock app exists (`spec/scripts/genesis-driver.js:1553-1555`); `/spec:sketch` setup and run design-stage preflight (`spec/commands/sketch.md:29`, `spec/doctrine/stages/stage-design.md:47`).
- Never called while `marks.seedDone` is null (`spec/scripts/mocks-driver.js:701-704`).
- Refusal: `reported.contractVersion !== template.contractVersion` → exit 2, stderr `contract <reported> ≠ <template> — remedy: npm i -D @555/mock-review@<template.contractVersion>` (`spec/scripts/lib/mock-cli.js:161-164`; pinned by `tests/mocks/mock-cli.test.js:27-30`). Template value: `1`. **The package major must equal `contractVersion`.**

### A.2 `mock-review check --json`
- argv `["check","--json"]`; cwd app dir. `checkJson()` — `spec/scripts/lib/mock-cli.js:170-172`. Re-run per mark, never memoized.
- Consumed at `--mark shell-drawn` (`:341`), `journey-drawn` (`:369`), `journey-approved` (`:393`), `theme-picked` (`:438`), `client open` (`:574`), genesis `skeleton-landed` (`genesis-driver.js:1556`), run design stage preflight step 6 and screen-hash rule (`stage-design.md:43-47`), `/spec:sketch` exit (`sketch.md:103-107`).

### A.3 `mock-review check` (text form)
- Session-run: `npx mock-review check` — `spec/commands/mocks.md:56-57`, `spec/commands/sketch.md:94`. Human-readable findings.

### A.4 `mock-review check --look <screen> [--state <s>]`
- The only sanctioned screenshot path: `spec/doctrine/mocks.md:167-171`; replacement text the retired `look|look-probe|look-via` verbs print (`spec/scripts/mocks-driver.js:135-137`). Session-only.

### A.5 `mock-review sweep [--json]`
- Session-only (`spec/commands/mocks.md:55`, `spec/commands/sketch.md:66,98`, `spec/doctrine/mocks.md:183-187`). The driver never reads it (`spec/scripts/mocks-driver.js:51`).
- Both text and `--json` forms exist (contract `spec/templates/mock/contract.json:30-34`).

### A.6 `mock-review answer (--note <id> | --journey <id>) --text <t> [--decision <d>]`
- Session-only (`spec/doctrine/mocks.md:178-179`, `spec/commands/sketch.md:70,76`). Exit 0; no stdout contract pinned.

### A.7 `mock-review serve`
- Session-only. Prints the URL on its first stdout line (stub: `tests/mocks/mock-app-fixtures.js:154-155`).
- Started as a **tracked background task** at SEED and kept up through SHELL/SCREENS/THEME; in CLIENT it is the user's own terminal process (`spec/doctrine/mocks.md:158-164`, `spec/commands/mocks.md:70`).
- Its liveness makes `check --json`'s `serve.url` non-null.

### A.8 Exit codes the plugin cares about
| Case | plugin behavior |
|---|---|
| spawn ENOENT | exit 2, install remedy — `mock-cli.js:141` |
| any other spawn `error` | exit 2 — `mock-cli.js:142` |
| non-JSON stdout on a `--json` verb | exit 2 naming the verb + first 200 chars — `mock-cli.js:147-150` |
| JSON missing a contract-required key | exit 2 `<verb> --json response is missing "<path>"` — `mock-cli.js:96-98` |
| `contractVersion` mismatch | exit 2 — `mock-cli.js:161-164` |
| verb's own nonzero exit with valid JSON | **not checked** |

---

## B. JSON shape per verb

Validation is key-presence only, per object / array element / map value; `null` counts as present; no type checks (`mock-cli.js:14-17`, `87-94`, `103-134`). The driver's reads impose real types:

### B.1 `contract --json`
`{contractVersion: 1 (number, compared with !==), package: "@555/mock-review", version: "<semver>"}`. Reference: `tests/mocks/mock-app-fixtures.js:199`.

### B.2 `check --json`
Required top-level: `contractVersion, ok, findings, screens, shells, journeys, themes, config, serve`. Reference green object: `tests/mocks/mock-app-fixtures.js:202-215`.

- **`ok: boolean`** — `ok === !findings.some(f => f.severity === "error")`. Driver refuses on `!ok` at `shell-drawn` (`mocks-driver.js:343-347`); genesis at `skeleton-landed` (`genesis-driver.js:1557-1564`); design-stage preflight requires `ok: true`.
- **`findings[]`** `{kind, severity, file, message}`. `severity` ∈ `"error"|"warn"`; only the literal `"error"` is filtered. Error kinds: `type` (TS error), `layer` (import outside allowed layers), `doc` (project component/shell without doc line or `examples`), `render` (a screen state that throws), `config` (invalid `mock.config.ts`). Warn kinds: `size` (screen past 150 lines), `twin` (component whose shadcn imports match another's), `states` (screen missing a state the seed requires). Warns never flip `ok`, never refuse a mark. An unresolved journey edge is never a finding. `file`+`message` are printed verbatim in refusals.
- **`screens[]`** `{name, file, states, shell, hash, lines}`. `name` = key of `approval.screens[<name>]` and of the look URL `<serve.url>/#/<screen>`. `hash` is the drift oracle: preflight requires `approval.screens[n].hash === check.screens[n].hash`, else STOP "changed since approval" (`stage-design.md:43-46`); must change on any edit. `states` = the screen's exported `meta.states`. `shell`, `lines`: required keys, no driver read.
- **`shells[]`** `{name, file, examples}`. `shell-drawn` requires `check.shells.some(s => Array.isArray(s.examples) && s.examples.length > 0)` (`mocks-driver.js:348-351`) — array of example names, e.g. `["Default"]`.
- **`journeys[]`** `{id, title, steps, edges, resolved, unresolved}`. `id` matched against the seed's `### <journey>` names (`mocks-driver.js:370`, `394`). `steps`: array of `{screen}` — driver maps `steps.map(s => s.screen)` and requires each approved (`:401-407`). `resolved: boolean` — `journey-drawn` refuses unless truthy (`:374`). `unresolved[]` `{from: number, to: number, reason: string}` printed as `step <from> → <to>: <reason>` (`:375`); reference reason `no control with text "Account" in ConsoleShell`.
- **`themes`** — array of keys from `src/themes/*.css` (basename without `.css`); `theme-picked` requires `check.themes.includes(approval.theme)` (`:442-444`).
- **`config`** `{name, port, targets:{viewports[], schemes[]}, theme: string|null, client:{token}}` mirroring `mock.config.ts`. `theme-picked` requires `check.config.theme === approval.theme` (`:439-441`). `client open` builds `<serve.url>/?client=<config.client.token>` (`:576-577`).
- **`serve`** `{url: string|null}` — `null` exactly when no `serve` process runs for this app. `client open` refuses on null with `remedy: npx mock-review serve` (`:575`). **No trailing slash** (driver concatenates `url + '/?client=' + token`).

### B.3 `sweep --json`
`{contractVersion, inventory[]: {name, kind, props, doc, usedOn}, queue[]: {kind, id, screen, state, file, line, last, reuse}}`. Empty default: `{"contractVersion":1,"inventory":[],"queue":[]}`. No plugin script parses it.

### B.4–B.6 `notes`, `approval`, `decisions`
File shapes (§C). Declared under `shapes` but never validated by `mock-cli.js`; the package is the sole guarantor.

---

## C. Host-side files

App dir = `<root>/<status.app>` (default `app`). `design/mocks/` (status/seed/ledger) stays at the repo root and is driver-owned.

### C.1 `mock.config.ts` (app root)
Copied at SEED from `spec/templates/mock/mock.config.ts`. Shape: `export default { name: string, port: number, targets: { viewports: string[], schemes: string[] }, theme: string|null, client: { token: string } }`. Read by the package → `check.config`; invalid = `config` error finding. Written once by the session at SEED; `theme` edited by the session at THEME. Package never writes it. Genesis uses its existence as "the mock app exists" (`genesis-driver.js:694`).

### C.2 `src/screens/*.tsx`
Session-authored. Each exports `meta = { name, states: string[] }` plus the component and an `examples` map (`spec/templates/mock/screen.example.tsx:10-14,35-40`). Import allow-list (enforced as `layer` findings): `react`, `@/components/ui`, `@/components`, `@/shells`, `@/records` (`spec/skills/mock-authoring/SKILL.md:13-15`; `spec/doctrine/design.md:17-23`). Package reads them for `check.screens[]`, `--look`, and routes `#/<screen>`.

### C.3 `src/shells/*.tsx`, `src/components/*.tsx`
One `/** … */` doc line above the export and a named `examples` export; missing either = `doc` error; the sweep inventory is built from them (`SKILL.md:16-18`; `spec/doctrine/mocks.md:221-225`).

### C.4 `src/journeys.ts`
Copied from `spec/templates/mock/journeys.ts`. Types: `Step = { screen: string }`, `Edge = { from: number; to: number; label?: string }`, `Journey = { id; title; steps: Step[]; edges: Edge[] }`, `export const journeys: Journey[] = []` (`:4-30`). Empty array must be valid.

### C.5 `src/records/*.ts`, `src/themes/*.css`
Records: typed arrays, one file per seed `## Records` entity; driver verifies existence at `seed-done` (`mocks-driver.js:319-324`). Themes: `src/themes/<k>.css`; `<k>` appears in `check.themes`.

### C.6 `design/examples/` — **must be outside every host glob**
`design/examples/screen.example.tsx`, `design/examples/records.example.ts`. Pinned by `tests/mocks/mock-contract.test.js:45-52`. Never list these as a screen or records file.

### C.7 `design/notes.json` — package-owned
```
{ contractVersion: 1,
  notes: [ { id, screen, state, component, key, snippet, status, thread[], project?: true } ],
  journeys: { "<journeyId>": { status, thread[] } } }
```
- `thread[]` `{by, text}`. `status` ∈ `open` (red, session's turn) | `answered` (yellow) | `approved` (blue).
- `project: true` is optional but load-bearing: driver filters `n.project === true` (`mocks-driver.js:413`, `468`); a project note has `screen/state/component/key/snippet` all `null`.
- Writers: package UI (raise/approve/reject/delete), package CLI `answer` (open → answered). Never the plugin, never hand-edited; only the page's own controls end a note (`mocks.md:178-181`).
- Readers: driver `readNotesRaw()` (`mocks-driver.js:264-269`) at `journey-approved` (`:408-420`) and `approved` (`:465-469`); `genesis-driver.js:696,708-717`.
- **Must exist** (missing → throw → exit 2). Package creates `{contractVersion:1,notes:[],journeys:{}}` at first serve/init.

### C.8 `design/approval.json` — package-owned (one narrow plugin write)
```
{ contractVersion: 1,
  screens:  { "<name>": { hash, approvedAt, states, viewports, schemes, screenshots } },
  journeys: { "<id>":   { approvedAt, client } },
  theme: string|null }
```
- `screens[<name>].hash` must equal `check.screens[<name>].hash` at approval; `approvedAt` ISO, truthiness-tested (`mocks-driver.js:398`, `404`). `journeys[<id>].client` ∈ `"ok"|"waived"|null` — `"ok"` written by the client's confirm control on the page (`mocks.md:203-205`). `theme`: picked on the page (`:436-437`).
- Writers: package UI; the plugin writes **only** `journeys[<j>] = {…, client: "waived", reason, at}` via `client waive` (`mocks-driver.js:581-592`) — extra keys `reason`, `at` must be tolerated and preserved.
- Readers: driver at `journey-approved`/`theme-picked`/`approved`/`client waive`; genesis journey count off `Object.keys(approval.journeys)` (`genesis-driver.js:703-707`); design-stage preflight; `/spec:sketch` exit; `/spec:plan` UI-brief check (`spec/commands/plan.md:30-32`).
- Must exist. Default `{contractVersion:1,screens:{},journeys:{},theme:null}`. `--reopen` leaves it byte-identical.

### C.9 `design/decisions.json` — package-owned, plugin-unread
`{ contractVersion, decisions: [ { screen, text, at } ] }`. Written on `answer --decision <d>`. Nothing in the plugin reads it.

### C.10 Driver-owned files the package must NOT touch
`design/mocks/status.json`, `design/mocks/seed.md`, `design/mocks/ledger.md` at the repo root.

---

## D. What `serve` must do

- Prints the served URL on its first stdout line, no trailing slash. Default port 5180 from `mock.config.ts`.
- Long-lived dev server; while alive `check --json`'s `serve.url` is that URL, else `null`.
- Routes `<url>/#/<screen>` per screen.
- Reviewer UI: (1) screens/states browsing across `config.targets.viewports × schemes`, **approve** writing `approval.screens[<name>] = {hash, approvedAt, states, viewports, schemes, screenshots}` with the same hash `check` reports; (2) note raising anchored to `{screen, state, component, key, snippet}`, with a `project: true` option, into `design/notes.json`; (3) approve/reject/delete on notes and journey conversations — only the page may end a note; (4) journey approval writing `approval.journeys[<id>].approvedAt`; (5) theme pick writing `approval.theme`; (6) Components page (docgen inventory), session-only.
- **`?client=<token>` mode** (`mocks.md:198-206`): token matched against `config.client.token`. Client sees every journey and screen with the same controls a real user has, a note box on each screen, and nothing else — no delete, no reject, no Components page. A client-raised note is an ordinary row distinguished only by who raised it. The client's confirm control on a journey sets `approval.journeys[j].client = "ok"`.
- Dev-only mount; zero reviewer code in the production bundle (ADR-0028).

## E. `answer`
`mock-review answer (--note <id> | --journey <id>) --text <t> [--decision <d>]`: appends `{by, text}` to the target thread and flips `status` `open → answered`. Never sets `approved`, never deletes. `--decision` appends `{screen, text, at}` to `design/decisions.json`. Exit 0.

## F. `sweep`
- Text mode lists only `open` items, grouped by file, journey requests first, inventory printed first (`mocks.md:183-185`). **Empty queue prints exactly one line** — the session loops until one line (`mocks.md:186-187`); stub prints `queue empty`.
- Inventory built with react-docgen-typescript over project components/shells (props on one line, under a second — ADR-0028:31-34); a component without doc line/`examples` is invisible. `kind` ∈ component/shell/screen; `usedOn` names the screens using it; `doc` is the `/** … */` line.
- Queue: open notes and journey change requests, journey requests first; `file`/`line` resolved source location; `last` the last thread entry; `reuse` the reuse hint (an existing inventory component that would serve).

## G. Template files copied into the host (`spec/templates/mock/*`)
| src | dest (app-relative) | package requirement |
|---|---|---|
| `mock.config.ts` | `mock.config.ts` | load default export → `check.config` |
| `journeys.ts` | `src/journeys.ts` | parse `export const journeys: Journey[]`; empty array valid |
| `screen.example.tsx` | `design/examples/screen.example.tsx` | excluded from screens glob |
| `records.example.ts` | `design/examples/records.example.ts` | excluded from records glob |

Scaffold beneath: `npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s` → Vite 8 + React 19 + Tailwind 4, `components.json` style `radix-nova`, `@/` → `src/`.

## H. Ambiguities and gaps (each needs a ruling in the spec)
1. `check.screens` is an array but design-stage prose indexes `check.screens[<name>].hash` — array of `{name,…}` with lookup-by-name.
2. `notes`/`approval`/`decisions` shapes are never validated by the plugin — the package guarantees them.
3. `decisions.json` has no reader; writer = `answer --decision`.
4. `project: true` is load-bearing but not in the contract's required keys — optional, documented.
5. Exit codes of `contract`/`check` are never checked; non-JSON stdout is fatal.
6. Package major must equal `contractVersion`.
7. `serve.url` liveness mechanism unspecified (ruling: portfile + ping, see fable-rulings.md).
8. `config.port` vs actual serve port may differ (fixture: 5180 vs 45980) — `port` is a preference.
9. No trailing slash on `serve.url`.
10. `screens[].shell`, `screens[].lines` have no consumer.
11. `answer` stdout unpinned.
12. Edge resolution: control text vs `data-to` attribute (ruling: `via?: {component, text}`, see fable-rulings.md).
13. `states` warn depends on the seed at the repo root, outside the app dir — the package needs a path to `../design/mocks/seed.md` (or the finding is skipped when absent).
14. Empty `sweep` line text unspecified (stub: `queue empty`).
15. `serve` must tolerate being started by the session or the user.
16. Who creates `design/notes.json` / `approval.json` first — the package, at first `serve` or on any verb.
