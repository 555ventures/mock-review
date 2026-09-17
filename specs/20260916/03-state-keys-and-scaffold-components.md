---
date: 2026-09-16
status: done
tier: critical
area: analysis
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
build_base: main
spiked: 2026-09-16
open_markers: 0
diff_base: 1eda7c25eddb14584294388b7f3a9279c83182a7
---

# State keys resolve one way everywhere; the shadcn scaffold's own component is exempt

## Goal

Two `check` defects found by the `/spec:mocks` end-to-end spike (a `shadcn@4.21.0` vite scaffold
with the package installed from npm). (A) A freshly scaffolded host fails `check` before any work,
because the scaffold writes `src/components/theme-provider.tsx`, which has no doc line and no
`examples` export. (B) A screen whose `meta.states` says `no-phone` while its `examples` key is
`NoPhone` is reported as unexampled, and the same lowercase-only comparison, copied at five sites,
also makes the reviewer route a journey step to the wrong example. Done means: the scaffold's
component is invisible to every host consumer; one pure resolver in `src/ui/frame/stateKey.ts`
maps states to example keys (exact match first, then a unique normalised match, ambiguity
refused and reported as a `states` warning) and every site uses it; the `check --json` shape is
unchanged.

## Decisions (locked — workers apply verbatim, never override)

