---
paths:
  - "specs/**"
  - ".claude/**"
  - "src/**"
  - "tests/**"
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
