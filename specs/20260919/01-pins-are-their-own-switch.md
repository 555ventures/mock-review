---
date: 2026-09-19
status: done
tier: standard
area: ui
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-19
build_base: main
open_markers: 0
diff_base: b19be20e2ef411a6cdb9ab8e00189eb46adf5cca
---

# Pins are their own switch

## Goal

One store boolean, `showNotes`, does two unrelated jobs today: it mounts the right-hand Notes
panel *and* it gates whether note pins and ghosts paint on the mock. Closing the panel therefore
wipes every annotation off the artwork, which is the opposite of what a reviewer wants when they
close the panel to see the design. Split it into `notesPanel` and `pins`, give `pins` its own top
bar control, and make entering mark mode force pins on so an author can never draw into a canvas
that will not show what they drew. Done means: the panel and the pins are independently
controllable, the frozen design document and its screenshots describe the new behaviour, and the
store's defaults and the journey-mode pin rule have tests for the first time.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `UiState.showNotes: boolean` becomes `notesPanel: boolean` + `pins: boolean`, both `true` in `initialUi()`. Neither is added to `src/ui/prefs.ts`; rule 31's persisted list (`guide-off`, `view`, `side-tab`) is unchanged. Both stay out of the D27 screen-change reset at `ScreenPage.tsx:91` — they are chrome and survive navigation. (AC-20260919-01-6, AC-20260919-01-7) | The two concepts have no shared cause; `showNotes` was never persisted, so neither successor starts persisting. |
| D2 | Rule 39 is a **pure patch builder**, not a store action: `export function enterMarking(extra: Partial<Omit<UiState, 'marking' \| 'pins'>> = {}): Partial<UiState>` in `src/ui/store/store.ts`, returning `{ ...extra, marking: true, pins: true }`. The store keeps `setUi` as its only mutator. (AC-20260919-01-4) | The store has zero named actions today; adding one introduces a second idiom the next contributor extends. Spread order makes the rule unoverridable, the `Omit` makes it uncircumventable. |
| D3 | All four mark-mode entries route through `enterMarking`, keeping their own companion clearing: `:230` `setUi((u) => (u.marking ? { marking: false } : enterMarking()))`; `:288` `onMarkingChange={(v) => setUi(v ? enterMarking() : { marking: false })}`; `:381` `setUi(enterMarking({ cardOpen: false, draft: null, reanchor: selectedNote.id }))`; `:397` `setUi(enterMarking({ draft: null, cardOpen: false }))`. The five `marking: false` exits are untouched. `enterMarking` never sets `reanchor`. (AC-20260919-01-3, AC-20260919-01-4) | The four sites clear different things on purpose; harmonising them would silently change what `M` does to an unsaved draft. The two toggles express "off" as the same `{ marking: false }` the exits already write. |
| D4 | Rule 39 is enforced by a source scan in `tests/unit/store.test.ts`: `/\bmarking:(?!\s*(false\|boolean)\b)/` over `src/ui/**/*.{ts,tsx}` excluding `src/ui/store/store.ts`, read with `readFileSync`, expected to match zero lines. (AC-20260919-01-5) | Executed against HEAD it hits exactly the four entry points and nothing else — prop types (`marking: boolean`) and all five exits (`marking: false`) are excluded, and JSX props use `=` not `:`. Rejected: narrowing `setUi`'s patch type, which would force the five exits through actions and harmonise exactly what D3 protects. Rejected: `spawnSync('grep', ['-P', …])` as in the `!.` scan — PCRE lookahead is GNU-only. |
| D5 | New selector `areaNotesOn<N extends { screen: string \| null; state: string \| null; whole?: boolean }>(screen, state, notes: readonly N[]): N[]` in `src/ui/store/selectors.ts`, filtering `n.screen === screen && sameState(n.state, state) && !n.whole`. It filters on `whole` and **never** on `component === SCREEN_ANCHOR`, and carries no `project` clause. (AC-20260919-01-8) | `anchorFor` (`anchor.ts:52`) resolves an area note to `SCREEN_ANCHOR` whenever no `[data-component]` ancestor is found — which is every note on every host today — so a component-based filter would blank every pin in production. Project notes already carry `screen: null`, so a `project` clause would be dead code whose comment lies about why it exists. Typed structurally because `whole` lives on `UiNote`, not on the schema's `Note`. |
| D6 | `DeviceFrames`' measurement `useLayoutEffect` (`:221-239`) keeps its in-loop `n.screen !== screen \|\| !sameState(n.state, state)` filter and keeps receiving the unfiltered `notes` array. Only `visible` (`:288`) changes, to `pins ? areaNotesOn(screen, state, notes).map(…) : []`. (AC-20260919-01-1, AC-20260919-01-2) | Measurement feeds `isOutdatedNote` (`ScreenPage.tsx:254`), which reads `boxesBy[v]?.[n.id] === null` and is reachable from the panel list with pins off. Passing a pre-filtered array down (what the throwaway spike did) drops whole-screen notes out of the box map, turning their entry from `null` into `undefined` and changing that predicate's answer. |
| D7 | `Overlay.tsx:36` loses `\|\| note.whole`, becoming `if (!box) return null`. The ghost branch's `note.component === SCREEN_ANCHOR ? null : …` at `:38` **stays**. (AC-20260919-01-8, AC-20260919-01-10) | `areaNotesOn` now owns the whole-note exclusion. The `:38` test is per-viewport — it suppresses a full-frame dashed ghost for root-anchored area notes in Both view — and cannot live in a screen-level selector. |
| D8 | No `pinsShown`/`markingActive` selectors. `ScreenPage` keeps `pins={pins && !journey}` and `marking={marking && !journey}` inline. The rule-26 gap is closed with a test instead. (AC-20260919-01-9) | A selector wrapping `a && !b` moves a route concept into `selectors.ts` and a unit test of it proves nothing about rule 26; rule 26 has no test at all today, which is the actual hole. |
| D9 | The scroll-to-row effect (`ScreenPage.tsx:133-147`) is fixed in three places: `scrollToRow.current = null` moves **below** the `if (!row \|\| !scrollParent) return` guard; `notesPanel` joins the dependency array; and `select` writes the marker unconditionally as `scrollToRow.current = fromList ? null : id`. The marker is also cleared in the D27 reset at `:91`. (AC-20260919-01-11) | The marker is consumed before the guard that bails when the panel is unmounted, so a pin click with the panel closed silently eats it — rare today, routine once pins are clickable with the panel closed. The unconditional write fixes the companion bug where a stale pin-click marker fires after a later list click. |
| D10 | The Pins toggle sits in the right cluster **after Mark an area and before the vertical `Separator`**; the separator does not move. `<Toggle variant="outline" size="sm" pressed={pins} onPressedChange={…}><Pin /> Pins</Toggle>` inside a `Tooltip` whose content is exactly `Show note pins on the mock · Mark an area turns them on`. Glyph is `Pin` always — never swapped for `PinOff`. No `aria-label`, so the accessible name is exactly `Pins`. No badge. Hidden in journey mode, alongside Mark an area. (AC-20260919-01-9, AC-20260919-01-12) | The separator already divides controls that act on the mock from the control that mounts the panel; Pins acts on the mock, so it joins Mark an area on the left of it, and the two journey-hidden controls disappear as one block. The outline `Toggle` already states off/on through `aria-pressed` and its `bg-muted` pressed fill, so a swapping glyph would say "off" twice. The count belongs to the notes list, not to pin visibility. |
| D11 | `CommandPalette` gains `onTogglePins?: (() => void) \| undefined`, rendered in the Actions group as `<CommandItem value="Toggle pins" onSelect={() => run(onTogglePins)}><Pin />Toggle pins</CommandItem>`, wired at `ScreenPage.tsx` with the same guard as `onMark`: `role === 'owner' && !journey`. (AC-20260919-01-12) | Journey-suppressed like `onMark`, not merely owner-gated like `onToggleNotes` — otherwise the palette can flip `pins` in journey mode with no visible effect. |
| D12 | Atlas: re-capture `06-topbar-chrome-screen-mode.png` in place (same ~56px strip, screen mode, Pins pressed); replace `37-notes-panel-hidden.png` in place (same full-window framing, Notes unpressed with its badge, panel absent, **pins now visible on the mock**); add `60-pins-hidden-panel-open.png` (full window, Pins unpressed, Notes pressed with rows visible, **no** pins or ghosts on the mock). All three land in the same commit as the prose. (AC-20260919-01-13) | The document calls the atlas "the visual half of the same contract" (`:71`) and `37` is cited from the exact passage that describes the toggle; a worker or reviewer who opens a stale `37` will re-derive the coupling this spec removes. |
| D13 | `docs/design/design-reference.md` gets a `### 2026-09-19 — specs/20260919/01-pins-are-their-own-switch.md` entry at the top of `## Amendments`, and five passages are rewritten in place with the `**Amended 2026-09-19** (see Amendments)` marker: `:230-233` (§2, replaced by the two passages in **UI** below), `:313-314` (§5, `showNotes` → the **Notes** toggle), `:451` (§7.2, "forces the notes panel visible" stays true and gains "the Pins toggle is untouched"), `:570` (§9, a "Toggle pins" action), and rule 26 at `:751-754` (`showNotes && !journey` → `pins && !journey`). New rule 39 is appended after `:781`. Rule 31 is **not** touched. (AC-20260919-01-13) | These are the only five places the coupling is asserted; §4, §7.4, rule 18 and §12 were checked and assert nothing about it. |
| D14 | `tests/unit/design-reference.test.ts` stops hard-coding a date: the first-entry assertion becomes "the first `### YYYY-MM-DD` heading after `## Amendments` is the newest date in the document", derived by parsing every entry heading and comparing. (AC-20260919-01-14) | `:28`'s `toContain('2026-09-18')` breaks on every future amendment, making the next spec pay for this one's doc edit. |
| D15 | `tests/unit/store.test.ts` is created — the repo's first unit test over `store.ts`. (AC-20260919-01-4, AC-20260919-01-5, AC-20260919-01-6, AC-20260919-01-7) | Nothing currently asserts any `UiState` default; the only safety net for "pins default on" is nine browser tests that would pass a silent flip to `false` in eight of them. |
| D16 | `tests/browser/surfaces.test.ts`'s AC-20260915-02-2 is rewritten, not deleted: the two halves that still hold (mark mode works with the panel hidden; the panel does not open on commit) become this spec's regression pin, and the pin-hidden assertion inverts. Its title's `reference §4 / rule 26` citation becomes `rule 39`. (AC-20260919-01-1, AC-20260919-01-15) | It is the only test in the repo that exercises authoring with the panel closed; the behaviour it guards is half-retired, not retired. |
| D17 | `docs/design/README.md` joins the File Plan (MODIFY, other): its atlas count goes 59 → 60, and a reproduction note records that `06`, `37` and `60` are captured from this package (`mock-review serve` against `tests/fixtures/host`, same 1600×1000 / `deviceScaleFactor: 1` framing) rather than from the prototype. Added 2026-09-19 at review, on the disposer's `fix` recommendation for the out-of-plan edit. [no-ac: documentation-only — the count and the provenance note have no runtime surface, and no test reads this README; asserting the count in a test would only restate `ls docs/design/atlas \| wc -l`] | D12 adds a 60th atlas file, which makes the README's stated count false — reverting the edit would leave the document lying about its own folder. The provenance note exists because `capture-atlas.mjs` still drives the prototype, which has no Pins control: a future re-run would silently overwrite `06` and `37` with pre-split shots and quietly undo D12. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/ui/store/store.ts | MODIFY | ui | D1 split `showNotes` into `notesPanel`/`pins` in `UiState` + `initialUi`; D2 add the exported `enterMarking` patch builder; update the rule-31 comment |
| src/ui/store/selectors.ts | MODIFY | ui | D5 add `areaNotesOn` (filters on `whole`, never on `SCREEN_ANCHOR`, no `project` clause) |
| src/ui/screen/ScreenPage.tsx | MODIFY | ui | D1 two reads + rewrite the `:82-86` chrome comment; D3 the four `enterMarking` call sites; D6 `visible` gate plumbing; D9 the scroll-marker fix and the `:91` reset; D10/D11 the new TopBar and palette props |
| src/ui/frame/DeviceFrames.tsx | MODIFY | ui | D6 rename the `showNotes` prop to `pins` through `DeviceFrames` → `Device`, switch `visible` to `areaNotesOn`, keep the measurement filter, rewrite the `:281-287` comment for rule 39 |
| src/ui/notes/Overlay.tsx | MODIFY | ui | D7 drop `\|\| note.whole` from `:36`; keep the `SCREEN_ANCHOR` ghost branch at `:38` |
| src/ui/shell/TopBar.tsx | MODIFY | ui | D10 rename the `showNotes`/`onShowNotesChange` props to `notesPanel`/`onNotesPanelChange`; add the Pins toggle with its tooltip, journey-hidden |
| src/ui/shell/CommandPalette.tsx | MODIFY | ui | D11 add the optional `onTogglePins` prop and its "Toggle pins" Actions item |
| tests/unit/store.test.ts | CREATE | tests | AC-20260919-01-4, AC-20260919-01-5, AC-20260919-01-6, AC-20260919-01-7 |
| tests/unit/selectors.test.ts | MODIFY | tests | AC-20260919-01-8 |
| tests/unit/design-reference.test.ts | MODIFY | tests | AC-20260919-01-13, AC-20260919-01-14 |
| tests/browser/surfaces.test.ts | MODIFY | tests | AC-20260919-01-1, AC-20260919-01-2, AC-20260919-01-3, AC-20260919-01-9, AC-20260919-01-10, AC-20260919-01-11, AC-20260919-01-12, AC-20260919-01-15 |
| docs/design/design-reference.md | MODIFY | other | D13 the 2026-09-19 Amendments entry, five rewritten passages, new rule 39 |
| docs/design/atlas/06-topbar-chrome-screen-mode.png | MODIFY | other | D12 re-capture with the Pins toggle present and pressed |
| docs/design/atlas/37-notes-panel-hidden.png | MODIFY | other | D12 re-capture: panel absent, pins now visible on the mock |
| docs/design/atlas/60-pins-hidden-panel-open.png | CREATE | other | D12 new: Pins unpressed, panel open, no pins or ghosts on the mock |
| docs/design/README.md | MODIFY | other | D17 the atlas count (59 → 60) and the note that `06`/`37`/`60` are captured from this package, not the prototype |

