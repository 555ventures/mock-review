---
date: 2026-09-15
status: hardened
open_markers: 0
tier: standard
area: reviewer-page
design: false
breaking: false
depends_on: [specs/20260915/01-schemas-cli-and-bare-serve.md]
depended_on_by: []
brief: 01
spiked: 2026-09-15
---

# The reviewer page

## Goal

`mock-review serve` serves the reviewer page whose look and behaviour are the frozen prototype
(`docs/design/design-reference.md` §0–§14 and `docs/design/atlas/*.png`), rebuilt as clean
package code: feature folders, one store with selectors, a sync layer sending per-note patches,
a real router, stock shadcn. The page reads and writes the contract files (`design/notes.json`,
`design/approval.json`) through the server so the plugin's driver can approve journeys, pick a
theme and reach APPROVED; the client role (`?client=<token>`) and `check --look` screenshots
land here. Done means the browser test raises a note, the CLI answers it, the page approves it
and the screen, and the plugin's driver then records `journey-approved`, `theme-picked` and
`approved` on the fixture host.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The design reference is the specification of every surface.** Each section of `docs/design/design-reference.md` §1–§12 is rebuilt control for control, class for class where the reference quotes classes, wording verbatim; the only departures are the contract-forced deltas in D3–D9 and the two contract-required surfaces in D10–D11. A worker who needs a visible change not listed here returns `blocked`. (AC-20260915-02-1, AC-20260915-02-2, AC-20260915-02-3) | JJ built the prototype interactively so the final product is that design; the rebuild changes code only. |
| D2 | Code shape: `src/ui/` with feature folders `frame/`, `notes/`, `journeys/`, `catalog/`, `shell/`, plus `store/` (one store: `createStore()` with `useStore(selector)` over a `useSyncExternalStore` subscription, all derivations in `store/selectors.ts`), `sync/` (the only module that calls the server: `fetchState()`, `patchNotes(patch)`, `patchApproval(patch)`, `subscribe(onEvent)` over SSE), `router/` (a real hash router: `parseRoute(hash)` → typed `Route`, `useRoute()`, `href(route)` — one implementation, used by the reviewer and the frame), `prefs.ts` (the single `sessionStorage` accessor for `guide-off`, `view`, `side-tab`, every access wrapped), `components/ui/` (the shadcn primitives the reference names, copied from the official registry at the pinned shadcn version and committed). Presentational components take props only; `*Container` components read the store. No `!` assertions, no seed data. (AC-20260915-02-4) | The rebuild-clean requirement (memory `mock-reviewer-rebuild-clean`); the prototype's `ReviewLayer.tsx` (665 lines) mixed every concern. |
| D3 | **Screen modules follow the contract, not the prototype.** The frame renders `examples[<state>]` from the screen module (`meta.name`, `meta.states`, `examples` — the plugin's `screen.example.tsx` shape); the state list is `Object.keys(examples)` ordered `meta.states` first; an unknown state falls back to the first. Labels: screen label = `meta.name` in Title Case with dashes and camel humps split (`console-account` → "Console Account"); state label = the key in sentence case (`Keys` → "Keys", `SignedOut` → "Signed out"); step label = `{Screen} – {State}`. (AC-20260915-02-5) | The plugin's templates and doctrine already ship this shape; the prototype's `export const State = { name, args }` convention is gone. Nothing visible changes. |
| D4 | **Journey modules follow the plugin template plus optional fields the page reads when present:** `Step { screen; state? }` (default: the screen's first state), `Journey { id; title; steps; edges; persona? }`, `Edge { from; to; label?; say? }`. The pill's hint text is `say ?? label`; the guide ring targets `[data-to="<label>"]` inside the frame (spec 01 D7's attribute); `persona` feeds the sidebar tooltip. The plugin's `journeys.ts` template gains these optional fields (plugin-side row in the brief). (AC-20260915-02-6) | Keeps `check` (spec 01) and the guide agreeing by construction while preserving every visible journey surface (persona tooltip, hint text, step state). |
| D5 | **Note record = contract row + passthrough extras.** Contract fields: `id`, `screen`, `state`, `component` (the anchored `[data-component]` name, `"__screen"` for the screen itself, `null` for a project note), `key` (the anchor's nth index among same-named components, as a string), `snippet` (80-char text), `status`, `thread`, `project?: true`. Passthrough extras the page owns: `rect` (fraction of the anchor box), `viewport` (`desktop`\|`mobile`), `whole`. `thread[].by` ∈ `owner` (rendered "You"), `session` (rendered "AI"), `client` (rendered "Client"; rendered "You" when the viewer is the client). Ids are `N` + zero-padded max+1 (3 digits). (AC-20260915-02-7) | The contract's `key`+`snippet` carry the anchor; the prototype's geometry stays as extras the plugin never reads. `NotesSchema` is passthrough for exactly this. |
| D6 | **Server API (Vite plugin middleware, all under `/__mock-review/`):** `GET state` → `{ screens, shells, journeys, themes, config, inventory, violations, notes, approval, role }` (`role` = `owner`, or `client` when the request's `Referer`/`?client=` token matches `config.client.token`); `POST notes` with a patch `{ op: 'add', note } | { op: 'update', id, fields } | { op: 'remove', id } | { op: 'journey', id, status?, entry? }` → applies to `design/notes.json` through `writeJsonAtomic`, returns the new document; `POST approval` with `{ op: 'approveScreen', name } | { op: 'unapproveScreen', name } | { op: 'approveJourney', id } | { op: 'clientOk', id } | { op: 'theme', key }` → applies to `design/approval.json`, returns the new document; `GET events` → SSE stream emitting `notes`, `approval`, `files` events when the respective files or `src/**` change (the CLI's `answer` edit reaches the page through this). `GET /` (owner) and `GET /?client=<token>` serve the prebuilt page from `dist/page/`; `GET /?frame=1…` serves the frame HTML (D8); `GET /r/registry.json` serves the in-memory shadcn registry of project components (the reference's "Registry:" line). A client-role request may `POST notes` only with `op: 'add'` (note fields forced to `by: 'client'`) or `op: 'journey'` with an entry, and `POST approval` only with `op: 'clientOk'`; anything else is 403. (AC-20260915-02-8, AC-20260915-02-9, AC-20260915-02-10) | Per-note patches replace the prototype's whole-document POST; the server is the only writer while it runs, and the CLI's file edits are watched. Role enforcement lives server-side so the client role is real, not cosmetic. |
| D7 | **Approval semantics on the page:** `approveScreen` writes `approval.screens[name] = { hash: sha256 of the screen file now, approvedAt: ISO now, states: meta.states, viewports: config.targets.viewports, schemes: config.targets.schemes, screenshots: <existing design/screenshots/<name>-*.png paths, relative> }`; a new note on that screen or a note there turning `open` deletes `approval.screens[name]` (the reference's rule 6); `approveJourney` writes `approval.journeys[id].approvedAt` (keeping `client`); any reply on a journey sets `notes.journeys[id].status = 'open'` (rule 7) and does not touch approval; `clientOk` sets `approval.journeys[id].client = 'ok'`; `theme` sets `approval.theme`. Screen tone: worst-of its notes, else `approved` when `approval.screens[name]` exists, else `answered`. (AC-20260915-02-11, AC-20260915-02-12) | The plugin reads exactly these keys (`docs/research/plugin-requirements.md` §C.8); the hash written is the same oracle `check` reports so the design stage's drift rule holds. |
| D8 | **The frame is served by the host's Vite pipeline, the page is prebuilt.** The plugin answers `GET /?frame=1` with an HTML whose entry is the virtual module `virtual:mock-review-frame` (it `import.meta.glob`s `/src/screens/*.tsx`, `/src/components/*.tsx`, `/src/shells/*.tsx`, imports `/src/index.css` and the picked theme `/src/themes/<approval.theme>.css` when set, and renders `examples[state]` for `#/<screen>?state=` or the component/shell example for `#/__component?name=&example=` inside `div.p-4`; `body` gets `bg-background`). The reviewer page is built by the package (`vite build` of `src/ui` → `dist/page/`, its own Tailwind 4 CSS with the reference's tokens: Geist Variable, `--radius: 0.625rem`, stock neutral oklch) and served statically. `scheme` from the route (`&scheme=dark`) adds the `dark` class to the frame's `<html>`; the reviewer never sets it (the page stays light-only, reference §0.3). (AC-20260915-02-13) | The mock must compile through the host's own aliases and CSS; the reviewer must not depend on the host's CSS or be in its production bundle (ADR-0028). Dark exists only for screenshots (D12). |
| D9 | **Viewports come from config:** `config.targets.viewports` (`WxH` strings) sorted by width descending fill the reference's two device slots — the widest is the `desktop` slot, the narrowest the `mobile` slot (captions `Desktop 1280`, `Mobile 360`); a config with one viewport hides the `mobile` and `both` toggle items; heights are ignored (the frame fills the workspace, reference §3). (AC-20260915-02-14) | The contract makes viewports configurable; the design's two-slot layout is kept exactly. |
| D10 | **Theme pick surface (contract-required, absent from the prototype):** when the host has at least one `src/themes/*.css`, the screen-mode top bar's right cluster gains, before the device switcher, a `Select size="sm"` labelled by the current theme key (placeholder "Theme"), listing the theme keys; choosing one sends `{ op: 'theme', key }` and reloads the frames with that stylesheet. With zero theme files nothing renders. (AC-20260915-02-15) | The plugin's THEME state requires `approval.theme` set "on the served page"; this is the smallest surface that satisfies it, gated so a host without themes sees the prototype unchanged. |
| D11 | **Client role (contract-required):** with `?client=<token>` matching `config.client.token` the page hides the Search and Components footer items, the palette's Components group and Actions, every Delete/Reject/Approve control and the screen "Approve screen" line, and shows on each journey panel a `Button` **Confirm journey** (opens an `AlertDialog` "Confirm {title}?" / "You confirm this journey works as you expect." / Cancel, Confirm) which sends `clientOk`; a client may draw and save notes (saved with `thread[0].by = 'client'`) and reply to journeys. A wrong token renders the owner page (the token gate is server-side, D6). (AC-20260915-02-16) | Doctrine § Mocks: Client Player, verbatim minus what it forbids. |
| D12 | **`check --look <screen> [--state <s>]`** requires a running `serve` (else exit 2 `mock-review: --look needs a running serve — remedy: npx mock-review serve`) and `playwright` resolvable from the host (else exit 2 `mock-review: --look needs playwright — remedy: npm i -D playwright`); it opens `<serve.url>/?frame=1#/<screen>?state=<s>&scheme=<scheme>` for every `config.targets.viewports × schemes` in headless Chromium, waits for network idle, and writes `design/screenshots/<screen>-<state>-<WxH>-<scheme>.png`, printing one path per line; without `--state` it captures every state. (AC-20260915-02-17) | Fable ruling 7: Playwright only behind `--look`; the session's two sanctioned screenshot moments (doctrine § Look and Serve). |
| D13 | Browser tests run with Playwright (package devDependency) against `serve` on the fixture host from spec 01, in `tests/browser/*.test.ts` under a separate Vitest project (`vitest.config.ts` `projects`: `unit` and `browser`); `npm run test` runs both; `SKIP_BROWSER=1` skips the browser project (declared per AC). (AC-20260915-02-18, AC-20260915-02-19, AC-20260915-02-20) | The raise → answer → approve round trip is the exit check and cannot be proven without a browser. |
| D14 | The end-to-end continuation of spec 01's driver test: after `journey-drawn`, the browser approves `home` and `account`, approves journey `first-visit`, picks theme `nova`, confirms the journey as the client; then the driver records `--mark journey-approved --journey first-visit`, `--mark theme-picked`, `--mark approved` with exit 0. (AC-20260915-02-21) | APPROVED reached with the real driver is the brief's definition of done. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| package.json | MODIFY | other | D8/D13: `build` adds `vite build -c vite.page.config.ts`; devDeps `playwright`, `@playwright/test`-free (plain playwright), shadcn deps (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `react-resizable-panels`, `@fontsource-variable/geist`, `tw-animate-css`); `exports["./page"]` not needed (static) |
| vite.page.config.ts | CREATE | other | D8: builds `src/ui/main.tsx` → `dist/page/` (base `/__mock-review/page/`), Tailwind 4 plugin |
| vitest.config.ts | MODIFY | other | D13: `projects` unit + browser |
| src/ui/main.tsx | CREATE | ui | D2: mounts `TooltipProvider > StoreProvider > SidebarProvider > Router` (reference §0.1) |
| src/ui/index.css | CREATE | ui | D8: tokens per reference §0.3 + the journey ring CSS (§8.3) — the only custom CSS |
| src/ui/router/route.ts | CREATE | ui | D2: `Route` union (`screen`, `components`, `unknown`), `parseRoute`, `href`, `useRoute` (reference §0.2 grammar) |
| src/ui/router/Router.tsx | CREATE | ui | D2: route → `ScreenPage` / `ComponentsPage` / `UnknownScreen` (§11) |
| src/ui/store/store.ts | CREATE | ui | D2: state shape `{ data: ServerState, ui: { view, sideTab, guideOff, marking, reanchor, selected, draft, showNotes, paletteOpen } }`, actions, `useSyncExternalStore` |
| src/ui/store/selectors.ts | CREATE | ui | D7 + reference §13 rules 2–5: `worst`, `screenTone`, `stateTone`, `journeyTone`, `notesHere`, `notesRest`, `statesOf`, `labels` |
| src/ui/store/labels.ts | CREATE | ui | D3: `screenLabel`, `stateLabel`, `stepLabel` |
| src/ui/sync/api.ts | CREATE | ui | D6: `fetchState`, `patchNotes`, `patchApproval`, typed by `src/schemas` |
| src/ui/sync/events.ts | CREATE | ui | D6: SSE subscription → store refresh |
| src/ui/prefs.ts | CREATE | ui | D2: the one sessionStorage accessor |
| src/ui/shell/AppSidebar.tsx | CREATE | ui | reference §1 |
| src/ui/shell/TopBar.tsx | CREATE | ui | reference §2 + D10 theme select |
| src/ui/shell/CommandPalette.tsx | CREATE | ui | reference §9 + D11 client gating |
| src/ui/shell/UnknownScreen.tsx | CREATE | ui | reference §11 |
| src/ui/frame/DeviceFrames.tsx | CREATE | ui | reference §3: scale math, captions, iframes, `inert` |
| src/ui/frame/useMeasure.ts | CREATE | ui | reference rule 17: re-measure loop |
| src/ui/frame/frameHref.ts | CREATE | ui | D8: `/?frame=1#/<screen>?state=&scheme=` and rule 16 (hash replace, never reload) |
| src/ui/notes/anchor.ts | CREATE | ui | reference rule 11–12: `anchorFor`, `resolveBox`, `isOutdated` |
| src/ui/notes/Overlay.tsx | CREATE | ui | reference §4: pins, ghosts, draft box, marking overlay |
| src/ui/notes/NotesPanel.tsx | CREATE | ui | reference §5 + D11 |
| src/ui/notes/NoteDialogs.tsx | CREATE | ui | reference §6 (new note, thread, verdict) |
| src/ui/notes/notes-ui.tsx | CREATE | ui | reference §4 TONE table, `StatusDot`, `StatusLine`, `NotePin`, `NoteRow`, `NoteThread`, `NoteActions` |
| src/ui/notes/useNoteActions.ts | CREATE | ui | D5/D7: add/reply/approve/remove/reanchor → patches |
| src/ui/journeys/JourneyPanel.tsx | CREATE | ui | reference §8.1 + D11 Confirm journey |
| src/ui/journeys/JourneyPill.tsx | CREATE | ui | reference §8.2 |
| src/ui/journeys/useJourneyGuide.ts | CREATE | ui | reference §8.3 + rules 21–25, `[data-to]` lookup (D4) |
| src/ui/journeys/locate.ts | CREATE | ui | reference rule 29 |
| src/ui/catalog/ComponentsPage.tsx | CREATE | ui | reference §10 |
| src/ui/catalog/Preview.tsx | CREATE | ui | reference §10 preview mechanics |
| src/ui/screen/ScreenPage.tsx | CREATE | ui | composes TopBar, DeviceFrames, Overlay, NotesPanel/JourneyPanel, dialogs, shortcuts (§12) |
| src/ui/screen/useShortcuts.ts | CREATE | ui | reference §12 |
| src/ui/components/ui/*.tsx | CREATE | ui | shadcn primitives the reference names (sidebar, tooltip, dialog, alert-dialog, dropdown-menu, breadcrumb, toggle, toggle-group, badge, button, card, separator, resizable, item, field, label, textarea, alert, command, input-group, select, kbd, tabs) from the official registry |
| src/ui/lib/utils.ts | CREATE | ui | `cn` |
| src/frame/entry.tsx | CREATE | server | D8: the virtual frame module source (glob, render `examples[state]`, component route, `scheme`) |
| src/server/plugin.ts | MODIFY | server | D6/D8: endpoints, SSE, frame HTML, static page, registry, role gate |
| src/server/state.ts | CREATE | server | D6: builds `ServerState` (reuses spec 01 `discover`, `inventory`, `journeyReport`, hash); refreshed on `src/**` change |
| src/server/patches.ts | CREATE | server | D6/D7: `applyNotesPatch`, `applyApprovalPatch` (pure, zod-validated) + the un-approve rule |
| src/server/watch.ts | CREATE | server | D6: file watchers → SSE |
| src/server/registry.ts | CREATE | server | D6: in-memory shadcn registry JSON |
| src/schemas/patches.ts | CREATE | schemas | D6: `NotesPatchSchema`, `ApprovalPatchSchema`, `ServerStateSchema` |
| src/analysis/look.ts | CREATE | analysis | D12: Playwright capture |
| src/cli/check.ts | MODIFY | cli | D12: `--look` |
| README.md | MODIFY | other | page, client role, `--look`, screenshots dir |
| tests/fixtures/host/src/themes/nova.css | MODIFY | tests | one visible token change so theme application is observable |
| tests/unit/selectors.test.ts | CREATE | tests | AC-20260915-02-4 |
| tests/unit/labels.test.ts | CREATE | tests | AC-20260915-02-5 |
| tests/unit/router.test.ts | CREATE | tests | AC-20260915-02-3 |
| tests/unit/patches.test.ts | CREATE | tests | AC-20260915-02-7, AC-20260915-02-11, AC-20260915-02-12 |
| tests/unit/journeys.test.ts | CREATE | tests | AC-20260915-02-6 |
| tests/server/api.test.ts | CREATE | tests | AC-20260915-02-8, AC-20260915-02-9, AC-20260915-02-10, AC-20260915-02-13, AC-20260915-02-14 |
| tests/browser/surfaces.test.ts | CREATE | tests | AC-20260915-02-1, AC-20260915-02-2, AC-20260915-02-15, AC-20260915-02-16 |
| tests/browser/roundtrip.test.ts | CREATE | tests | AC-20260915-02-18, AC-20260915-02-19, AC-20260915-02-20 |
| tests/cli/look.test.ts | CREATE | tests | AC-20260915-02-17 |
| tests/e2e/approved.test.ts | CREATE | tests | AC-20260915-02-21 (reuses spec 01's scratch-host helper) |

## Contracts

```ts
// src/schemas/patches.ts
type NotesPatch =
  | { op: 'add'; note: Note }
  | { op: 'update'; id: string; fields: Partial<Omit<Note, 'id'>> }
  | { op: 'remove'; id: string }
  | { op: 'journey'; id: string; status?: 'open' | 'answered' | 'approved'; entry?: ThreadEntry }
type ApprovalPatch =
  | { op: 'approveScreen'; name: string } | { op: 'unapproveScreen'; name: string }
  | { op: 'approveJourney'; id: string } | { op: 'clientOk'; id: string } | { op: 'theme'; key: string }
type ServerState = {
  screens: Screen[]; shells: Shell[]; journeys: (Journey & { persona?: string; steps: { screen: string; state?: string }[]; edges: { from: number; to: number; label?: string; say?: string }[] })[]
  themes: string[]; config: Config | NullConfig; inventory: InventoryRow[]; violations: string[]
  notes: Notes; approval: Approval; role: 'owner' | 'client'
}
// SSE events: `event: notes|approval|files` with `data: {}`; the page refetches `state`.

// Route (src/ui/router/route.ts)
type Route =
  | { kind: 'screen'; screen: string; state?: string; journey?: string; step?: number }
  | { kind: 'components'; c?: string; from?: string }
  | { kind: 'unknown'; path: string }
// frame URL: /?frame=1[&client=<token>]#/<screen>?state=<s>&scheme=<light|dark>  |  #/__component?name=&example=
```

Plugin-side rows (in `~/projects/claude-plugins`, queued, not this spec): `spec/templates/mock/journeys.ts`
gains `state?` on `Step`, `persona?` on `Journey`, `say?` on `Edge`.

## UI

The UI is `docs/design/design-reference.md` §0–§12 in full, with atlas shots `01`–`59` as the
visual half. Reconciliation table (the only places the rebuild reads differently from the
prototype's code, none of them visible unless marked):

| Reference item | Prototype source | Rebuild source | Visible? |
|---|---|---|---|
| screen/state labels (§0.2, rule 35) | `meta.label`, state export `name` | D3 from `meta.name` / example keys | no |
| journey persona tooltip, hint text, step state (§1, §8.2) | `persona`, `edge.say`, `step.state` | D4 optional fields | no |
| guide ring target (§8.3) | `edge.click {in,text}` | `[data-to="<label>"]` | no |
| note anchor (§4, rule 11) | `component,index,rect,snippet` | `component,key(=index),snippet` + extras | no |
| author line "AI"/"You" (§6.2) | `by: ai\|owner` | `session`→AI, `owner`→You, `client`→Client | client label new |
| screen approval (§5, rule 3/6) | `approvedScreens` map | `approval.screens[name]` per D7 | no |
| persistence (rule 10) | whole-document POST | per-note patches + SSE | no |
| device widths (§3) | fixed 1440/390 | D9 from config | captions show config widths |
| theme select (§2) | none | D10, only when themes exist | new, gated |
| client role | none | D11 | new, only with `?client=` |
| Registry line (§10) | `public/r/registry.json` file | in-memory `/r/registry.json` | no |
| dark scheme (§0.3) | none | frame-only via `&scheme=dark` for `--look` | no |

Component API references: the shadcn primitives are copied verbatim from the official registry
(`npx shadcn@4.21.0 add <name>` into the package at build-author time, committed); workers compose
them exactly as the reference's cited classes and props say and never query MCPs.

## Behavior

Startup: the page `fetchState()`s, subscribes to SSE, reads prefs. Every store mutation that
touches notes or approval goes patch → server → new document → store; the store never writes
files. A `files` event refetches state (screens, journeys, inventory, hashes). Rule 6 (un-approve
on new/open note) is applied by the server in `applyNotesPatch` so the CLI and the page agree.

Frame: `frameSrc` is memoised on `screen` (and theme); a state or scheme change replaces the
frame's hash with the full URL (rule 16). The frame entry reads `scheme` and toggles `dark` on
`<html>`.

Journey guide: on a step, the guide waits for every visible frame's hash to match (rule 22), then
finds `[data-to="<label>"]` for each outgoing edge in the frame document, marks it
`data-journey-target` when the ring is on, and intercepts clicks in capture phase (rule 21).
Unfound → the hint carries " (control not found)" in `text-destructive` (§8.2).

## Acceptance Criteria

- **AC-20260915-02-1** `[env: SKIP_BROWSER]`: WHEN the reviewer opens `#/home` on the served fixture host THE SYSTEM SHALL render the left sidebar with Tabs "Journeys"/"Screens", the Screens list with one `StatusDot` per screen, the top bar with a state-switcher breadcrumb, the `ToggleGroup` items aria-labelled Desktop/Mobile/Both, the "Mark an area" toggle with `Kbd` M, the "Notes" toggle with a count badge, the right `Sidebar` (`w-80`) with "THIS SCREEN" and "PROJECT" groups each holding a `+ Note` button, and a caption `Desktop 1280` over a `Card`-framed iframe whose `src` starts `/?frame=1#/home` → writes tests/browser/surfaces.test.ts
- **AC-20260915-02-2** `[env: SKIP_BROWSER]`: WHEN the palette opens with `Ctrl+K` THE SYSTEM SHALL show the placeholder "Search screens, states, journeys…" and groups Screens, Journeys, Components, Actions; WHEN `M` is pressed on a screen THE SYSTEM SHALL show the crosshair overlay; WHEN a drag of 60×40 CSS px ends THE SYSTEM SHALL open the "New note" dialog whose description reads `Home – Default · desktop` and whose Save button is disabled until text is typed; WHEN `#/nope` opens THE SYSTEM SHALL render `No screen "nope" in this prototype.` with links to every screen → writes tests/browser/surfaces.test.ts
- **AC-20260915-02-3**: WHEN `parseRoute('#/account?state=Keys&j=first-visit&step=1')` runs THE SYSTEM SHALL return `{kind:'screen',screen:'account',state:'Keys',journey:'first-visit',step:1}`; `parseRoute('#/components?c=WalletSummary&from=home')` → `{kind:'components',c:'WalletSummary',from:'home'}`; `parseRoute('')` → `{kind:'screen',screen:<first screen>}`; `parseRoute('#/nope')` → `{kind:'unknown',path:'nope'}`; and `href` SHALL invert each → writes tests/unit/router.test.ts
- **AC-20260915-02-4**: WHEN `screenTone('home', notes, approval)` runs with notes `[{screen:'home',status:'answered'},{screen:'home',status:'open'}]` THE SYSTEM SHALL return `open`; with `[{screen:'home',status:'approved'}]` and no `approval.screens.home` → `answered`; with the same and `approval.screens.home` present → `approved`; `stateTone('home','Default', …)` with no pending notes → `null`; `journeyTone('first-visit', {})` → `answered`; and `grep -c '!\\.' src/ui/store/*.ts` SHALL be 0 → writes tests/unit/selectors.test.ts
- **AC-20260915-02-5**: WHEN `screenLabel('console-account')` runs THE SYSTEM SHALL return `Console Account`; `stateLabel('SignedOut')` → `Signed out`; `stepLabel('console-account','Keys')` → `Console Account – Keys`; `statesOf({meta:{states:['default','empty']},examples:{Empty:…,Default:…}})` → `['Default','Empty']` (meta order first, case-matched) → writes tests/unit/labels.test.ts
- **AC-20260915-02-6**: WHEN `hintFor(edge)` runs with `{from:0,to:1,label:'Account',say:'Open your account'}` THE SYSTEM SHALL return `Open your account`; with `{from:0,to:1,label:'Account'}` → `Account`; WHEN `locate(journey, 'account', 'Keys', 1)` runs with step 1 = `{screen:'account',state:'Keys'}` THE SYSTEM SHALL return `1`, and with step 1 = `{screen:'account'}` (no state) and the screen's first state `Default` THE SYSTEM SHALL return `1` only for state `Default` → writes tests/unit/journeys.test.ts
- **AC-20260915-02-7**: WHEN `applyNotesPatch(doc, {op:'add', note})` runs on an empty document with a note lacking `id` THE SYSTEM SHALL assign `N001`, then `N002` on the next add, keep `rect`/`viewport`/`whole` as given, and produce a document `NotesSchema` accepts; WHEN `{op:'update', id:'N001', fields:{status:'open'}}` runs THE SYSTEM SHALL change only that note → writes tests/unit/patches.test.ts
- **AC-20260915-02-8** `[env: SKIP_BROWSER]`: WHEN `GET <url>/__mock-review/state` runs on the served fixture host THE SYSTEM SHALL answer 200 with `screens[].name` `["account","home"]`, `journeys[0].id` `first-visit`, `inventory` containing `WalletSummary`, `notes`, `approval`, and `role: "owner"`; WHEN the request carries `Referer: <url>/?client=replace-me` THE SYSTEM SHALL answer `role: "client"` → writes tests/server/api.test.ts
- **AC-20260915-02-9** `[env: SKIP_BROWSER]`: WHEN `POST notes` `{op:'add', note:{screen:'home',state:'Default',component:'WalletSummary',key:'0',snippet:'Balance',status:'open',thread:[{by:'owner',text:'bigger'}]}}` runs THE SYSTEM SHALL answer with the new document containing `N001`, `design/notes.json` on disk SHALL equal it, and no `*.tmp` SHALL remain; WHEN the CLI `answer --note N001 --text done` then runs THE SYSTEM SHALL emit an SSE `notes` event within 2 s and the next `GET state` SHALL show `N001` `answered` → writes tests/server/api.test.ts
- **AC-20260915-02-10** `[env: SKIP_BROWSER]`: WHEN a client-role request sends `POST notes` `{op:'remove', id:'N001'}` THE SYSTEM SHALL answer 403 and leave the file unchanged; WHEN it sends `{op:'add', note:{…thread:[{by:'owner',text:'x'}]}}` THE SYSTEM SHALL store the entry with `by: 'client'`; WHEN it sends `POST approval` `{op:'approveScreen', name:'home'}` THE SYSTEM SHALL answer 403, and `{op:'clientOk', id:'first-visit'}` SHALL set `approval.journeys["first-visit"].client` = `"ok"` → writes tests/server/api.test.ts
- **AC-20260915-02-11**: WHEN `applyApprovalPatch(approval, {op:'approveScreen', name:'home'}, ctx)` runs with `ctx.hash('home')` = `abc` and `ctx.config.targets` = `{viewports:['360x800','1280x800'],schemes:['light','dark']}` THE SYSTEM SHALL write `screens.home` = `{hash:'abc',approvedAt:<ISO>,states:['default','empty'],viewports:['360x800','1280x800'],schemes:['light','dark'],screenshots:[]}`; `{op:'approveJourney', id:'first-visit'}` on a journey with `client:'ok'` SHALL keep `client:'ok'` and set `approvedAt`; `{op:'theme', key:'nova'}` SHALL set `theme` = `nova` → writes tests/unit/patches.test.ts
- **AC-20260915-02-12**: WHEN `applyNotesPatch` adds a note on `home` while `approval.screens.home` exists THE SYSTEM SHALL return an approval document without `screens.home`; WHEN a note on `home` is updated from `answered` to `open` THE SYSTEM SHALL do the same; WHEN a note on `home` is approved THE SYSTEM SHALL leave `approval` untouched → writes tests/unit/patches.test.ts
- **AC-20260915-02-13** `[env: SKIP_BROWSER]`: WHEN `GET <url>/?frame=1#/home?state=Default` is loaded in Chromium THE SYSTEM SHALL render `[data-component="ConsoleShell"]` containing `<button data-to="Account">` and no reviewer chrome (no `[data-sidebar]`); WHEN the hash is `#/home?state=Default&scheme=dark` THE SYSTEM SHALL have `html.dark`; WHEN `GET <url>/` is loaded THE SYSTEM SHALL serve the prebuilt page (a `<script>` src under `/__mock-review/page/`), and `vite build` of the fixture host SHALL emit no chunk containing `mock-review` → writes tests/server/api.test.ts
- **AC-20260915-02-14** `[env: SKIP_BROWSER]`: WHEN the page opens on the fixture host (`viewports: ['360x800','1280x800']`) THE SYSTEM SHALL caption the frames `Desktop 1280` and `Mobile 360` and size the desktop iframe 1280 CSS px wide before scaling; WHEN the host config lists one viewport THE SYSTEM SHALL render only the Desktop toggle item → writes tests/server/api.test.ts
- **AC-20260915-02-15** `[env: SKIP_BROWSER]`: WHEN the fixture host has `src/themes/nova.css` THE SYSTEM SHALL show a `Select` with placeholder "Theme" in the top bar; WHEN `nova` is chosen THE SYSTEM SHALL write `approval.theme` = `nova` and the frame document SHALL include a stylesheet whose href contains `themes/nova.css`; WHEN the host has no `src/themes/` THE SYSTEM SHALL render no theme control → writes tests/browser/surfaces.test.ts
- **AC-20260915-02-16** `[env: SKIP_BROWSER]`: WHEN the page opens at `/?client=replace-me` THE SYSTEM SHALL render no "Components" or "Search" footer item, no Delete/Reject/Approve button anywhere, and on `#/home?j=first-visit&step=0` a "Confirm journey" button whose confirm writes `approval.journeys["first-visit"].client` = `"ok"`; WHEN it opens at `/?client=wrong` THE SYSTEM SHALL render the owner page → writes tests/browser/surfaces.test.ts
- **AC-20260915-02-17**: WHEN `check --look home --state Default` runs on the fixture host with `serve` running and `playwright` resolvable THE SYSTEM SHALL write `design/screenshots/home-Default-1280x800-light.png`, `…-1280x800-dark.png`, `…-360x800-light.png`, `…-360x800-dark.png` (non-empty PNGs) and print the four paths; WHEN it runs with no `serve` THE SYSTEM SHALL exit 2 with stderr containing `remedy: npx mock-review serve` → writes tests/cli/look.test.ts
- **AC-20260915-02-18** `[env: SKIP_BROWSER]`: WHEN, on `#/home`, the tester presses `M`, drags over the `WalletSummary` element and saves "Make the balance bigger" THE SYSTEM SHALL show pin `N001` red on the frame, a red `NoteRow` under THIS SCREEN, and `design/notes.json` SHALL contain `N001` with `component: "WalletSummary"`, `status: "open"`, `thread[0]` = `{by:'owner',text:'Make the balance bigger'}` → writes tests/browser/roundtrip.test.ts
- **AC-20260915-02-19** `[env: SKIP_BROWSER]`: WHEN the CLI then runs `answer --note N001 --text "Done: 2xl"` THE SYSTEM SHALL, without a reload, turn pin `N001` yellow and the thread dialog SHALL show an "AI" entry `Done: 2xl` with buttons Reject, Approve, Reply; WHEN Approve is confirmed THE SYSTEM SHALL turn the pin blue, hide Reject/Approve, and `notes.json` SHALL show `status: "approved"` → writes tests/browser/roundtrip.test.ts
- **AC-20260915-02-20** `[env: SKIP_BROWSER]`: WHEN, with no open note on `home`, the "Approve screen" line's Approve is confirmed THE SYSTEM SHALL write `approval.screens.home` with `hash` equal to `check --json`'s `screens[home].hash` and turn the sidebar dot blue; WHEN a new note is then saved on `home` THE SYSTEM SHALL remove `approval.screens.home` and turn the dot red → writes tests/browser/roundtrip.test.ts
- **AC-20260915-02-21** `[env: SPEC_PLUGIN_ROOT]` `[env: SKIP_BROWSER]`: WHEN, on spec 01's scratch host after `journey-drawn`, the browser approves screens `home` and `account`, approves journey `first-visit`, picks theme `nova`, and the client confirms the journey THE SYSTEM SHALL let `mocks-driver.js --mark journey-approved --journey first-visit`, `--mark theme-picked` (after `mock.config.ts` `theme: 'nova'`) and `--mark approved` each exit 0 and `status.json` SHALL read state `APPROVED`; and WHEN, in state `CLIENT` (after `theme-picked`, before the client confirms), `serve` is running and the driver's `client open` runs THE SYSTEM SHALL print `<serve url>/?client=replace-me`, and WHEN `serve` has been stopped and `client open` runs THE SYSTEM SHALL exit 2 with stderr containing `remedy: npx mock-review serve` (moved from spec 01's former AC-20260915-01-24, spec 01 D16) → writes tests/e2e/approved.test.ts

## Assumptions (escalation triggers)

- A1: A prebuilt static page under `dist/page/` served by the plugin middleware can call same-origin endpoints and SSE with no CORS — standard same-origin behaviour — **if false:** serve the page through the host's Vite pipeline as a virtual entry importing the package's built ESM.
- A2: `import.meta.glob('/src/screens/*.tsx', { eager: true })` inside a virtual module resolves against the host root in Vite 8 — the prototype's `main.tsx:15` did this from a real file; **executed 2026-09-15** in spike a that the runner resolves host `@/` paths from a virtual context is not yet shown — **if false:** the plugin generates the glob list at request time from `discover()` and emits static imports into the virtual module.
- A3: Playwright 1.63 headless Chromium is present in `~/.cache/ms-playwright` on the build machine (used for the atlas capture 2026-09-15) — **if false:** `npx playwright install chromium` in `tests/setup.ts` when `SKIP_BROWSER` is unset.
- A4: The plugin's `--mark theme-picked` requires `mock.config.ts` `theme` to equal `approval.theme` (plugin spec 01 D8, edited by the session) — the e2e test edits the file itself — **if false:** read `mocks-driver.js:432-450` and follow the refusal text.
- A5: shadcn `4.21.0` `add` into a non-host package directory works with a `components.json` pointing at `src/ui` — **if false:** copy the primitive sources from the prototype's `src/components/ui/` (they are the same registry version).
- A6: Tailwind 4 `@tailwindcss/vite` in `vite.page.config.ts` compiles the reviewer's classes (including the reference's `data-*` variants) without the host — **if false:** move the reviewer build to `@tailwindcss/cli`.

## Rationale

The design is the prototype (JJ, 2026-09-15: "the design itself must be the same, although
implementation should be improved"); this spec therefore cites the design reference as its UI
section instead of restating 700 lines, and lists exhaustively where the contract forces a
different data source underneath (the reconciliation table). Three surfaces have no prototype
counterpart because the plugin's contract requires them — theme pick, client role, dark frames
for screenshots — and each is gated so a host that does not use it sees the prototype
unchanged. Reject destroying the note, and a reply reopening a note, are kept as the prototype
does them.

D8 separates the two render pipelines deliberately: the mock must compile through the host's
Vite (aliases, Tailwind, records), the reviewer must not touch the host's CSS or production
bundle. A prebuilt page plus SSE is simpler than threading the reviewer through the host's HMR.
The server owns rule 6 (un-approve on a new or reopened note) so the CLI's `answer` and the page
cannot disagree.

No `SHALL CONTINUE TO` pin: greenfield. AC-21 lives in its own e2e file that reuses spec 01's
scratch-host helper. Split from spec 01 at the browser boundary where the test runtime
changes (JJ: "2 specs is fine").

Fragile: the anchor rules (§4, rule 11) depend on `[data-component]` attributes the authoring
skill tells sessions to emit; a host that omits them anchors every note to `__screen` — correct,
just less precise. Watch the `files` SSE storm on large hosts; debounce at 200 ms.

## Canonical Delta

Extends `docs/canonical/package.md` with: the server API table (endpoints, patches, roles), the
SSE events, the frame URL grammar, the approval semantics (rule 6 server-side), the theme and
client surfaces, and the `--look` output path convention.
