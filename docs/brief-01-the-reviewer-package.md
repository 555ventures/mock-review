# Brief 01 — the reviewer package `@555/mock-review`

Written 2026-09-15 by the claude-plugins planning session. Status: planned — specs/20260915/01 and 02 locked 2026-09-15.

## Why now
The spec plugin (`~/projects/claude-plugins`, brief 26 + ADR-0028 "the mock is the app") is fully built and merged against a CLI that does not exist. `/spec:mocks`, `/spec:genesis`, `/spec:sketch` and the run design stage all shell out to `mock-review` and stop at SEED with `npm i -D @555/mock-review` → npm 404. Brief 26 marked this package out of scope; the plugin's tests passed on a bash stub. Nothing works until this package exists. The rule going forward: a brief cannot close while a dependency it marked out of scope does not exist; results passed only against a stub are reported as unverified.

## What
A separately-versioned npm package, installed by the host mock app as a dev dependency, providing the CLI `mock-review` (verbs `contract`, `sweep`, `answer`, `check`, `serve`) and the served reviewer page. It must satisfy `~/projects/claude-plugins/spec/templates/mock/contract.json` (contractVersion 1) exactly. `docs/research/plugin-requirements.md` is the binding requirements list, `docs/research/fable-rulings.md` the settled design calls, `docs/research/prototype-inventory.md` what the spike proved.

## The design is the prototype — fixed, not reinterpreted
The reviewer under `~/projects/claude-plugins/.claude/worktrees/agent-ae25a43a1031bd49a/prototypes/react-mocks/src/review/` **is the design**. JJ built it interactively, view by view; every layout, control, interaction, keyboard shortcut, status colour and shadcn part is final. The rebuild changes code structure only (feature folders, store, sync, router, tests). Nothing the user sees or does changes without JJ's explicit call. Spec B is red if any surface differs from `docs/design/` (screenshot atlas + design reference captured from the running prototype), and every surface has an AC naming its controls and behaviour verbatim from the prototype.

## Fixed decisions (do not re-open)
- Separate repo `555ventures/mock-review`; package name `@555/mock-review`; major version = contractVersion; install `npm i -D github:555ventures/mock-review#v1` with a committed `dist/`; `v1` is a moving major tag.
- Clean code, same design: feature folders (notes, journeys, catalog, frame, shell); one store + selectors; a sync layer using per-note patches; a real router; stock shadcn composed from the official example shape; presentational parts wrapped by store-aware containers; zod schemas shared by CLI, Vite plugin and UI; unit tests for selectors, schemas, analysis and the notes writer; browser tests for raise/answer/approve; no seed data; no scattered sessionStorage; no `!` context assertions.
- `check --json` renders with Vite middleware mode + `ssrLoadModule` + `renderToString`; Playwright only behind `check --look` and browser tests, as an optional peer.
- `serve.url` = portfile `design/.serve.json` + live ping; `contract --json` never touches Vite or the host; JSON verbs print only JSON on stdout (`logLevel: 'silent'`), everything else to stderr.
- `journeys.ts` edges resolve by the `data-to="<label>"` attribute (seed template rule); optional `state`/`persona`/`say` fields feed the page; client attribution via `thread[].by === "client"`.
- Two surfaces the prototype lacks exist only because the plugin's contract requires them, gated so a host without them sees the prototype unchanged: a Theme select in the top bar (when `src/themes/*.css` exist) and the `?client=<token>` role (hides delete/reject/approve/Components/Search, adds "Confirm journey"). Dark scheme exists only in frames for `--look` screenshots.

## Two specs
**Spec A — schemas, headless CLI, bare serve.** Package scaffold and publishable build (`bin`, `exports`, ESM + types, committed `dist/`); zod schemas for contract/check/sweep/notes/approval/decisions/config tested byte-for-byte against the plugin's contract.json; discovery + analysis core; `contract`, `check` (all seven finding kinds; `twin` stubbed to none), `sweep` (docgen inventory + queue), `answer` (incl. `--decision`); `writeJsonAtomic`; creation of empty `design/notes.json` and `design/approval.json`; `serve` as the bare Vite dev server with the reviewer plugin mounted, portfile written, `/__mock-review/ping`, and a stub reviewer route. A fixture host under `tests/` mirroring the plugin's `spec/templates/mock/` exactly, and a CI job that runs the plugin's `mocks-driver.js` against it.
**Exit check (A):** on a fresh folder, `npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s`, `npm i -D github:555ventures/mock-review#v1`, the four template copies, one records file, one shell with `examples`, two screens and one journey → `mocks-driver.js` records `seed-done`, `shell-drawn`, `journey-drawn` with the real binary; `check --json` validates against contract.json; `serve.url` non-null while `serve` runs and `null` after it exits.

**Spec B — the reviewer page.** The React app in feature folders: device frames (iframe, `?frame=1`), state switching, note anchoring (`key` + `snippet`, re-anchor on drift), raise/approve/reject/delete, journey guide + conversation, journey approval, theme pick, Components page (docgen inventory), screen approval writing `{hash, approvedAt, states, viewports, schemes, screenshots}` with the hash `check` reports; `?client=<token>` role (no delete, no reject, no Components page; confirm sets `approval.journeys[j].client = "ok"`); `check --look` screenshots when Playwright resolves.
**Exit check (B):** browser test: raise a note on a screen → `mock-review answer --note <id>` flips it to answered → approve on the page → `mocks-driver.js --mark journey-approved` succeeds; then `theme-picked` and `approved` on the same host reach APPROVED.

## Plugin-side changes (in `~/projects/claude-plugins`, after Spec A fixes the strings)
- Remedy strings and SEED text switch to `npm i -D github:555ventures/mock-review#v1` (`spec/scripts/lib/mock-cli.js` lines 82, 97, 163; `spec/scripts/mocks-driver.js` SEED step; `spec/doctrine/mocks.md`; pinned tests).
- `spec/templates/mock/journeys.ts` gains optional fields the page reads: `state?` on `Step`, `persona?` on `Journey`, `say?` on `Edge` (edges resolve by `data-to="<label>"`, already in the seed template — no `via`).
- `spec/templates/mock/mock.config.ts` client token default becomes a generated value at scaffold time.
- Doctrine rule: a brief cannot close while a dependency it marked out of scope does not exist; stub-only green is reported unverified.

## Out of scope
Nothing that the plugin reads is out of scope. Deferred to a later brief only: real `twin` findings, screenshot pruning, npm registry publishing.