Orchestrator duty, outside the table: the three atlas captures are driven from a running
`mock-review serve` against `tests/fixtures/host` in one browser session (37 and 60 differ by
flipping two toggles) and must land in the same commit as `design-reference.md`.

## Contracts

```ts
// src/ui/store/store.ts
export type UiState = {
  view: ViewMode
  sideTab: SideTab
  guideOn: boolean
  marking: boolean
  reanchor: string | null
  selected: string | null
  cardOpen: boolean
  draft: Draft | null
  notesPanel: boolean   // was: showNotes — mounts the right-hand panel (and the JourneyPanel)
  pins: boolean         // was: showNotes — paints note pins and ghosts on the mock
  paletteOpen: boolean
}
// initialUi(): notesPanel: true, pins: true. Neither is persisted; setUi's sessionStorage
// fan-out still covers only view / sideTab / guideOn (design rule 31).

/** Rule 39: every entry into mark mode turns pins on and leaves them on. The spread order makes
 * the rule unoverridable; the `Omit` makes it uncircumventable. */
export function enterMarking(extra: Partial<Omit<UiState, 'marking' | 'pins'>> = {}): Partial<UiState> {
  return { ...extra, marking: true, pins: true }
}
```

```ts
// src/ui/store/selectors.ts
/** The notes that paint on the mock for this screen/state. Filters on `whole`, never on
 * `component === SCREEN_ANCHOR`: `anchorFor` resolves an area note to SCREEN_ANCHOR whenever no
 * `[data-component]` ancestor is found, which is every note on every host today, so a
 * component-based filter would blank every pin. Project notes carry `screen: null` and are
 * excluded by the screen test alone. */
export function areaNotesOn<N extends { screen: string | null; state: string | null; whole?: boolean }>(
  screen: string,
  state: string,
  notes: readonly N[],
): N[]
```