| ID  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | One-line rationale                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `src/analysis/discover.ts` gains a module-private `const SCAFFOLD_OWNED_COMPONENTS: ReadonlySet<string> = new Set(['theme-provider.tsx'])` (file names, with extension), applied as a filter on the `src/components` listing inside `discoverHost` before `toDiscovered`. The D3 doc comment is extended with one sentence: files the `shadcn` vite scaffold writes into `src/components/` itself (not the mock author) are skipped the same way `components/ui/**` is, so doc findings, the sweep inventory and the reviewer's catalog never see them; remove an entry only when the scaffold stops writing that file. Screens, shells, themes and records are unfiltered. (AC-20260916-03-5, AC-20260916-03-6, AC-20260916-03-11)                                                | One filter at discovery covers every consumer (`check.ts`, `cli/sweep.ts`, `server/state.ts`, `server/registry.ts`, `server/plugin.ts`). Rejected: a list in the plugin's `contract.json` (a contract change for one scaffold file), an "unused component" heuristic (hides real author mistakes), patching the file from the mocks driver (the package would still fail on any hand-scaffolded host).        |
| D2  | New file `src/ui/frame/stateKey.ts`, zero imports (no DOM, no node, no zod), carrying a header comment in `frameRoute.ts`'s form: it ships as source under `src/ui` (package.json `files`) AND compiles into `dist/ui/frame/stateKey.js` because `src/analysis/screens.ts` and `src/server/state.ts` import it (tsconfig `exclude` never blocks an imported file). Its File Plan layer is `schemas` so it lands in the first build wave, before its `analysis`/`server` importers. `package.json` and `tsconfig.build.json` are not touched. (AC-20260916-03-12)                                                                                                                                                                                                                   | `src/schemas/*.ts` is not in the published tarball (`files: ["dist","src/ui"]`, spike S1), and `src/ui` is compiled by the host's Vite from source, so a helper the frame and the store import at runtime must live under `src/ui`. Rejected: `src/schemas/state-key.ts` plus a `files` entry (widens the install surface for no gain). `frameRoute.ts` is the precedent (`src/analysis/look.ts` imports it). |
| D3  | `stateKey(s: string): string` returns `s.toLowerCase().replace(/[^a-z0-9]/g, '')`. (AC-20260916-03-1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | One rule covers kebab, snake, Pascal and camel spellings. Rejected: a narrower kebab/snake-to-Pascal mapping (still needs case folding and adds a second naming grammar); refusing ambiguity (D4) is what removes the surprise, not a narrower normaliser.                                                                                                                                                    |
| D4  | `resolveStates(states, exampleKeys): StateResolution` (Contracts) runs two passes over the distinct `states` in order, and every example key is claimed by at most one state. Pass 1 (exact): a state equal to an unclaimed key binds to it. Pass 2 (normalised, only for states pass 1 left unbound): candidates are the unclaimed keys `k` with `stateKey(k) === stateKey(state)` and `stateKey(state) !== ''`, in `exampleKeys` order; exactly one candidate → bind and claim it; two or more → push `{ state, keys: candidates }` to `ambiguous` and leave the state unbound (no key claimed); zero → push the state to `unmatched`. A state never appears in both `unmatched` and `ambiguous`; a repeated state string is resolved once. (AC-20260916-03-2, AC-20260916-03-3) | Exact before normalised across all states means `['no-phone','NoPhone']` against `['NoPhone']` cannot let the looser match steal the exact one. Refusing ambiguity by design replaces today's silent first-wins, the same rule Git applies to short hashes (exact wins, a unique abbreviation works, an ambiguous one is refused).                                                                            |
| D5  | `resolveState(exampleKeys, state): string \| undefined` is exactly `resolveStates([state], exampleKeys).byState.get(state)`. It is the single-lookup form for sites that hold one state. (AC-20260916-03-3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Same precedence for single lookups as for whole mappings; there is no second algorithm to drift.                                                                                                                                                                                                                                                                                                              |
| D6  | `src/analysis/screens.ts`: the per-state warn loop is replaced by one `resolveStates(states, Object.keys(examples))` call. Each `unmatched` state emits the existing `{ kind: 'states', severity: 'warn', file, message: 'state <s> has no example' }`; each `ambiguous` entry emits `{ kind: 'states', severity: 'warn', file, message: 'state <s> matches several examples: <keys joined by ", ">' }`. `pickDefaultHtml` becomes `const match = firstState ? resolveState(keys, firstState) : undefined; if (match) return html[match]` and keeps the first-key fallback. The two doc comments that say "case-insensitively" are rewritten to name the D4 rule. (AC-20260916-03-7, AC-20260916-03-8, AC-20260916-03-13)                                                          | The analysis site is both the finding source and the journey default.                                                                                                                                                                                                                                                                                                                                         |
| D7  | Ambiguity is a `states` **warn**, never an error: `FindingSchema` (`src/schemas/check.ts`) and the `check --json` shape are unchanged. (AC-20260916-03-8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Error kinds are closed to `type                                                                                                                                                                                                                                                                                                                                                                               | layer | doc | render | config`and warn kinds to`size | twin | states`. A `states`error widens the published shape; reusing`render` mislabels the problem. Because D4 treats an ambiguous state as unbound, nothing is silently mis-rendered, so a warn is honest. User ruling in planning. |
| D8  | `src/server/state.ts` `normaliseStepState(exampleKeys, state)` returns `resolveState(exampleKeys, state) ?? state`. Its D21 comment is rewritten: a journey `Step.state` is written in `meta.states` spelling; it is resolved once, server-side, to its example key by `resolveStates`' rule (exact, then unique normalised); an unresolved or ambiguous state passes through unchanged. (AC-20260916-03-10)                                                                                                                                                                                                                                                                                                                                                                       | This is the site whose miss made the reviewer open the wrong example for a hyphenated journey step.                                                                                                                                                                                                                                                                                                           |
| D9  | `src/ui/store/selectors.ts` `statesOf`: `const { byState } = resolveStates(metaStates, exampleKeys)`; the ordered list is each `byState.get(m)` for `m` of `metaStates` in order (skipping `undefined` and keys already pushed), then every remaining example key in `Object.keys(examples)` order. The local `used`/`find` loop and the `toLowerCase` compare are deleted; the doc comments that say "case-matched" name the D4 rule instead. (AC-20260916-03-9)                                                                                                                                                                                                                                                                                                                  | Claim-once now lives inside the resolver. Ambiguous states contribute nothing to the first part, so their keys appear in declaration order after the bound ones.                                                                                                                                                                                                                                              |
| D10 | `src/ui/frame/mount.tsx` `pickExample`: `const keys = Object.keys(examples); const key = requested ? resolveState(keys, requested) : undefined; const chosen = key ?? keys[0]; return chosen ? (examples[chosen] ?? null) : null`. The separate `requested in examples` check and the case-insensitive `find` are deleted (D4's pass 1 is the exact match); the doc comment names the D4 rule. (AC-20260916-03-4)                                                                                                                                                                                                                                                                                                                                                                  | The frame holds only `?state=` and the module's `examples`, which fits the single-lookup form.                                                                                                                                                                                                                                                                                                                |
| D11 | After this spec, no file among `src/analysis/screens.ts`, `src/server/state.ts`, `src/ui/store/selectors.ts`, `src/ui/frame/mount.tsx` matches `/\.toLowerCase\(\)\s*===\s*[\w.]+\.toLowerCase\(\)/`, and each of them imports from its relative path to `ui/frame/stateKey.js`. (AC-20260916-03-4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A source-level invariant is the cheap guard against a sixth ad-hoc comparison; the frame module is a DOM entry with no unit seam.                                                                                                                                                                                                                                                                             |
| D12 | `tests/package/install.test.ts`'s `.test-dist/ui/` exact-list test (AC-20260915-04-7) is rewritten to expect the eight files `frame/frameRoute.{d.ts,d.ts.map,js,js.map}` and `frame/stateKey.{d.ts,d.ts.map,js,js.map}`, with the new AC-ID added to its title. (AC-20260916-03-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | D2 adds an imported file under `src/ui`, so the committed list is red by construction.                                                                                                                                                                                                                                                                                                                        |
| D13 | Outside the build: `dist/` is not rebuilt in any build batch (pipeline rules § Build); the release rebuild and the two plugin-repo doc lines (`spec/doctrine/mocks.md` on the scaffold exemption, `spec/skills/mock-authoring/SKILL.md` on the state → example key rule) are queued with `--after-spec` at lock. [no-ac: release and cross-repo prose; no testable surface in this repo]                                                                                                                                                                                                                                                                                                                                                                                           | Rules forbid dist in a build batch, and build workers cannot write another repo.                                                                                                                                                                                                                                                                                                                              |

## File Plan

| Path                          | Action | Layer    | Summary                                                                                                    |
| ----------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| src/ui/frame/stateKey.ts      | CREATE | schemas  | D2–D5: zero-import `stateKey`, `resolveStates`, `resolveState`, `StateResolution`; frameRoute-style header |
| src/analysis/discover.ts      | MODIFY | analysis | D1: `SCAFFOLD_OWNED_COMPONENTS` filter on the components listing; D3 comment extended                      |
| src/analysis/screens.ts       | MODIFY | analysis | D6: `resolveStates` findings (unmatched + ambiguous warns), `pickDefaultHtml` via `resolveState`, comments |
| src/server/state.ts           | MODIFY | server   | D8: `normaliseStepState` via `resolveState`; D21 comment rewritten                                         |
| src/ui/store/selectors.ts     | MODIFY | ui       | D9: `statesOf` via `resolveStates`; comments                                                               |
| src/ui/frame/mount.tsx        | MODIFY | ui       | D10: `pickExample` via `resolveState`; comment                                                             |
| tests/unit/stateKey.test.ts   | CREATE | tests    | AC-20260916-03-1, AC-20260916-03-2, AC-20260916-03-3, AC-20260916-03-4                                     |
| tests/unit/discover.test.ts   | CREATE | tests    | AC-20260916-03-5                                                                                           |
| tests/cli/check.test.ts       | MODIFY | tests    | AC-20260916-03-6, AC-20260916-03-7, AC-20260916-03-8, AC-20260916-03-13, AC-20260916-03-14                 |
| tests/unit/labels.test.ts     | MODIFY | tests    | AC-20260916-03-9                                                                                           |
| tests/server/api.test.ts      | MODIFY | tests    | AC-20260916-03-10, AC-20260916-03-11                                                                       |
| tests/package/install.test.ts | MODIFY | tests    | AC-20260916-03-12                                                                                          |

## Contracts

```ts
// src/ui/frame/stateKey.ts — zero imports
export type StateResolution = {
  /** state → the example key it resolved to (exact, or the unique normalised match). */
  byState: Map<string, string>
  /** states with no exact and no normalised candidate. */
  unmatched: string[]
  /** states with no exact match and two or more normalised candidates (keys in exampleKeys order). */
  ambiguous: { state: string; keys: string[] }[]
}

export function stateKey(s: string): string
export function resolveStates(
  states: readonly string[],
  exampleKeys: readonly string[],
): StateResolution
export function resolveState(exampleKeys: readonly string[], state: string): string | undefined
```

New `check --json` finding **message** only (shape, kind and severity unchanged):
`state <s> matches several examples: <k1>, <k2>[, …]`.

## Behavior

Behaviour changes versus today, all deliberate:

- `states: ['no-phone']` + `examples: { NoPhone }`: today a warn plus a journey step routed to the
  first example; after, no finding and the step opens `NoPhone`.
- Two keys differing only by case (`Empty`, `empty`) with state `EMPTY`: today silently the first;
  after, a `matches several examples` warn and the state is unbound (the frame shows the first
  example, the journey step keeps `EMPTY`). A state spelled exactly like one of them still binds
  to it.
- `src/components/theme-provider.tsx` no longer appears in `check` doc findings, `sweep`'s
  inventory, or the reviewer's component catalog. A same-named file anywhere else is unaffected.

## Acceptance Criteria

- **AC-20260916-03-1**: WHEN `stateKey` is called THE SYSTEM SHALL lowercase and strip every character outside `a-z0-9` (e.g. `'no-phone'` → `'nophone'`, `'NoPhone'` → `'nophone'`, `'no_phone'` → `'nophone'`, `'Default'` → `'default'`, `'---'` → `''`) → writes tests/unit/stateKey.test.ts
- **AC-20260916-03-2**: WHEN `resolveStates` gets an exact key and a unique normalised key THE SYSTEM SHALL bind exact matches before normalised ones and claim each key once (e.g. `(['default','no-phone'], ['Default','NoPhone'])` → `byState` `{default→Default, no-phone→NoPhone}`, `unmatched: []`, `ambiguous: []`; `(['no-phone','NoPhone'], ['NoPhone'])` → `byState` `{NoPhone→NoPhone}`, `unmatched: ['no-phone']`, `ambiguous: []`; `(['---'], ['___'])` → `byState` empty, `unmatched: ['---']`) → writes tests/unit/stateKey.test.ts
- **AC-20260916-03-3**: WHEN two or more unclaimed keys share a state's normalised key and none equals it exactly THE SYSTEM SHALL leave the state unbound and list it as ambiguous (e.g. `resolveStates(['no-phone'], ['NoPhone','no_phone'])` → `byState` empty, `unmatched: []`, `ambiguous: [{ state: 'no-phone', keys: ['NoPhone','no_phone'] }]`; `resolveState(['NoPhone','no_phone'], 'no-phone')` → `undefined`; `resolveState(['NoPhone','no_phone'], 'no_phone')` → `'no_phone'`) → writes tests/unit/stateKey.test.ts
- **AC-20260916-03-4**: WHEN the source of `src/analysis/screens.ts`, `src/server/state.ts`, `src/ui/store/selectors.ts` and `src/ui/frame/mount.tsx` is read THE SYSTEM SHALL contain no match for `/\.toLowerCase\(\)\s*===\s*[\w.]+\.toLowerCase\(\)/` in any of them and an import specifier ending `ui/frame/stateKey.js` (or `./stateKey.js` in mount.tsx) in each (e.g. today `mount.tsx` contains `k.toLowerCase() === requested.toLowerCase()` → red) → writes tests/unit/stateKey.test.ts
- **AC-20260916-03-5**: WHEN `discoverHost(dir)` runs on a scratch dir holding `src/components/theme-provider.tsx`, `src/components/Badge.tsx` and `src/components/ui/button.tsx` THE SYSTEM SHALL return `components` equal to `[{ name: 'Badge', file: 'src/components/Badge.tsx' }]` (e.g. today → also `{ name: 'theme-provider', … }`) → writes tests/unit/discover.test.ts
- **AC-20260916-03-6**: WHEN `check --json` runs in a scratch copy of the green fixture host with an added `src/components/theme-provider.tsx` whose content is exactly `import * as React from "react"\nexport function ThemeProvider({ children }: { children: React.ReactNode }) {\n  return <>{children}</>\n}\n` THE SYSTEM SHALL print `ok: true` and no finding whose `file` is `src/components/theme-provider.tsx` (e.g. today → `ok: false` with `missing doc line` and `missing examples export` on that file, spike S2) → writes tests/cli/check.test.ts
- **AC-20260916-03-7**: WHEN `check --json` runs in a scratch copy of the green fixture host whose `src/screens/account.tsx` has `states: ['default', 'no-phone']` and an added examples entry `NoPhone: <Account />` THE SYSTEM SHALL print `ok: true`, no finding whose `file` is `src/screens/account.tsx`, and the account row's `states` equal to `['default', 'no-phone']` (e.g. today → a `states` warn `state no-phone has no example`) → writes tests/cli/check.test.ts
- **AC-20260916-03-8**: WHEN `check --json` runs in a scratch copy of the green fixture host whose `src/screens/account.tsx` has `states: ['default', 'no-phone']` and added examples entries `NoPhone: <Account />` and `no_phone: <Account />` THE SYSTEM SHALL print exactly one finding for that file, `{ kind: 'states', severity: 'warn', file: 'src/screens/account.tsx', message: 'state no-phone matches several examples: NoPhone, no_phone' }`, and `ok: true` (e.g. today → `state no-phone has no example`) → writes tests/cli/check.test.ts
- **AC-20260916-03-9**: WHEN `statesOf` gets a module whose meta states and example keys differ in spelling THE SYSTEM SHALL order resolved keys by `meta.states`, then the rest in declaration order (e.g. `{ meta: { states: ['default','no-phone'] }, examples: { Extra, NoPhone, Default } }` → `['Default','NoPhone','Extra']`; `{ meta: { states: ['no-phone'] }, examples: { NoPhone, no_phone } }` → `['NoPhone','no_phone']`; today the first → `['Default','Extra','NoPhone']`) → writes tests/unit/labels.test.ts
- **AC-20260916-03-10**: WHEN `serve` runs in a scratch copy of the green fixture host whose `account.tsx` has `states: ['default', 'no-phone']` plus `NoPhone: <Account />`, and whose `src/journeys.ts` second step is `{ screen: 'account', state: 'no-phone' }`, and `GET <url>/__mock-review/state` is fetched THE SYSTEM SHALL answer with `journeys[0].steps[1].state === 'NoPhone'` and no `violations` entry equal to `state no-phone has no example` (e.g. today → `steps[1].state === 'no-phone'`) → writes tests/server/api.test.ts
- **AC-20260916-03-11**: WHEN `serve` runs in a scratch copy of the green fixture host with AC-20260916-03-6's `src/components/theme-provider.tsx` added and `GET <url>/__mock-review/state` is fetched THE SYSTEM SHALL answer with no `inventory` row whose `name` is `theme-provider` while the fixture's `WalletSummary` row is still present (e.g. today → a `theme-provider` row with `examples: []`) → writes tests/server/api.test.ts
- **AC-20260916-03-12**: WHEN `.test-dist/ui/` is walked after the test build THE SYSTEM SHALL contain exactly `frame/frameRoute.d.ts`, `frame/frameRoute.d.ts.map`, `frame/frameRoute.js`, `frame/frameRoute.js.map`, `frame/stateKey.d.ts`, `frame/stateKey.d.ts.map`, `frame/stateKey.js`, `frame/stateKey.js.map` (e.g. today → the four frameRoute files only) → rewrites tests/package/install.test.ts :: AC-20260915-04-7: .test-dist/ui/
- **AC-20260916-03-13**: WHEN a `meta.states` entry has no example under any spelling THE SYSTEM SHALL CONTINUE TO report a `states` warn `state <s> has no example` for it (e.g. `states: ['default', 'empty', 'ghost']` on the fixture's `home.tsx` → `state ghost has no example`) → reuses tests/cli/check.test.ts :: AC-20260915-01-10:
- **AC-20260916-03-14**: WHEN `check --json` runs on the green fixture host THE SYSTEM SHALL CONTINUE TO exclude `src/components/ui/**` and `design/examples/**` from every reported file (e.g. no finding or row whose file starts with `src/components/ui/`) → reuses tests/cli/check.test.ts :: AC-20260915-01-5:

## Assumptions (escalation triggers)

- A1 (spike S1, executed): `npm pack --dry-run` in the repo lists `dist/ui/frame/frameRoute.{js,js.map,d.ts,d.ts.map}` and `src/ui/frame/{DeviceFrames.tsx,frameRoute.ts,mount.tsx,useMeasure.ts}`, and no `src/schemas/*.ts` — so a file under `src/ui/frame` imported by `src/analysis` both ships as source and compiles into `dist/ui/frame/` despite `tsconfig.build.json` `exclude: ["src/ui/**"]` (TypeScript emits imported files). **if false:** STOP, ask the user; do not add a `files` entry.
- A2 (spike S2, executed): a scratch copy of `tests/fixtures/host` with the AC-20260916-03-6 `theme-provider.tsx` added, run as `npx tsx src/cli.ts check --json`, printed exactly two findings, `{kind:'doc',severity:'error',file:'src/components/theme-provider.tsx',message:'missing doc line'}` and `{…message:'missing examples export'}`, and `ok: false`; no `type` finding. **if false** (a `type` finding appears after the fix): adjust the AC's file content to type-check, not the exemption.
- A3 (spike S3, executed): `check --json` in the spike app (`states: ['default','no-phone']`, example `NoPhone`) printed `[{"kind":"states","severity":"warn","file":"src/screens/member.tsx","message":"state no-phone has no example"}]`. **if false:** re-derive the repro before building.
- A4 (observed, not separately executed): the host's Vite resolves a `./stateKey.js` specifier in a shipped `.tsx` under `node_modules` to `stateKey.ts`, as it already does for `mount.tsx` → `./frameRoute.js` in the npm-installed spike host. **if false:** the browser/package tests go red with a failed import; STOP and ask.
- A5: `mocks-driver.js` reads only `severity === 'error'` from `check --json` findings (line ~350), so a new warn message changes no driver outcome. **if false:** STOP; D7 needs re-ruling.

## Rationale

The spike installed the package from npm into a real shadcn scaffold and hit two defects the
fixture host cannot show: the fixture mirrors the plugin's template and has no scaffold file,
and every fixture state is a single lowercase word.

(A) is fixed at discovery, not at the finding. `discoverHost` is the one list every consumer
reads, so one filter removes the file from `check`, `sweep`, and the reviewer. It is a
hardcoded set because the scaffold is pinned (`shadcn@4.21.0` in the plugin's SEED step) and the
set's comment names its removal trigger.

(B) was one bug copied five times. A patch to `check` alone would pass `check` while the
reviewer still failed, so the design moves the rule into one resolver. The helper lives under
`src/ui/frame/` only because of packaging (A1), and its layer is `schemas` so it builds before
its importers. The rule is exact-first, then unique normalised, and ambiguity is refused (the shape
of Git's short-hash resolution). The
one deviation from a strict design is that ambiguity is a warn, not an error: the published
`FindingSchema` closes `states` to warn, and because the ambiguous state stays unbound, nothing
renders the wrong example silently (user ruling, D7). A Fable consult agreed with D2, D4, D7
and D3.

Pins: AC-13 keeps the "no example" warn and AC-14 keeps the `components/ui` exclusion, the two
behaviours a future edit to discovery or state resolution could break by accident.

Collision closure (`--literal case-insensitiv --literal case-matched`): the `src/` hits are all
File Plan rows (D6, D8–D10 rewrite those comments). Waived: `dist/analysis/screens.{js,d.ts}`
and `dist/server/state.js` (release artefacts, rebuilt by the queued release step, D13);
`docs/canonical/package.md` (rewritten by this spec's Canonical Delta on close);
`tests/unit/labels.test.ts`'s existing `statesOf … case-matched` title (it stays true for its
case-only input and is not rewritten).

Out of scope, per the planning request: `serve`'s `strictPort: false` (intentional);
`stateLabel('no-phone')` rendering `No-phone` (cosmetic); CI and trusted publishing
(distribution step 3). The package rename to `@555-ventures/mock-review` is already merged.

Build deviation (2026-09-16): D10 makes the frame load `src/ui/frame/stateKey.ts`, so the existing
browser test pinning the frame's `src/ui/` URLs (AC-20260915-03-3/-04-10 in
`tests/server/api.test.ts`) gained that URL in its allowlist; the File Plan row had not listed it.

Waived (2026-09-16, user): the ac-matrix leg's two uncovered ACs, AC-20260916-03-13 and -14. Both
are `reuses` ACs pinned by the existing, passing `tests/cli/check.test.ts` tests AC-20260915-01-10
and AC-20260915-01-5; only their titles lack this spec's IDs.

## Canonical Delta

In `docs/canonical/package.md`, § Check pipeline order, step 2 becomes: "Discover the host by
filesystem globbing from the cwd: `src/screens/*.tsx`, `src/components/*.tsx` (never
`src/components/ui/**`, and never a file the shadcn vite scaffold itself writes there —
currently `theme-provider.tsx`), `src/shells/*.tsx`, `src/records/*.ts`, `src/themes/*.css`,
`src/journeys.ts`, `mock.config.ts`. `design/examples/` is never read."

In § Finding kinds, the `states` row becomes two rows:

| Kind     | Severity | Fires when                                                             | `message`                                        |
| -------- | -------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `states` | warn     | a `meta.states` entry has no exact and no normalised `examples` key    | `state <s> has no example`                       |
| `states` | warn     | a `meta.states` entry has no exact key and two or more normalised ones | `state <s> matches several examples: <k1>, <k2>` |

Add after the table: "A state resolves to an example key by one rule, `resolveStates` in
`src/ui/frame/stateKey.ts`, used by `check`, the reviewer's state list, journey steps and the
frame: an exact key first, otherwise the one key whose `stateKey` (lowercase, strip
`[^a-z0-9]`) equals the state's; each key binds to at most one state, and an ambiguous state
binds to nothing."
