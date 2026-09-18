---
date: 2026-09-17
status: done
tier: critical
area: ui
design: false
breaking: true
depends_on: [specs/20260917/02-the-story-travels.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-17
open_markers: 0
build_base: main
diff_base: 2ac4a7b0a9aea98dfea10f9e3c87c6cc9572a34b
---

# The panel and the dots tell the truth

## Goal

The reviewer page currently mislabels two things the owner navigates by. The notes panel's
**PROJECT** group is populated by "every note whose screen is not the one I am looking at", so a
remark pinned to another screen is presented beside genuine product-wide notes. And a sidebar dot
is derived from a worst-of that recognises only `open` and `answered`, so a screen whose notes are
every one of them approved is indistinguishable from a screen nobody has touched — both render
yellow. This spec makes each surface mean exactly one thing: the panel lists only this screen's
notes and the project's own notes, and every dot reports where its own item sits in the review
lifecycle. Done means an other-screen note appears nowhere in the panel, an all-approved screen,
state and journey render blue, an untouched one renders no dot at all, and a note that claims to be
project-wide while carrying a screen is refused at the write path without any existing host's
`notes.json` becoming unreadable.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The notes panel has exactly two groups. `here` = notes whose `screen` equals the current screen (unchanged). The second group's membership becomes `n.project === true` — **not** `n.screen !== screen`. A note anchored to any other screen appears **nowhere** in the panel; it is reached only through that screen's own sidebar entry. `notesRest` is retired and replaced by `projectNotes(notes: readonly Note[]): Note[]` filtering `n.project === true`; it takes no `screen` argument, because project notes are screen-independent by construction (AC-20260917-03-1, AC-20260917-03-2) | User ruling 2026-09-17: a project note is a product-wide request ("please also add Chinese"); a screen note is pinned to one screen. Grouping by "not here" collapses two different kinds of thing into one heading. Renaming the heading was explicitly rejected by the user as a non-fix |
| D2 | Selecting a note never navigates to another screen. `ScreenPage`'s `select` loses its `n.screen !== route.screen` branch, and the module-level `pendingOpen` variable plus the effect that drains it are deleted with it — that branch is `pendingOpen`'s only writer (`ScreenPage.tsx:130`; reader at `:157-159`). A project note still opens in place without touching the hash; a note in another state of **this** screen still changes the hash (AC-20260917-03-3) | D1 removes the only panel rows that could target another screen, so the branch is unreachable; leaving `pendingOpen` behind would strand module state with no writer. Reference rule 18's other-screen clause is retired by D5 |
| D3 | Tone derivation is rewritten around one helper. `worst(notes: readonly Note[]): Tone \| null` returns `null` when the list is **empty**; `'open'` when any note's status is `open`; else `'answered'` when any is `answered`; else `'approved'`. The final branch is deliberately "every status that is not `open`/`answered` counts as closed", so a status added later (spec 02's `deferred`) folds in with no new branch. `stateTone` returns `worst(...)` unchanged in shape but now yields `'approved'` for an all-approved state instead of `null`. `screenTone(name, notes, approval): Tone \| null` returns `worst(this screen's notes)` when that is non-null, else `'approved'` when `name in approval.screens`, else `null` (AC-20260917-03-4, AC-20260917-03-5, AC-20260917-03-6, AC-20260917-03-7) | User ruling 2026-09-17: red beats yellow beats blue, and blue means every note on it is approved. The old helper could not see `approved` at all, so "all notes approved" and "no notes" produced the identical fallback — the reason the sidebar reads yellow nearly everywhere |
| D4 | A journey's tone comes from that journey's own conversation and nothing else. `journeyTone(id, journeys): Tone \| null` returns `null` when the journey has no conversation entry and otherwise `toneOf(conv.status)` — spec 02's total `Note['status'] → Tone` helper, never a raw status read. The `?? 'answered'` default is removed, so an untouched journey renders no dot. It does **not** read `approval.journeys`, and it does **not** aggregate the notes of the screens that journey's steps visit (AC-20260917-03-8, AC-20260917-03-9) | User ruling 2026-09-17, stated twice: "journey and screen are different thing — journey is to confirm workflow, do not mix with screen". A journey carries its own notes; its dot answers whether those are fixed and awaiting approval, never what is wrong on a screen it passes through |
| D9 | "Untouched shows no tone" is applied at **both** journey surfaces, not just the sidebar. `ScreenPage.tsx:360` today inlines `data?.notes.journeys[journey.id]?.status ?? 'answered'` and never calls `journeyTone`; it becomes `journeyTone(journey.id, data?.notes.journeys ?? {})` and `JourneyPanel`'s `tone` prop widens to `Tone \| null`, hiding its status line when null exactly as `NotesPanel`'s does (D5). No other behaviour of that panel changes (AC-20260917-03-18) | Leaving the inline default in place would have one untouched journey render no dot in the sidebar and a yellow "pending your approval" tone in its own panel — two surfaces disagreeing about the same journey. Found by the sibling session's review of this draft |
| D10 | This spec **supersedes** spec 02's D12 clause that `worst()` gains an explicit "deferred is closed" line returning `null`. Under D3 a list holding a `deferred` note is non-empty, so it resolves through the final branch to `'approved'`. Accordingly this spec **re-pins** the middle clause of AC-20260917-02-17 from `worst([{status:'deferred'},{status:'approved'}]) → null` to `→ 'approved'`; that spec's other two clauses (`toneOf('deferred') → 'approved'`, `journeyTone` over an existing `deferred` conversation → `'approved'`) are unaffected and stay green (AC-20260917-03-19) | Spec 02 lands first (A4), so its branch exists before this spec removes it. Recording the supersession here means the change reads as a planned retirement in this spec rather than unexplained drift in that spec's review |
| D11 | The approve-screen header shows at `'answered'` **and at `null`**. `StatusLine`'s `tone` prop widens to `Exclude<PinTone,'draft'> \| null`; at `null` it renders no `StatusDot` (D5's no-grey-circle rule holds) but still renders its title and, for an owner, the approve control — the header row is otherwise unchanged. `NotesPanel` passes its now-nullable `screenTone` straight through. `src/ui/notes/notes-ui.tsx` is added to the File Plan for this (AC-20260917-03-21) | User ruling 2026-09-17, answering a build-time fork: under D3 an untouched screen is `null`, never `'answered'`, so D5's literal clause left "Approve screen" with no reachable code path and contradicted this spec's own Behavior section ("it remains the only way a screen with **no** notes shows blue"). Executed evidence: tests/browser/roundtrip.test.ts :: AC-20260915-03-5 failed on the button never appearing |
| D5 | Both dot call sites render conditionally. `AppSidebar` wraps the per-screen dot (`:137`) and the per-journey dot (`:96`) in a null guard, exactly as the per-state dot already is (`:154-158`). `NotesPanel`'s `screenTone` prop widens to `Tone \| null`; **its approve-screen header clause is superseded by D11** (AC-20260917-03-5, AC-20260917-03-8) | The reference's §1 "always present" claim for the screen dot is retired by D7; a null-tone dot has no colour to paint and must not render a bare grey circle |
| D6 | The scope invariant is enforced on the **write path only**. `AddNoteSchema` gains a second `superRefine`: `project === true` requires `screen === null`, and `screen === null` requires `project === true`; both directions are `custom` issues, so `POST /__mock-review/notes` answers its documented `400` (`plugin.ts:301-303`). For `op:'update'`, the same predicate runs in `handlePostNotes` against the **merged** note (`mergeDefined(existing, patch.fields)`) after the existing 404 pre-check and before `applyNotesPatch`, answering `400` with `{error:'invalid notes patch'}`. `NoteSchema` and `NotesSchema` — the read-back document shapes — are **not** touched (AC-20260917-03-10, AC-20260917-03-11, AC-20260917-03-12) | A refinement on the read-back schema would make any host whose `notes.json` already holds a contradictory note fail to parse, and `buildState` swallows that failure into `EMPTY_NOTES` with an empty catch (`state.ts:142-147`) — the page would render "no notes" with no error while writes answered 409. Spike S-B proves the read path stays permissive |
| D7 | `docs/design/design-reference.md` gains a new top-level `## Amendments` section (dated entries, newest first) and this spec appends the first entry; every superseded passage is then rewritten in place **and** cited from that entry. Passages: §5's `rest` table row and its empty text; §5's "what" string bullet (the `stepLabel` branch dies — every row in `here` is on this screen and every row in the project group is a project note); §13 rules 2, 3, 4 and 5; §13 rule 18's other-screen clause; §14's `project` row and its `approvedScreens` line ("the only thing that turns a clean screen blue"); §15.2 item 2 ("the project always has notes from the other screen") (AC-20260917-03-13) | The document is the frozen source the pipeline re-derives from — a silent in-place edit lets a later session re-assert the captured behaviour as authority. A dated amendment records that the user changed the product, not that the capture was wrong |
| D8 | The project group's copy changes with its meaning: heading stays `Project`, empty text becomes `No project notes.` (was `No other notes.`), and `onAddNote`'s target union becomes `'here' \| 'project'`. The `+ Note` button on the project group keeps creating a project note, unchanged (AC-20260917-03-2, AC-20260917-03-14) | "No other notes." describes the retired membership rule and would be a false statement about a group that now holds only project notes |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/schemas/patches.ts | MODIFY | schemas | D6: `AddNoteSchema` gains the scope `superRefine`; export the shared predicate for the route layer |
| src/server/plugin.ts | MODIFY | server | D6: `op:'update'` runs the scope predicate against the merged note after the 404 pre-check, before `applyNotesPatch`; 400 on violation |
| src/ui/store/selectors.ts | MODIFY | ui | D1: `notesRest` retired, `projectNotes` added; D3: `worst`, `screenTone`, `stateTone` rewritten; D4: `journeyTone` returns `Tone \| null` |
| src/ui/notes/NotesPanel.tsx | MODIFY | ui | D1/D8: group key union `'here' \| 'project'`, membership from props, empty text, "what" string loses the `stepLabel` branch; D5: `screenTone` prop widens to `Tone \| null` |
| src/ui/screen/ScreenPage.tsx | MODIFY | ui | D1: `rest` memo becomes `projectNotes(notes)`; D2: other-screen branch, `pendingOpen` and its drain effect deleted; D5: `sTone` may be null; D9: `:360`'s inline `?? 'answered'` replaced by `journeyTone(...)` |
| src/ui/journeys/JourneyPanel.tsx | MODIFY | ui | D9: `tone` prop widens to `Tone \| null`; the status line hides when null |
| src/ui/notes/notes-ui.tsx | MODIFY | ui | D11: `StatusLine`'s `tone` widens to `Exclude<PinTone,'draft'> \| null`; no dot at null, approve control still shown |
| src/ui/shell/AppSidebar.tsx | MODIFY | ui | D5: null guards around the per-screen dot (`:137`) and the per-journey dot (`:96`) |
| tests/unit/selectors.test.ts | MODIFY | tests | AC-20260917-03-1, AC-20260917-03-4, AC-20260917-03-5, AC-20260917-03-6, AC-20260917-03-7, AC-20260917-03-8, AC-20260917-03-9, AC-20260917-03-15, AC-20260917-03-16 |
| tests/unit/patches.test.ts | MODIFY | tests | AC-20260917-03-10, AC-20260917-03-12 |
| tests/server/api.test.ts | MODIFY | tests | AC-20260917-03-11, AC-20260917-03-17 |
| tests/browser/roundtrip.test.ts | MODIFY | tests | AC-20260917-03-2, AC-20260917-03-3, AC-20260917-03-14, AC-20260917-03-21 |
| tests/browser/surfaces.test.ts | MODIFY | tests | AC-20260917-03-18 |
| tests/unit/design-reference.test.ts | CREATE | tests | AC-20260917-03-13 |
| tests/unit/labels.test.ts | MODIFY | tests | Collision closure: its header comment names the retired `notesRest` and the re-shaped `journeyTone` — update the reference, no assertion changes |
| docs/design/design-reference.md | MODIFY | other | D7: `## Amendments` section plus every superseded passage rewritten (AC-20260917-03-13) |