```ts
// src/ui/shell/TopBar.tsx — props renamed, two added
notesPanel: boolean
onNotesPanelChange: (v: boolean) => void
pins: boolean
onPinsChange: (v: boolean) => void

// src/ui/shell/CommandPalette.tsx — one prop added
onTogglePins?: (() => void) | undefined

// src/ui/frame/DeviceFrames.tsx — prop renamed on both DeviceFrames and Device
pins: boolean   // was: showNotes
```

## UI

The right cluster of the screen-mode top bar becomes, left to right: device `ToggleGroup` →
re-anchor banner → (**Mark an area** | **Open in Screens**, mutually exclusive on journey) →
**Pins** → vertical `Separator` → **Notes**. The separator does not move.

```tsx
{!journey && (
  <Tooltip>
    <TooltipTrigger asChild>
      <Toggle variant="outline" size="sm" pressed={pins} onPressedChange={onPinsChange}>
        <Pin /> Pins
      </Toggle>
    </TooltipTrigger>
    <TooltipContent>Show note pins on the mock · Mark an area turns them on</TooltipContent>
  </Tooltip>
)}
```

`Pin` is imported from `lucide-react` (verified present in the installed 1.46.0 — see A2). No
`aria-label`, so the accessible name is exactly `Pins`; tests must use
`getByRole('button', { name: 'Pins' })` and never a regex containing "Notes", because nine
existing tests find the Notes control with `{ name: /Notes/ }`. No badge. No keyboard shortcut —
`P` stays unbound.

