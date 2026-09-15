# Prototype inventory vs the contract (2026-09-15)

Prototypes: `~/projects/claude-plugins/.claude/worktrees/agent-ae25a43a1031bd49a/prototypes/{react-mocks,mock-review}`. The reviewer prototype is the **design**: its look and behaviour are final. The rebuild-clean memory forbids extending its *code*; it never allows changing what the user sees or does.

**Headline: the prototype implements about 35% of the contract, and almost none of it is the CLI.** No `bin`, no verb, no JSON emitter, no `mock.config.ts`, no `design/` directory, no records, no themes, no approval/decisions files. What exists is a React review page (~1,585 lines, `src/review/*`, byte-identical to `mock-review/src/*`) plus a 114-line Vite plugin (`mock-plugin.ts`) with one `/__notes` GET/POST endpoint that overwrites `notes.json` whole, unvalidated. `react-docgen-typescript` and `playwright` are declared devDependencies referenced by zero source files. No screenshots anywhere.

## Verb by verb
- `contract`: nothing.
- `sweep`: `mock-plugin.ts:23-51` computes per-screen states and component usage (→ `usedOn`); `catalog.ts:29` lists `examples`. Missing: `props` (docgen never called), `doc` (no prototype file carries a `/** */` line), the whole `queue[]`, line resolution, `reuse`.
- `answer`: exists only as a UI action that drives status **to `open`** (`ReviewLayer.tsx:619`) — the inverse of the verb. No `by:"ai"` writer, no `--decision`.
- `check`: only `layer` violations (`mock-plugin.ts:36,45`) with a regex import scanner that misses multi-line imports. Missing: the JSON envelope, `type`/`doc`/`render`/`config`/`size`/`twin`/`states`, `screens[].hash` (nothing hashes a screen — yet the run design stage's drift gate depends on it), `shells[].examples` as JSON, `journeys[].resolved/unresolved`, `themes`, `config`, `serve.url`, `--look`. The prototype's layer allow-list is narrower than the contract's (misses `react`, `@/records`).
- `serve`: only `vite` itself; hardcoded `http://127.0.0.1:45980`. No URL-on-first-line, no port from config, no `?client=<token>` role gating (`NoteActions` always offers delete/reject), no liveness signal.

## Host files
| Contract file | Prototype |
|---|---|
| `mock.config.ts` | absent; devices hardcoded `ReviewLayer.tsx:94-97`; no schemes concept |
| `src/screens` meta | conflicting: `meta {title,label,shell}` + `export const <State> = {name,args}`; contract wants `meta {name, states[]}` + `examples` JSX map. Contract wins. |
| `src/shells` examples | matches in spirit (`ConsoleShell.tsx:57-61`) |
| `src/journeys.ts` | conflicting: `Edge {from,to,click{in,text},say}` vs template `{from,to,label?}` — ruled: template + optional `via?: {component, text}` |
| `src/records`, `src/themes` | absent |
| `design/notes.json` | wrong path (root `notes.json`), wrong envelope (`{notes, journeyThreads, approvedScreens}`), note uses `component+index+rect` where the contract wants `key` |
| `design/approval.json` | absent; only `approvedScreens: Record<string,true>` |
| `design/decisions.json` | absent |
| `design/examples/` | absent; prototype globs would pick it up |

## Port as reference (mechanics proven, hard to re-derive)
1. **Iframe device-frame architecture** — `ReviewLayer.tsx:106-254`. The mock renders in a same-origin `?frame=1` iframe (`main.tsx:48-49`); state switch replaces the frame's hash, full-URL gotcha at `:133-135`. The single most valuable idea.
2. **Note anchoring** — `anchorFor` `ReviewLayer.tsx:43-67`: smallest `[data-component]` containing the drawn box, else `elementsFromPoint`; stores component + nth index + fraction rect + 80-char snippet. `anchorEl/resolveBox/resolveGhost` (`:70-89`) return `null` when the snippet left the element = "outdated, offer re-anchor". Port the idea as `key` + `snippet`.
3. **Re-measurement loop** — `:138-167`: ResizeObserver + MutationObserver coalesced through double-rAF, capture-phase scroll.
4. **Journey control resolution** — `useJourneyGuide.ts:7-12` (scope by `[data-component="<in>"]`, first `a|button|[role=button]|[role=tab]` whose text contains the label) + wait-until-every-frame-shows-this-step (`:39-43`). This is the matcher `check --json` must reuse for `resolved`/`unresolved[].reason`.
5. **Import-walk / layer classification** — `mock-plugin.ts:12-21,32-47`: port the shape, replace regex with a real TS parse.
6. **Discovery globs** — `import.meta.glob(..., {eager:true})`; the slice-by-index naming is brittle (two magic offsets already).
7. **`examples` export + isolated preview route** `/?frame=1#/__component?name=&example=` (`catalog.ts:32-40`, `index.tsx:37-39`).
8. **Status selectors** — `store.tsx:24-32` (`worst`, `screenTone`, `stateTone`, `journeyTone`): pure, unit-testable.
9. **"New/reopened note un-approves its screen"** — `store.tsx:69-73`.
10. **Three-tone status model + action matrix** — `notes-ui.tsx:16-21`, `:123-135`.

## Discard
`ReviewLayer.tsx` as a file (665 lines, every concern); module-scope `let pendingOpen`; `!` context assertions; scattered sessionStorage (`store.tsx:98-109`); the `SEED` array; whole-document POST persistence; the duplicated hash router; package imports of `@/components/ui/*` and `@/journeys` (a published package cannot reach the host's alias space); `public/r/registry.json` emission; `theme-provider.tsx` (dead); `AUTHORING.md` (stale); `driver.js` dep; the prototype screen meta/state convention.

## Size estimate
| Area | Files | Lines |
|---|---|---|
| Shared zod schemas | 5-7 | 350-450 |
| CLI entry + 5 verbs + formatting | 7-8 | 450-600 |
| Analysis core (discovery, TS program, layer lint, doc/examples parse, hash, size/twin/states, docgen, journey resolution, render harness) | 9-12 | 900-1,200 |
| Vite plugin + dev server (virtual modules, endpoints, portfile, HMR push, role gating) | 4-5 | 350-450 |
| UI feature folders + store/selectors + sync + router | 25-32 | 1,800-2,300 |
| Screenshot / `--look` | 1-2 | 120-200 |
| Tests (unit + browser) | 15-20 | 900-1,300 |
| Package scaffolding | 6-8 | 200-300 |
| **Total** | **~72-95** | **~5,100-6,800** |

Split (after Fable's ruling): **Spec A** = package scaffold + zod schemas + headless CLI (`contract`, `check` with every finding kind incl. the render harness, `sweep`, `answer`) + `serve` as the bare Vite dev server with portfile and a stub reviewer route; exit = the plugin's `mocks-driver.js` goes green end to end on a real fresh host with the real binary. **Spec B** = the reviewer page (feature folders, one store + selectors, per-note patch sync, real router, stock shadcn), `?client` role, `--look` screenshots; exit = raise → answer → approve round-trips through `design/notes.json` and `design/approval.json` in a browser test.