## Contracts

```ts
// src/ui/store/selectors.ts — D3/D4. `Tone` is unchanged: 'open' | 'answered' | 'approved'.

/** Rule 2 (amended 2026-09-17): worst-of over the lifecycle. `null` means the list is EMPTY —
 * never "nothing pending". Any status that is not `open`/`answered` counts as closed, so a
 * status added later (`deferred`, spec 02) needs no new branch here — it is not `open` and not
 * `answered`, so it lands in the closed bucket, which is why D10 retires spec 02's explicit
 * deferred line rather than keeping both. */
export function worst(notes: readonly Note[]): Tone | null {
  if (notes.length === 0) return null
  if (notes.some((n) => n.status === 'open')) return 'open'
  if (notes.some((n) => n.status === 'answered')) return 'answered'
  return 'approved'
}

/** Rule 3 (amended): worst-of this screen's notes; with no notes at all, `approved` when the
 * owner explicitly approved the screen, else `null` (no dot). */
export function screenTone(name: string, notes: readonly Note[], approval: Approval): Tone | null {
  const w = worst(notes.filter((n) => n.screen === name))
  if (w) return w
  return name in approval.screens ? 'approved' : null
}

/** Rule 4 (amended): worst-of that state's notes; an all-approved state is `approved`, an empty
 * one is `null`. */
export function stateTone(screen: string, state: string, notes: readonly Note[]): Tone | null {
  return worst(notes.filter((n) => n.screen === screen && sameState(n.state, state)))
}

/** Rule 5 (amended): a journey's own conversation status, and nothing else. `null` when the
 * journey has no conversation entry. Never reads `approval.journeys`; never aggregates the notes
 * of the screens its steps visit. Routes through spec 02's `toneOf` so the status union stays
 * closed at four members without widening `Tone`/`PinTone`. */
export function journeyTone(id: string, journeys: Record<string, JourneyConversation>): Tone | null {
  const conv = journeys[id]
  return conv ? toneOf(conv.status) : null
}

/** D1: the notes panel's PROJECT group — product-wide notes only, screen-independent. Replaces
 * `notesRest`, which selected "every note not on this screen". */
export function projectNotes(notes: readonly Note[]): Note[] {
  return notes.filter((n) => n.project === true)
}
```