**Paste-ready replacement for `docs/design/design-reference.md:230-233`** (the §2 "Notes toggle"
passage; the Pins passage goes first because it renders first):

> **Pins toggle** (**Amended 2026-09-19** (see Amendments): no prototype counterpart —
> `src/ui/shell/TopBar.tsx`), screen mode only, directly after Mark an area:
> `Toggle variant="outline" size="sm"` bound to `pins`, content `<Pin /> Pins` — text label, no
> `aria-label`, no badge, the glyph never swaps; tooltip `Show note pins on the mock · Mark an area
> turns them on`. It hides and shows the pins and ghosts painted on the mock (§4) and nothing else:
> the Notes panel, the draft box and the marking overlay are unaffected. Hidden in journey mode
> together with Mark an area (rule 26). Atlas: `60-pins-hidden-panel-open.png`.
>
> **Notes toggle** (`:512-515`): a vertical `Separator` (`mx-1 …`), then
> `Toggle variant="outline" size="sm"` bound to `notesPanel` (**Amended 2026-09-19** (see
> Amendments): formerly `showNotes`, which also gated the pins — that job now belongs to `pins`
> above), content `<PanelRight /> Notes` plus, in screen mode only, a `Badge variant="secondary"`
> with the count of notes on this screen. No badge in journey mode. Hiding the panel leaves the
> pins on the mock. Atlas: `37-notes-panel-hidden.png`.

**Paste-ready new rule 39**, appended to §13 after rule 38 (`:781`):

> 39. **Entering mark mode turns pins on and leaves them on** (**Amended 2026-09-19** (see
>     Amendments)): every way into `marking` — `M`, the Mark an area toggle, the palette's "Mark an
>     area", and Re-anchor from a note thread — also sets `pins: true` (`store.ts`, `enterMarking`),
>     so a drawn area, a saved note and a re-anchored pin are always visible where they land; before
>     this rule, saving with pins hidden changed nothing on screen but the Notes count. The forcing
>     happens on entry only: turning pins off *while* marking is respected until the next entry, and
>     leaving mark mode by any of its exits never touches `pins`. `N` and the panel's Add note are
>     not mark mode — whole-screen and project notes paint no pin (§7.2) — so they keep forcing the
>     **panel** (`notesPanel: true`), never the pins.

## Behavior

**The independence matrix.** Four states, all reachable, none of which the page could express
before:

| `notesPanel` | `pins` | Panel | Pins on the mock | Mark mode |
|---|---|---|---|---|
| on | on | mounted | painted | available |
| off | on | absent | painted | available |
| on | off | mounted | none | available, and entering it flips `pins` on |
| off | off | absent | none | available, and entering it flips `pins` on |

**Why rule 39 exists.** Verified in a browser before this spec was written: with pins off,
drawing and saving a note leaves the canvas completely empty. No dialog opens afterwards —
`saveDraft` (`:210`) sets `selected` but never `cardOpen`, and the thread dialog's gate is
`open={!draft?.open && cardOpen && !!selectedNote}` (`:375`). The only thing that changes on
screen is the Notes count badge. Re-anchor is worse: no feedback at all. Rule 39 makes that
state unreachable rather than papering over it with a dialog.

**Journey mode.** `pins` is chrome and survives navigation, so a user who hid pins, entered a
journey, and came back finds the Pins toggle present and un-pressed — the cause is on screen. The
toggle is hidden (not disabled) in journey mode, matching how Mark an area is swapped for "Open in
Screens" and how the Notes badge disappears; this codebase has no disabled-during-journey
precedent. The palette's "Toggle pins" is journey-suppressed for the same reason.

**What does not change.** The Notes panel still gates the `JourneyPanel` as well as the
`NotesPanel`. `noteOnScreen` still forces `notesPanel: true` and still does not touch `pins`.
Clicking a pin still opens the thread dialog, panel or no panel. Box measurement still runs
whether or not pins are painted.

## Acceptance Criteria