```ts
// src/schemas/patches.ts — D6. The predicate is exported so the route layer can apply the same
// rule to a MERGED note on `op:'update'`; the read-back shapes in src/schemas/notes.ts are
// deliberately untouched.

/** D6: a note is either product-wide (`project: true`, no screen) or anchored to a screen.
 * Returns the violated rule's message, or null when the pair is legal. */
export function scopeViolation(note: { screen: string | null; project?: true }): string | null {
  const isProject = note.project === true
  if (isProject && note.screen !== null) return 'a project note carries no screen'
  if (!isProject && note.screen === null) return 'a note with no screen must be project:true'
  return null
}

const AddNoteSchema = NoteSchema.omit({ id: true })
  .superRefine((note, ctx) => {
    if (Object.prototype.hasOwnProperty.call(note, 'id')) {
      ctx.addIssue({ code: 'custom', message: 'add may not specify id', path: ['id'] })
    }
  })
  .superRefine((note, ctx) => {
    const msg = scopeViolation(note)
    if (msg) ctx.addIssue({ code: 'custom', message: msg, path: [note.project === true ? 'screen' : 'project'] })
  })
```

```
POST /__mock-review/notes   {"op":"add","note":{"screen":"home","project":true, …}}
  -> 400 {"error":"invalid notes patch"}
POST /__mock-review/notes   {"op":"update","id":"N001","fields":{"project":true}}   // N001 has screen:"home"
  -> 400 {"error":"invalid notes patch"}
GET  /__mock-review/state    with a design/notes.json already holding {screen:"home", project:true}
  -> 200, that note present in `notes.notes` (read-back is permissive — D6)
```

## UI

**Notes panel (reference §5, amended).** Two vertical resizable groups, unchanged in layout,
sizing, header composition and row shape.

| key | heading | contents | empty text |
| --- | --- | --- | --- |
| `here` | THIS SCREEN | every note whose `screen` is the current screen, any state | "No notes on this screen." |
| `project` | PROJECT | every note with `project: true` | "No project notes." |

The row "what" string keeps its `part` derivation (`Project note` / `Whole screen` / `Screen` /
the component name). Its second half simplifies: a row in `here` for the current state shows the
bare part; a row in `here` for another state shows `{stateLabel} · {part}`; a row in `project` is
always a project note and always shows the bare part. The `stepLabel` branch — which named another
screen — is removed, because no row in either group can now belong to another screen.

**Sidebar (reference §1, amended).** The per-screen dot and the per-journey dot render only when
their tone is non-null, matching the per-state dot's existing shape. Colours are unchanged and come
from the same `TONE` table: `open` red, `answered` yellow, `approved` blue.

| what the owner sees | what it means |
| --- | --- |
| red | at least one note on it is `open` — pending an AI fix |
| yellow | nothing open, at least one `answered` — fixed, pending the owner's approval |
| blue | it has notes and every one is `approved` (or, for a screen with no notes, the owner explicitly approved the screen) |
| no dot | nothing has been raised on it at all |