- **AC-20260919-01-1** `[env: SKIP_BROWSER]`: WHEN the Notes panel is hidden and a note is drawn and
  saved THE SYSTEM SHALL paint its pin on the mock while the panel stays absent — after the save,
  `[data-note]` count > 0 and `[data-notes-scroll]` count = 0 → rewrites tests/browser/surfaces.test.ts :: AC-20260915-02-2 (escape
- **AC-20260919-01-15** `[env: SKIP_BROWSER]`: WHEN the Notes panel is hidden and `M` is pressed THE
  SYSTEM SHALL CONTINUE TO mount the crosshair overlay and open the New note dialog on a drag, and
  SHALL CONTINUE TO leave the panel closed when the note is committed → rewrites tests/browser/surfaces.test.ts :: AC-20260915-02-2 (escape
- **AC-20260919-01-2** `[env: SKIP_BROWSER]`: WHEN the Pins toggle is turned off with the Notes panel
  open THE SYSTEM SHALL remove every pin and ghost from the mock while the panel keeps listing the
  same rows — `[data-note]` and `[data-ghost]` counts = 0, `[data-row]` count unchanged
  → writes tests/browser/surfaces.test.ts
- **AC-20260919-01-3** `[env: SKIP_BROWSER]`: WHEN mark mode is entered from any of its four entries
  while pins are off THE SYSTEM SHALL turn pins on and leave them on after mark mode exits — the
  Pins toggle reads `aria-pressed="true"` after pressing `M`, and still reads `aria-pressed="true"`
  after `Esc` → writes tests/browser/surfaces.test.ts
- **AC-20260919-01-4**: WHEN `enterMarking` is called THE SYSTEM SHALL return a patch carrying
  `marking: true` and `pins: true` that no caller-supplied field can override — `enterMarking({ draft: null, cardOpen: false })`
  → `{ draft: null, cardOpen: false, marking: true, pins: true }`, and `enterMarking({ pins: false } as never)`
  → `{ pins: true, marking: true }` → writes tests/unit/store.test.ts
- **AC-20260919-01-5**: WHEN any file under `src/ui/` other than `src/ui/store/store.ts` writes a
  `marking:` property whose value is not `false` and not the type `boolean` THE SYSTEM SHALL fail —
  `/\bmarking:(?!\s*(false|boolean)\b)/` matches zero lines across the 59 scanned files
  → writes tests/unit/store.test.ts
- **AC-20260919-01-6**: WHEN the store is initialised THE SYSTEM SHALL set `notesPanel` and `pins`
  both to `true` — `initialUi().notesPanel` → `true`, `initialUi().pins` → `true`
  → writes tests/unit/store.test.ts
- **AC-20260919-01-7**: WHEN `setUi` is called with `{ notesPanel: false }` or `{ pins: false }` THE
  SYSTEM SHALL write nothing to `sessionStorage` — the three persisted keys (`guide-off`, `view`,
  `side-tab`) keep the values they had, and no fourth key appears → writes tests/unit/store.test.ts
- **AC-20260919-01-8**: WHEN `areaNotesOn` is given a screen's notes THE SYSTEM SHALL keep every
  area note whose `component` is `'__screen'` and drop only the ones marked `whole` — given
  `[{screen:'home', state:'default', component:'__screen'}, {screen:'home', state:'default', component:'__screen', whole:true}, {screen:'other', state:'default'}]`
  and `('home','default')` → a one-element array holding the first → writes tests/unit/selectors.test.ts
- **AC-20260919-01-9** `[env: SKIP_BROWSER]`: WHEN a journey is active THE SYSTEM SHALL paint no
  note pins, offer neither the Pins nor the Mark an area control, and do nothing on `M` —
  `[data-note]` count = 0, `getByRole('button', { name: 'Pins' })` count = 0,
  `getByRole('button', { name: 'Mark an area' })` count = 0, and no `.cursor-crosshair` after
  pressing `m` → writes tests/browser/surfaces.test.ts
- **AC-20260919-01-10** `[env: SKIP_BROWSER]`: WHEN a whole-screen note is saved with `N` THE SYSTEM
  SHALL list it as a row reading `Whole screen` while painting no box, pin or ghost — `[data-row]`
  count grows by one, `[data-note]` and `[data-ghost]` counts unchanged, pins on
  → writes tests/browser/surfaces.test.ts
- **AC-20260919-01-11** `[env: SKIP_BROWSER]`: WHEN a pin is clicked with the Notes panel closed and
  the panel is then opened THE SYSTEM SHALL scroll that note's row into view — against a host
  seeded with enough notes to overflow the list, `[data-notes-scroll]`'s `scrollTop` is greater than
  0 and the selected `[data-row]` sits inside the scroll container's box
  → writes tests/browser/surfaces.test.ts
- **AC-20260919-01-12** `[env: SKIP_BROWSER]`: WHEN the command palette is opened in screen mode as
  the owner THE SYSTEM SHALL offer a `Toggle pins` action that flips pin painting, and SHALL NOT
  offer it while a journey is active → writes tests/browser/surfaces.test.ts
- **AC-20260919-01-13**: WHEN `docs/design/design-reference.md` is read THE SYSTEM SHALL carry a
  2026-09-19 Amendments entry and no surviving assertion of the retired coupling — the document
  does not contain `showNotes`, and rule 26's condition reads `pins && !journey`
  → rewrites tests/unit/design-reference.test.ts :: has a top-level
- **AC-20260919-01-14**: WHEN a new Amendments entry is added on top THE SYSTEM SHALL still pass the
  newest-entry check without editing the test — the assertion parses every `### YYYY-MM-DD` heading
  and requires the first to be the maximum, so a 2026-09-20 entry added above passes and a
  2026-09-16 entry added above fails → rewrites tests/unit/design-reference.test.ts :: has a top-level

## Assumptions (escalation triggers)

- **A1**: The rule-39 scan regex `/\bmarking:(?!\s*(false|boolean)\b)/` selects exactly the four
  mark-mode entries and nothing else. **Executed 2026-09-19** against HEAD over
  `src/ui/**/*.{ts,tsx}` minus `store.ts` (60 files): 4 hits — `ScreenPage.tsx:230`, `:288`, `:381`,
  `:397` — and zero elsewhere. **If false:** the scan is reporting coverage it does not have; fall
  back to asserting the four call sites by name against `ScreenPage.tsx` and record the weaker
  guarantee in the test's comment.
- **A2**: `Pin` is exported by the installed `lucide-react`. **Executed 2026-09-19**:
  `import('lucide-react')` against `node_modules` printed `Pin object OK`, `PinOff object OK`,
  version `1.46.0`. **If false:** use `MapPin`, which the same check confirms.
- **A3**: `anchorFor` resolves an area note to `SCREEN_ANCHOR` whenever no `[data-component]`
  ancestor is found, so `component` cannot distinguish an area note from a whole-screen note.
  **Verified 2026-09-19** by reading `src/ui/notes/anchor.ts:52` — `best === root ? SCREEN_ANCHOR :
  (best.dataset['component'] ?? SCREEN_ANCHOR)`. **If false:** D5 is unaffected — filtering on
  `whole` is correct either way; only its comment would need narrowing.
- **A4**: Whole-screen notes resolve their box against the frame root (`anchorEl` returns root for
  `__screen`), so `isOutdatedNote` sees a non-null box and answers `false` for them. **If false:**
  D6's rationale weakens but its instruction stands — keeping the measurement filter is the
  no-change option regardless.
- **A5**: The three atlas captures can be driven from `mock-review serve` against
  `tests/fixtures/host` with the same browser tooling the browser tests already use. **If false:**
  STOP and hand the three captures back as a human step; the prose must not land without them (D12).
- **A6**: `tests/fixtures/host` can be seeded with enough notes to make the panel list overflow, via
  the existing `copyFixtureHost` + `startServeIn` pattern. **If false:** AC-20260919-01-11's
  assertion would be vacuous — drop the test and record D9 as review-verified only, rather than
  shipping an assertion that reads the same before and after the fix.

## Rationale

The conflation is inherited, not designed. The frozen prototype was a single 665-line file where
`const [showNotes, setShowNotes] = useState(true)` happened to be read twice about twenty lines
apart — once for pins, once for the panel. Splitting that file into feature folders moved the two
readers into different directories while faithfully copying the wiring, so the coupling travelled
with the refactor. The design document records it in one screenshot and one clause but never argues
for it; the code comment that cites design rule 26 as the authority is mis-citing — rule 26 governs
journey mode.

D2 is the decision most likely to be second-guessed. The instinct is a `startMarking()` store
action, and that was the earlier plan. It was rejected because the store deliberately exposes
exactly one mutator and composes patches at call sites; a single action owning a subset of keys is
a second idiom, and the next contributor extends it until the five heterogeneous exits get
harmonised — which would silently change what `M` does to an unsaved draft. A pure patch builder
gets the same guarantee (spread order) and the same enforceability (the `Omit` in its argument
type) with no new idiom.

D8 reverses an earlier plan that added `pinsShown`/`markingActive` selectors. A selector wrapping
`a && !b` looks tidy and proves nothing; the honest gap was that rule 26 has never had a test, and
AC-20260919-01-9 is that test.

D5's `whole`-not-component filter is the trap in this change. Every note on every host today
resolves to `component: '__screen'`, because no host emits `data-component` — so the obvious
"exclude screen-anchored notes" filter would blank every pin in production while passing any test
written against a fixture that happens to have components. The spike made a milder version of this
mistake by hoisting the filter above measurement; D6 keeps measurement where it is.

AC-20260919-01-11 and A6 exist because this session logged an escape in exactly this file: an
assertion that read the same value before and after the action it guarded. If the fixture cannot
be made to overflow, the honest move is to drop the test, not to ship one that cannot fail.

## Build notes (folded from the deviations sidecar at close, 2026-09-19)

Six departures were logged during the build. None is promoted to the host's Gotchas section: that
section sits at its cap of 15, and every entry there is live and durable, so displacing one to bank
a trap seen exactly once would be a bad trade. Each is recorded here instead; a second occurrence
of any of them is the argument for promotion.

- **`initialUi` gained `export`.** D1's Contract block shows only `enterMarking` newly exported, but
  AC-20260919-01-6 asserts `initialUi().notesPanel`/`.pins` by direct import. Body unchanged.
- **D9 needed a double-`requestAnimationFrame` its text does not mention.** Applying D9's three
  literal edits verbatim still failed AC-20260919-01-11 by ~240px: `[data-notes-scroll]`'s enclosing
  `ResizablePanel` (`react-resizable-panels`) reports a near-full-list `clientHeight` at the moment a
  synchronous `getBoundingClientRect()` runs on remount, settling to its real height only after its
  `ResizeObserver` fires a frame later. D9's own fix is what first makes this race reachable — it is
  the first case where the effect fires on the exact render a fresh scroll container mounts. The
  measure-and-scroll body is now wrapped in the same double-rAF coalescing idiom `DeviceFrames`
  already uses (design rule 17); the three literal edits are unchanged. **This is the one entry
  closest to Gotchas-worthy** — it is a third-party timing trap, not a local slip — and it is the
  one to promote if anything else in this repo ever measures inside a resizable panel.
- **AC-20260919-01-12's first draft read a background control through an open modal.** It polled for
  the Pins toggle while the command palette's stock Radix `Dialog` was still open, which
  `aria-hidden`s the whole app root. This is the **second recorded occurrence** of the class already
  in the host's Gotchas (cited there to AC-20260915-02-19); a third earns a standing guard per the
  incident policy. Fixed by reading the baseline before the palette opens.
- **AC-20260919-01-13 and the spec's own paste-ready prose contradicted each other.** The AC bans the
  literal `showNotes` document-wide; D13's dictated §2 replacement text names it twice. The AC and
  its literal test were kept and the four amendment markers reworded to cite the prototype's boolean
  by line (`ReviewLayer.tsx:512-515`, `:524`). Precedent: the same test already bans three other
  literals document-wide, and the 2026-09-17/18 Amendments entries were written around that ban, so
  a history entry avoiding the banned string is this document's established convention. A
  second-opinion consult concurred and supplied the wording.
- **AC-20260919-01-5's prose cites "59 scanned files"; the real count is 60.** The test hard-codes
  neither — it asserts the SHALL clause (zero regex hits) plus a non-vacuous `files.length > 0`
  guard, matching D14's own reason for never baking a soon-stale number into an assertion.
- **A typecheck error in the authored tests.** `tests/unit/design-reference.test.ts`'s
  newest-amendment `reduce` tripped `TS18048`; fixed by narrowing the parsed dates to `string[]` with
  a type predicate rather than a `?? ''` fallback. No change to the assertion's meaning.

## Canonical Delta

`docs/canonical/package.md`, "The frame boundary" section — the sentence listing what the reviewer
draws on the mock ("note boxes, pins, the journey ring") gains: *Pin and ghost painting is gated by
its own `pins` chrome flag, independent of whether the notes panel is mounted; entering mark mode
turns it on. Box measurement runs regardless, because the outdated-anchor check reads the same box
map whether or not anything is painted.*

`docs/canonical/package.md`, "Note scope and the status dots" section — after the paragraph on the
panel's two groups, add: *A whole-screen note and a project note never paint on the mock; only area
notes do, and the selector that chooses them keys on the note's `whole` marker, never on its
`component`, because an area note on a host that emits no `data-component` resolves to the screen
anchor exactly as a whole-screen note does.*