## Data Model

No change to any persisted shape. `design/notes.json` keeps `contractVersion: 2`, the `Note`
record keeps every field including the optional `project: true` marker, and no migration runs.
Existing documents — including one already holding a note that violates D6's invariant — continue
to load unchanged; the invariant governs only what may be **written** from now on (D6, spike S-B).

## Behavior

**Finding a note on another screen.** With D1 in force the panel no longer lists it. The owner
reaches it exactly as they reach anything else on that screen: the sidebar entry for that screen
carries a red or yellow dot, and opening the screen shows the note in THIS SCREEN. Two paths
outside the page remain unchanged and are the cross-screen worklist: `mock-review sweep` prints
every open note grouped by file, and the plugin's `--mark approved` refuses while any note anywhere
is open.

**Approving.** Approving notes one at a time is the ordinary path, and under D3 it now moves the
screen's dot through yellow to blue without any further gesture. The separate "Approve screen"
control is unchanged and still writes `approval.screens[name]`; it remains the only way a screen
with **no** notes shows blue, and rule 6's un-approve on a new or reopened note is untouched.

**A contradictory note already on disk.** It loads, renders, and can be read and answered. The
first `update` that touches it must leave it legal — a patch that would keep the contradiction is
refused with 400 (D6). Nothing rewrites it silently.

## Acceptance Criteria

- **AC-20260917-03-1**: WHEN `projectNotes` runs over `[{id:'N1',screen:'home',project:undefined},{id:'N2',screen:'account'},{id:'N3',screen:null,project:true}]` THE SYSTEM SHALL return exactly `[N3]`, and `notesHere('home', …)` over the same list SHALL return exactly `[N1]` → writes tests/unit/selectors.test.ts
- **AC-20260917-03-2**: WHEN the reviewer page shows screen `home` with one note on `home`, one note on another screen and one `project: true` note THE SYSTEM SHALL render exactly two groups, THIS SCREEN holding one row and PROJECT holding one row, and the other screen's note id SHALL NOT appear anywhere inside the panel → writes tests/browser/roundtrip.test.ts
- **AC-20260917-03-3**: WHEN a PROJECT row is clicked THE SYSTEM SHALL open its thread with `location.hash` unchanged (e.g. hash `#/screen/home` before and after) → rewrites tests/browser/roundtrip.test.ts :: AC-20260915-02-18 (D1's PROJECT group)
- **AC-20260917-03-4**: WHEN `screenTone('home', notes, approval)` runs with `notes = [{screen:'home',status:'approved'},{screen:'home',status:'approved'}]` and no `approval.screens.home` THE SYSTEM SHALL return `'approved'` → rewrites tests/unit/selectors.test.ts :: screenTone falls back to answered when notes are all approved
- **AC-20260917-03-5**: WHEN `screenTone('home', [], approval)` runs with no `approval.screens.home` THE SYSTEM SHALL return `null`, and the sidebar SHALL render no status dot for `home` → writes tests/unit/selectors.test.ts
- **AC-20260917-03-6**: WHEN `worst([])` runs THE SYSTEM SHALL return `null`; `worst([{status:'approved'}])` → `'approved'`; `worst([{status:'answered'},{status:'approved'}])` → `'answered'`; `worst([{status:'open'},{status:'answered'},{status:'approved'}])` → `'open'` → writes tests/unit/selectors.test.ts
- **AC-20260917-03-7**: WHEN `stateTone('home','Default', [{screen:'home',state:'Default',status:'approved'}])` runs THE SYSTEM SHALL return `'approved'` (today `null`), and `stateTone('home','Default', [])` SHALL return `null` → rewrites tests/unit/selectors.test.ts :: stateTone returns null when there are no pending notes
- **AC-20260917-03-8**: WHEN `journeyTone('first-visit', {})` runs THE SYSTEM SHALL return `null`, and the sidebar SHALL render no status dot for that journey → rewrites tests/unit/selectors.test.ts :: journeyTone
- **AC-20260917-03-9**: WHEN `journeyTone('first-visit', {'first-visit':{status:'approved',thread:[]}})` runs THE SYSTEM SHALL return `'approved'`, and with `{status:'open'}` SHALL return `'open'`, regardless of any `approval.journeys['first-visit']` entry and regardless of the status of notes on the screens that journey's steps visit → writes tests/unit/selectors.test.ts
- **AC-20260917-03-10**: WHEN `NotesPatchSchema.safeParse({op:'add',note:{screen:'home',state:null,component:null,key:null,snippet:null,status:'open',thread:[],project:true}})` runs THE SYSTEM SHALL fail with the issue message `a project note carries no screen`; and with `{screen:null, …}` and no `project` SHALL fail with `a note with no screen must be project:true` → writes tests/unit/patches.test.ts
- **AC-20260917-03-11**: WHEN `POST /__mock-review/notes` receives `{"op":"update","id":"N001","fields":{"project":true}}` and `N001` currently has `screen:"home"` THE SYSTEM SHALL answer `400` with body `{"error":"invalid notes patch"}` and leave `design/notes.json` byte-identical → writes tests/server/api.test.ts
- **AC-20260917-03-12**: WHEN `NotesSchema.safeParse` runs over `{contractVersion:2,notes:[{id:'N001',screen:'home',state:null,component:null,key:null,snippet:null,status:'open',thread:[],project:true}],journeys:{}}` THE SYSTEM SHALL succeed, proving the read-back document schema still accepts a note the write path now refuses → writes tests/unit/patches.test.ts
- **AC-20260917-03-13**: WHEN `docs/design/design-reference.md` is read THE SYSTEM SHALL contain a `## Amendments` section whose first entry is dated `2026-09-17`, and SHALL NOT contain any of the retired strings `every note whose \`screen\` is *not* the current screen`, `No other notes.`, or `the only thing that turns a clean screen blue` → writes tests/unit/design-reference.test.ts
- **AC-20260917-03-14**: WHEN the PROJECT group holds no `project: true` note THE SYSTEM SHALL render the empty text `No project notes.` → writes tests/browser/roundtrip.test.ts
- **AC-20260917-03-15**: WHEN `screenTone('home', notes, approval)` runs with `notes = [{screen:'home',status:'answered'},{screen:'home',status:'open'}]` THE SYSTEM SHALL CONTINUE TO return `'open'` → reuses tests/unit/selectors.test.ts :: screenTone is worst-of its notes: open beats answered
- **AC-20260917-03-16**: WHEN `screenTone('home', [], approval)` runs with `approval.screens.home` present THE SYSTEM SHALL CONTINUE TO return `'approved'` → reuses tests/unit/selectors.test.ts :: screenTone reports approved when approval.screens[name] exists
- **AC-20260917-03-17**: WHEN `POST /__mock-review/notes` receives an `add` whose `note` carries an `id` THE SYSTEM SHALL CONTINUE TO answer `400` → reuses tests/server/api.test.ts :: AC-20260915-02-8/-9/-11 (D23): approveScreen for an unknown screen is 400 and writes nothing; a non-JSON body is 400, not 500; add ignores a caller id; update/remove of an unknown id is 404
- **AC-20260917-03-18**: WHEN the journey panel renders a journey with no conversation entry THE SYSTEM SHALL render no status line and no dot, matching that journey's sidebar entry (today the panel shows an `answered` tone while the sidebar will show none) → writes tests/browser/surfaces.test.ts
- **AC-20260917-03-19**: WHEN `worst([{status:'deferred'},{status:'approved'}])` runs THE SYSTEM SHALL return `'approved'`, superseding spec 02's pin of `null` for that same input → rewrites tests/unit/selectors.test.ts :: journeyTone
- **AC-20260917-03-20**: WHEN `toneOf('deferred')` runs THE SYSTEM SHALL CONTINUE TO return `'approved'`, and WHEN `journeyTone('j', {j:{status:'deferred',thread:[]}})` runs THE SYSTEM SHALL CONTINUE TO return `'approved'` → reuses tests/unit/selectors.test.ts :: journeyTone
- **AC-20260917-03-21**: WHEN the reviewer page shows a screen with no notes and no `approval.screens` entry THE SYSTEM SHALL render the notes panel's screen header with no status dot and WITH the `Approve screen` control, and clicking it SHALL write `approval.screens` for that screen → writes tests/browser/roundtrip.test.ts

## Assumptions (escalation triggers)

- **A1**: zod 4.6.5 allows a second `.superRefine` chained onto the already-refined `AddNoteSchema`
  while it sits as a field of a `.strict()` member of a `discriminatedUnion`, and the page-owned
  passthrough extras still survive. — **executed 2026-09-17** (scratch file, repo root, `npx tsx`,
  deleted after): project note accepted `true`; screen note with `rect` accepted `true` with
  `rect` preserved as `{"x":1,"y":2,"w":3,"h":4}`; `project:true` + `screen:'home'` rejected with
  `note.screen: a project note carries no screen`; `screen:null` without `project` rejected with
  `note.project: a note with no screen must be project:true`; caller-supplied `id` still rejected
  `true`. — **if false:** move the whole invariant into `handlePostNotes` for both ops and leave
  the schema untouched.
- **A2**: the read-back path stays permissive, so no existing host's panel can be blanked by this
  change. — **executed 2026-09-17** (same scratch run): `NotesSchema.safeParse` over a document
  holding `{screen:'home', project:true}` returned `success: true`. — **if false:** STOP, ask the
  user; a blanking risk outweighs the invariant.
- **A3**: `ScreenPage`'s `pendingOpen` has exactly one writer, the branch D2 deletes. — verified by
  grep (`src/ui/screen/ScreenPage.tsx`: declared `:25`, written `:130`, read `:157-159`; no other
  occurrence in `src/`). — **if false:** keep the variable and its drain effect, delete only the
  panel-reachable branch, and record the surviving writer in the build's deviation log.
- **A4**: `specs/20260917/02-the-story-travels.md` builds **before** this spec, so `toneOf` and the
  four-member status union already exist when this one starts. Order reversed on 2026-09-17 after
  the sibling session showed the cost is asymmetric: that spec is already hardened with gates
  green, and its AC-20260917-02-17 pins `worst([{status:'deferred'},{status:'approved'}]) → null`,
  which D3 turns red — amending a hardened spec costs a recorded build deviation, while amending
  this draft before lock costs nothing. D10 records the supersession and AC-20260917-03-19 re-pins
  the clause. — **if false:** if this spec somehow builds first, `toneOf` does not yet exist:
  write D4's `journeyTone` against the raw status, keep `worst()`'s final branch as the single
  closed-status home, and tell the sibling session to amend AC-20260917-02-17 before its run.
- **A6**: the pre-image test that AC-20260917-03-8, -19 and -20 name (`tests/unit/selectors.test.ts
  :: journeyTone`) still resolves to exactly one test after spec 02's build rewrites it — 02's own
  AC-20260917-02-17 carries the same disposition prefix. — **if false:** re-resolve the prefix at
  build time with `count-tests --titles --file tests/unit/selectors.test.ts` and lengthen it; no
  decision changes.
- **A5**: no host in use has a `notes.json` containing a note that violates D6. — checked for the
  one known host: `niko-hub/app/design/notes.json` holds a single note, `N001` on
  `admin-performance-review`, with no `project` key. — **if false:** nothing breaks (A2), the note
  simply cannot be updated until the contradiction is resolved.

## Rationale

Two build-time departures, folded from this spec's deviations sidecar at close (2026-09-17), both
one-offs rather than recurring classes:

- **AC-20260917-03-21's test was never observed red.** That AC did not exist when red-check ran —
  it was created mid-build by the user ruling recorded as D11, and its implementation and its test
  were authored concurrently in the same worktree, the implementation landing first. The behaviour
  it pins was demonstrably broken beforehand: `tests/browser/roundtrip.test.ts :: AC-20260915-03-5`
  failed on the `Approve screen` button never appearing, executed before the ruling was taken to
  the user.
- **AC-20260917-03-17's citation was corrected at review.** It pointed at the happy-path add test,
  which never sends a caller `id` and never asserts 400. The behaviour it pins lives in the test
  titled `AC-20260915-02-8/-9/-11 (D23): …`, whose `add ignores a caller id` clause asserts the
  400. The citation now points there and that title carries this AC's ID, following this repo's
  precedent of appending a reuse AC-ID to an already-multi-ID title.

The user reported "a screen note derived by annotation is displayed as project notes" and, when the
first reading was that the heading was merely misnamed, rejected that framing outright: a project
note ("please also add Chinese") and a screen note are different kinds of thing, and the grouping —
not its label — is what mixes them. D1 follows from that directly. A third "other screens" group
was considered and dropped: it preserves the clutter under a new name, and the sidebar dot is
already the intended cross-screen signal. The cost is real and accepted — reference rule 18's
click-through-to-another-screen shortcut disappears (D2), because after D1 no panel row can target
another screen.

That made the dots load-bearing, which surfaced the second defect. The old `worst()` recognised only
`open` and `answered`, so "every note approved" and "no notes at all" produced the same `null` and
the same yellow fallback — and since approving notes one at a time is the ordinary workflow while
the separate "Approve screen" click is easy to miss, nearly every screen sat yellow. Note that the
old behaviour is not a coding slip: reference §13 rules 2-5 state it deliberately, and
AC-20260915-02-4 pins it with a literal example. Changing it is therefore a product decision, taken
by the user on 2026-09-17, which is why D7 records it as a dated amendment rather than editing the
frozen text as if it had always said this. The user also ruled twice that journeys must not
aggregate screens (D4): a journey confirms a workflow and answers for its own notes only.

D6 is the decision most likely to be got wrong twice. The obvious move — tighten `NoteSchema` —
would make an existing host's `notes.json` fail to parse, and `buildState` swallows that into
`EMPTY_NOTES` behind an empty catch, so the page would show no notes at all with no error surfaced
anywhere, while writes answered 409 about a file nobody touched. The sibling document has that exact
bug in production today. Keeping the refinement on the patch schemas gives the same invariant with
none of that exposure, and spike S-B is the executed proof.

**Collision closure, waived hits.** All three unplanned hits are the same file:
`docs/research/prototype-inventory.md`, matched by `worst`, `journeyTone` and `pendingOpen`, and it
is not in the File Plan. It is a record of what the captured prototype contained
at freeze time, not a statement about what this package should do; rewriting it would falsify the
capture it exists to preserve. Waived deliberately. `tests/unit/stateKey.test.ts` is a
mentions-tier hit only and owes nothing.

**Order, and why it reversed.** The sibling session first offered to let this spec land first, on
the understanding that it only touched the notes grouping. Once the sidebar ruling widened it into
`worst()` and `journeyTone()`, that stopped being free: spec 02 is hardened with gates green and
pins `worst()` returning `null` for a deferred-plus-approved list, which D3 contradicts. Amending a
hardened spec costs a recorded deviation at build time; amending this draft costs nothing. So 02
builds first, this locks against it (A4), D4 routes through its `toneOf` helper rather than reading
a raw status, and D10 carries the supersession so the retirement reads as planned rather than as
drift in that spec's review.

Watch during execution: `screenTone` and `journeyTone` changing to nullable returns will surface
type errors at every call site — that is the compiler enumerating D5's and D9's work, not a
problem. The `stepLabel` import in `NotesPanel` becomes unused and must go with it. D9 exists
because `ScreenPage:360` never called `journeyTone` at all; without it the sidebar and the journey
panel would disagree about what an untouched journey looks like.

## Canonical Delta

Add to `docs/canonical/package.md` a section **"Note scope and the status dots"**:

> A note is one of exactly two kinds. A **project note** carries `project: true` and no screen,
> state, component, key or snippet; it is a product-wide request that belongs to no screen. A
> **screen note** carries a real `screen` and no `project` marker. The write path enforces the pair
> — `POST notes` answers 400 for an `add`, or an `update` whose merged result, that claims one kind
> while carrying the other's fields. The read-back schemas stay permissive on purpose, so a
> document written by an older build always loads.
>
> The reviewer page's notes panel shows exactly two groups: the notes on the screen being viewed,
> and the project's own notes. A note anchored to another screen is never listed; it is reached
> through that screen's sidebar entry.
>
> A status dot reports where its own item sits in the review lifecycle, over its own notes only:
> red when any note is open, yellow when none is open and any is answered, blue when it has notes
> and every one is approved, and no dot at all when nothing has been raised. A screen with no notes
> shows blue only when the owner used the separate "Approve screen" control. Journeys derive their
> dot from their own conversation and never from the screens their steps visit.
