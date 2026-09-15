# Mock reviewer — binding design reference

Frozen from the prototype at
`/home/jj/projects/claude-plugins/.claude/worktrees/agent-ae25a43a1031bd49a/prototypes/react-mocks`
(captured 2026-09-15). Every claim below cites `file:line` in that tree. The screenshots named
`atlas/NN-*.png` are the visual half of the same contract.

**This document is acceptance criteria.** A rebuild may restructure the code however it likes; the
surfaces, controls, wording, tones, spacing rules and behaviours described here must come out the
same. Nothing here is aspirational — if the prototype does not do it, it is not written here.

---

## 0. Global frame

### 0.1 Two render modes on one entry point

`src/main.tsx:69` reads `?frame=` from `location.search`. With it, the app renders `<Frame/>` — the
bare mock, no reviewer (`src/main.tsx:72-75`) — and adds `bg-background` to `<body>`
(`src/main.tsx:70`). Without it, it renders the reviewer: `TooltipProvider > ReviewProvider >
SidebarProvider > Router` (`src/main.tsx:77-86`). The `SidebarProvider` sits **above** the router so
the left sidebar keeps its open/closed state across screens (`src/main.tsx:80-81`).

Atlas: `55-frame1-raw-screen-render.png`, `56-frame1-raw-component-render.png`.

### 0.2 Hash route grammar

`parseHash()` (`src/main.tsx:18-24`) splits `#/<path>?<query>`:

| param | meaning | source |
| --- | --- | --- |
| `<path>` | screen id; defaults to `console-account` when empty | `src/main.tsx:22` |
| `state` | state export name on that screen module | `src/main.tsx:22` |
| `j` | journey id | `src/main.tsx:22` |
| `step` | journey step index (number) | `src/main.tsx:22` |
| `c` | selected component key on the Components page | `src/main.tsx:23` |
| `from` | screen id the Components page filters by | `src/main.tsx:23` |
| `name`, `example` | component + example in frame mode (`#/__component`) | `src/main.tsx:23`, `src/main.tsx:57-60` |

Routing is a `hashchange` listener, in both the reviewer and the frame
(`src/main.tsx:28-32`, `src/main.tsx:52-56`). Screens are **discovered, not registered**: every
`./screens/*.tsx` is a route (`src/main.tsx:14-16`).

Three route outcomes (`src/main.tsx:34-45`): `components` → `<ComponentsPage>`; a known screen →
`<ReviewLayer>` keyed on the path; anything else → the fallback page (§11).

### 0.3 Theme, type, radius

Light only. `ThemeProvider` exists at `src/components/theme-provider.tsx` but is **never mounted** —
there is no scheme toggle anywhere in the reviewer, and no `.dark` class is ever set. The `.dark`
token block (`src/index.css:86-118`) is dead code in this prototype.

- Font: `Geist Variable, sans-serif` as `--font-sans`, applied to `html` (`src/index.css:10`,
  `src/index.css:127-129`).
- Radius scale from `--radius: 0.625rem` (`src/index.css:75`, `src/index.css:42-48`).
- Colors are the stock shadcn neutral oklch palette (`src/index.css:51-84`).
- The only custom CSS in the whole app is the journey guide ring (`src/index.css:131-143`, §8.3).

---

## 1. Left sidebar — navigation (`src/review/AppSidebar.tsx`)

**Purpose.** Navigation only: one list at a time, Journeys or Screens; only the active item expands
(`src/review/AppSidebar.tsx:1`).

**Layout.** shadcn `Sidebar collapsible="icon"` (`src/review/AppSidebar.tsx:34`): 16rem expanded,
3rem collapsed (`src/components/ui/sidebar.tsx:29,31`). Structure is
`SidebarHeader / SidebarContent > SidebarGroup / SidebarFooter / SidebarRail`
(`src/review/AppSidebar.tsx:35,44-45,111,126`).

**Header — side tabs.** shadcn `Tabs > TabsList className="w-full" > TabsTrigger` with values
`journeys` and `screens`, labels "Journeys" and "Screens" (`src/review/AppSidebar.tsx:36-41`). The
header is hidden when collapsed: `group-data-[collapsible=icon]:hidden`
(`src/review/AppSidebar.tsx:35`). Selection persists in `sessionStorage["side-tab"]`, default
`journeys` (`src/review/store.tsx:108-109`).
Atlas: `02-sidebar-journeys-list.png`, `03-sidebar-screens-list-status-dots.png`.

**Journeys list** (`src/review/AppSidebar.tsx:47-75`). One `SidebarMenuItem` per journey:

- Row: `SidebarMenuButton asChild` with `<a href={stepHref(j,0)}>`, icon `Route` (lucide, imported as
  `RouteIcon`, `src/review/AppSidebar.tsx:4`), label `j.title`. `tooltip` and `title` are
  `j.persona` (`src/review/AppSidebar.tsx:52-54`).
- `isActive` = this journey is the active one **and** the current screen+state is not one of its
  steps (`isActive={on && idx < 0}`, `src/review/AppSidebar.tsx:52`).
- `SidebarMenuBadge` holds a `StatusDot` with `journeyTone(j.id, journeyThreads)`
  (`src/review/AppSidebar.tsx:56`).
- Only the active journey expands into `SidebarMenuSub` (`className="mr-0 gap-0.5 pr-0"`) listing
  every step as `stepLabel(screen, state)`; the current step is `isActive`, styled
  `pr-6 data-active:bg-transparent data-active:font-medium` (`src/review/AppSidebar.tsx:57-71`).
  Steps carry **no** status dot.

**Screens list** (`src/review/AppSidebar.tsx:77-106`). Same shape:

- Row: `<a href={"#/"+id}>`, icon `Monitor`, label `screenLabel(id)`, tooltip `screenLabel(id)`,
  `isActive` when it is the current path (`src/review/AppSidebar.tsx:82-84`).
- `SidebarMenuBadge` → `StatusDot tone={screenTone(id, all, approvedScreens)}` — always present
  (`src/review/AppSidebar.tsx:85`).
- Active screen expands into its states (`statesOf(id)`, Default first), label
  `stateLabel(id, s)`, active when it is the current state (`src/review/AppSidebar.tsx:86-101`).
- A state dot renders **only when that state has pending notes** (`stateTone` returns null
  otherwise), absolutely positioned `pointer-events-none absolute top-1/2 right-1 flex h-5 min-w-5
  -translate-y-1/2 items-center justify-center` (`src/review/AppSidebar.tsx:89,97`).
- State links keep the active journey only when that screen+state is one of its steps
  (`stateHref`, `src/review/AppSidebar.tsx:28-31`).

**Footer** (`src/review/AppSidebar.tsx:111-125`).

- "Components" — `<a href={componentsHref(null, <current screen or null>)}>`, icon `LayoutGrid`,
  `isActive` on `route.path === "components"` (`src/review/AppSidebar.tsx:114-116`).
- "Search" — `SidebarMenuButton size="sm"`, icon `Search`, `className="text-muted-foreground"`,
  tooltip `Search (⌘K)`, trailing `KbdGroup` with `⌘` `K` (hidden when collapsed). Opens the command
  palette (`src/review/AppSidebar.tsx:118-123`).

**Collapsed state.** `SidebarRail` (`src/review/AppSidebar.tsx:126`) plus the stock
`SidebarTrigger` in each page header; the sidebar also toggles on **Ctrl/⌘+B**
(`src/components/ui/sidebar.tsx:32,99`). Atlas: `05-sidebar-collapsed-icon-rail.png`.

---

## 2. Screen-mode top bar (`src/review/ReviewLayer.tsx:438-517`)

**Layout.** `sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3`
(`:438`) — 56px tall. Left to right: `SidebarTrigger` (`:439`), a vertical `Separator`
(`mr-2 data-vertical:h-4 data-vertical:self-auto`, `:440`), the breadcrumb in a
`min-w-0 flex-1` box (`:441`), then a right cluster `ml-auto flex items-center gap-2` (`:480`).
Atlas: `06-topbar-chrome-screen-mode.png`.

**Breadcrumb, screen mode** (`:456-475`): `screenLabel(screen)` as a link to `#/<screen>`
(`line-clamp-1`), separator, then the **state switcher** as the last crumb — a `DropdownMenu` whose
trigger is `BreadcrumbPage` + a `ChevronDown className="size-3.5"` (`:462-464`). The menu is a
`DropdownMenuRadioGroup` valued on the current state, `align="start"`, one `DropdownMenuRadioItem`
per state, each with a `Badge variant="secondary"` count of this screen's notes in that state when
> 0 (`:465-471`). Atlas: `07-state-switcher-dropdown-open.png`.

**Breadcrumb, journey mode** (`:444-454`): journey title (link to step 0), separator, then a
non-interactive `BreadcrumbPage`: `<span className="text-muted-foreground">Step {i+1} of {n} · </span>`
+ `stepLabel(screen,state)`. **No state picker in journey mode.**

**Device view switcher** (`:481-494`): `ToggleGroup type="single" variant="outline" size="sm"
spacing={0}` bound to `view`, three `ToggleGroupItem`s, each wrapped in a `Tooltip`:

| value | icon | aria-label | tooltip |
| --- | --- | --- | --- |
| `desktop` | `Monitor` | Desktop | Desktop |
| `mobile` | `Smartphone` | Mobile | Mobile |
| `both` | `Columns2` | Both | Both |

An empty value is ignored (`v && setView(...)`, `:481`). Persists in `sessionStorage["view"]`,
default `desktop` (`src/review/store.tsx:101-104`).
Atlas: `08-view-desktop-1440.png`, `09-view-mobile-390.png`, `10-view-both-desktop-plus-mobile-ghost-pin.png`.

**Re-anchor banner** (`:495`): while `reanchor` is set, a plain span
`text-sm whitespace-nowrap text-muted-foreground` reading
`Re-anchoring {id}: draw the new area · Esc cancels`. Atlas: `36-re-anchoring-mode-banner.png`.

**Mark an area** (`:503-510`), screen mode only: `Toggle variant="outline" size="sm"` bound to
`marking`, `aria-label="Mark an area"`, content `<SquareDashedMousePointer /> Mark an area <Kbd>M</Kbd>`,
tooltip `Drag over the mock to note an area · Esc exits`.
Atlas: `24-marking-mode-on-crosshair.png`.

**Open in Screens** (`:497-501`), journey mode only and **in place of** Mark an area:
`Button variant="outline" size="sm" asChild` → `<a href="#/<screen>?state=<state>">` with
`<Monitor /> Open in Screens`; clicking also switches the left sidebar to the Screens tab.

**Notes toggle** (`:512-515`): a vertical `Separator` (`mx-1 …`), then
`Toggle variant="outline" size="sm"` bound to `showNotes`, content `<PanelRight /> Notes` plus, in
screen mode only, a `Badge variant="secondary"` with the count of notes on this screen. No badge in
journey mode. Atlas: `37-notes-panel-hidden.png`.

---

## 3. Device frame area (`src/review/ReviewLayer.tsx:92-254, 519-532`)

**Purpose.** Render the real mock in a same-origin iframe so its portals, outside-click handlers and
responsive classes live in their own document (`src/main.tsx:48-49`).

**Workspace.** `relative flex min-w-0 flex-1 flex-col items-center bg-muted px-8 py-6` (`:520`) — a
muted surface; devices sit in a row with `gap: 32` (`GAP`, `:98`, `:521`).

**Sizes and scale.**

- Widths are fixed, heights stretch: `desktop 1440`, `mobile 390` (`:94-97`); the label is
  `Desktop` / `Mobile` (`:95-96`).
- `scale = clamp(0.1, 1, (availW - gaps) / totalW)` — width-fit only, never upscales (`:416`).
- `deviceH = max(200, availH - CAPTION(28) - pillH) / scale`; `pillH` is 64 in journey mode, else 0
  (`:412,417,99`).
- Available space is measured from the workspace element's content box and the window height
  (`:294-309`).

**Per device** (`:201-253`): a column `flex flex-col gap-2` holding

1. a caption `<span className="text-xs text-muted-foreground">{label} {w}</span>` — e.g.
   "Desktop 1440", "Mobile 390" (`:203`);
2. a shadcn `Card className="gap-0 overflow-hidden py-0"` (`:204`) wrapping a clipped box sized
   `w*scale × h*scale` (`:205`), inside which one wrapper at unscaled CSS size carries
   `transform: scale(s); transform-origin: top left` (`:206-207`);
3. the `<iframe>` at exact CSS size, `className="block border-0"`, `src=/?frame=1#/<screen>?state=<state>`,
   `title="{screenLabel} mock ({label})"`, `inert` while a dialog is open (`:208-210`).

The overlay layer lives inside the same scaled wrapper, so note rectangles map 1:1 onto the frame
(`:37-39`).

---

## 4. Note pins, ghosts, draft box, marking overlay

All tones come from one table, `TONE` in `src/review/notes-ui.tsx:16-21`:

| tone | meaning | box classes | pin classes |
| --- | --- | --- | --- |
| `open` | red — pending an AI fix | `border-red-500 bg-red-500/5` | `bg-red-500 text-white` |
| `answered` | yellow — pending your approval | `border-yellow-400 bg-yellow-400/10` | `bg-yellow-400 text-yellow-950` |
| `approved` | blue — approved | `border-blue-500 bg-blue-500/5` | `bg-blue-500 text-white` |
| `draft` | an unsaved note being written | `border-dashed border-foreground bg-foreground/5` | *(none — the Badge's default)* |

- **Note box** (`src/review/ReviewLayer.tsx:220-230`):
  `pointer-events-none absolute z-20 rounded-sm border-2 ${TONE[status].box}`. It is **visual only**
  — clicks pass through to the mock so the real controls stay usable (`:221-222`).
- **Pin**: a `<button aria-label="Open note {id}">` at `absolute -top-2.5 -left-2.5 cursor-pointer`,
  `pointer-events-auto` normally, `pointer-events-none` while marking (`:226-227`), containing
  `NotePin` — a shadcn `Badge` tinted with `TONE[tone].pin` (`src/review/notes-ui.tsx:56-60`). Label
  is the note id (`N003`).
- **Ghost pin** (`:216-218`): a note drawn in the *other* device renders as a faint outline around
  the whole anchored component —
  `pointer-events-none absolute z-10 rounded-sm border-2 border-dashed border-muted-foreground/20`,
  nothing clickable, and **nothing at all** when the anchor is the screen itself
  (`component === "__screen"`). Atlas: `10-view-both-desktop-plus-mobile-ghost-pin.png` (N009,
  drawn on desktop, ghosts in the mobile frame).
- **Whole-screen notes draw no box**: `if (!b || n.whole) return null` (`:214`).
- **Draft box** (`:234-239`): `pointer-events-auto absolute z-30 cursor-pointer rounded-sm border-2`
  + the dashed draft tone, carrying `NotePin tone="draft" floating` labelled `draft`; clicking it
  re-opens the draft dialog.
- **Marking overlay** (`:241-248`): `absolute inset-0 z-25 cursor-crosshair bg-foreground/[0.03]`,
  with pointer handlers for the drag and an `onWheel` that scrolls the iframe so the device stays
  scrollable while marking. The live rectangle is
  `absolute rounded-sm border-2 border-dashed border-foreground` (`:246`).
  Atlas: `24-marking-mode-on-crosshair.png`, `25-note-being-drawn-drag-rectangle.png`.
- A drag smaller than **8×8** CSS px is discarded (`:196`).

---

## 5. Notes panel — screen mode (`src/review/ReviewLayer.tsx:536-589`)

**Layout.** shadcn `Sidebar side="right" collapsible="none"` with
`className="sticky top-0 h-svh w-80 border-l"` (`:537`) — 320px, full viewport height. Rendered only
when `showNotes` is true.

**Approve-screen header** (`:540-549`): a `SidebarHeader className="gap-2 border-b
border-sidebar-border"` containing `StatusLine` — shown **only** when the screen's derived tone is
`answered`, i.e. it is actionable (`:540,543`). `StatusLine`
(`src/review/notes-ui.tsx:29-54`) is `StatusDot` + a truncating title + a
`Button size="sm"` labelled **"Approve screen"**, in a `flex min-h-8 items-center gap-2` row; the
button opens an `AlertDialog` titled `Approve {screen}?` with description
*"The screen is marked approved until a new note or a reply reopens it."* and Cancel / Approve
(`src/review/ReviewLayer.tsx:544-546`).
**Not captured — unreachable with the shipped `notes.json`:** both screens carry at least one `open`
note, so `screenTone` never returns `answered` (see §14).

**Two resizable groups** (`:551-585`). A vertical `ResizablePanelGroup`; panel 1 `defaultSize="60"`,
panel 2 `defaultSize="40"`, both `minSize="15"`, separated by a `ResizableHandle withHandle`
(`:552-556`):

| key | heading | contents | empty text |
| --- | --- | --- | --- |
| `here` | THIS SCREEN | every note whose `screen` is the current screen, any state | "No notes on this screen." |
| `rest` | PROJECT | every note whose `screen` is *not* the current screen (project notes included) | "No other notes." |

(`:430-433`, `:559`, `:566`.) Headings are `label` uppercased by CSS.

**Group header** (`:558-564`): `sticky top-0 z-10 flex items-center gap-2 bg-sidebar/95 px-3 py-2
backdrop-blur`, holding the label
(`min-w-0 flex-1 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase`), a
`Badge variant="secondary"` with the group count, and a `Button size="xs" variant="outline"` reading
`<Plus /> Note`. The **THIS SCREEN** button opens a whole-screen note; the **PROJECT** button opens a
project note (`:561`, `:359-366`).

**Note row** (`src/review/notes-ui.tsx:65-77`): a shadcn `Item asChild size="sm" variant="outline"`
rendered as a `<button data-row={id} aria-selected>`, `items-start text-left hover:bg-accent/50`, and
when selected `border-foreground/30 bg-accent`. Title = the `NotePin` badge + a truncated "what";
description = the thread's first message, `line-clamp-2`. Rows sit in an
`ItemGroup className="gap-1.5 px-2"` (`:568`).

The "what" string (`:570-572`):
- part = `Project note` (project) | `Whole screen` (whole) | `Screen` (anchor `__screen`) | the
  component name;
- in **THIS SCREEN** for the current state, or for a project note → just the part;
- otherwise → `{stateLabel or stepLabel} · {part}` — `stateLabel` when the note is on this screen,
  `stepLabel` ("Account – Payment failed") when it is elsewhere.

Atlas: `11-screen-console-account-default.png`, `25-note-being-drawn-drag-rectangle.png`,
`59-approved-blue-pin-and-row.png`.

---

## 6. Note dialogs (`src/review/ReviewLayer.tsx:591-661`)

Both follow shadcn's Dialog demo shape: `Dialog > form > DialogContent > Header, body, Footer`; the
content portals out of the form, so submit buttons point back by `form` id (`:591-593`).

### 6.1 New note (`:592-614`)

- `DialogContent className="sm:max-w-sm"`, title **"New note"**.
- Description (`:599`) is one of: `Project` (project note) · `{screenLabel} – {stateLabel}`
  (whole-screen note) · `{stepLabel} · {viewport}` (an area note, e.g. "Account – Account · desktop").
- Body: `FieldGroup > Field > Label htmlFor="note-text"` "Note" + `Textarea id="note-text" autoFocus`
  with placeholder **"What should change here?"**.
- Footer: `DialogClose` wrapping `Button variant="outline"` **Cancel** (also clears the draft), and
  `Button type="submit" form="form-note-new"` **Save**, `disabled` while the text is blank
  (`:608-609`).

Atlas: `26-new-note-dialog-from-drawn-area.png`, `27-new-note-dialog-text-entered-save-enabled.png`,
`28-new-note-dialog-project-scope.png`, `29-new-note-dialog-whole-screen-scope.png`.

### 6.2 Note thread (`:615-655`)

Open when there is a selected note, the card is open and no draft dialog is up (`:615`).

- Header title: `NotePin` with the note's id, then `Project note` | `Whole screen` (whole or
  `__screen` anchor) | the component name (`:625`).
- Header description: `Project`, or `{stepLabel(screen,state)}` plus ` · {viewport}` when the note
  records one (`:626`).
- Body is the only scrolling region — `-mx-4 no-scrollbar flex max-h-[50vh] flex-col gap-4
  overflow-y-auto px-4` (shadcn "Sticky Footer", `:628-629`) — containing:
  - the **outdated-anchor Alert** when applicable (§7.4);
  - `NoteThread` (`src/review/notes-ui.tsx:83-96`): full-width entries separated by `Separator`,
    each a `text-xs font-medium text-muted-foreground` author line reading **"AI"** or **"You"**,
    then `p.text-sm.whitespace-pre-wrap`.
- Reply field: `Field > Label htmlFor="note-reply"` "Reply" + `Textarea id="note-reply"` (`:641-644`).
- Footer: the status-dependent verdict buttons (`NoteActions`) then
  `Button type="submit" form="form-note-reply"` **Reply**, disabled while blank (`:646-650`).
- `onInteractOutside` is blocked while a verdict dialog is open (`:623`).

**NoteActions** (`src/review/notes-ui.tsx:126-137`) — the one place this rule lives:

| status | buttons (left of Reply) |
| --- | --- |
| `open` (red) | `Button variant="destructive"` **Delete** |
| `answered` (yellow) | `Button variant="destructive"` **Reject**, `Button variant="outline"` **Approve** |
| `approved` (blue) | none — Reply only |

Atlas: `30-note-thread-answered-yellow-reject-approve.png`, `31-note-thread-reply-typed.png`,
`32-note-thread-open-red-outdated-anchor-alert.png`,
`58-note-thread-approved-blue-reply-only.png`.

### 6.3 Verdict dialog (`src/review/notes-ui.tsx:100-121`)

One `AlertDialog` for all three verdicts. Title `{label} {id}?` where label is
`Approve` | `Delete` | `Reject`. Description: *"The note moves to Done."* for approve, otherwise
*"The note and its thread are removed from the screen and the list."* Footer: `AlertDialogCancel`
**Cancel** and `AlertDialogAction` with `variant="default"` for approve, `variant="destructive"`
for reject and delete.

Atlas: `33-verdict-dialog-approve.png`, `34-verdict-dialog-reject-destructive.png`,
`35-verdict-dialog-delete-destructive.png`.

---

## 7. Note lifecycle surfaces

### 7.1 Drawing

Mark mode on → drag on the overlay → on pointer-up a box ≥8×8 becomes a draft and the New note
dialog opens (`:182-198`, `:344-356`). The draft remembers which device it was drawn in
(`draft.viewport`, `:355`).

### 7.2 Whole-screen and project notes

`noteOnScreen(target)` (`:359-366`) skips mark mode entirely: it forces the notes panel visible,
clears marking/re-anchor/card, and opens the dialog with a zero-size box and `whole: true`;
`target === "rest"` additionally sets `about: "project"`. A project note is stored with empty
`screen`/`state` and `project: true` (`:369`).

### 7.3 Saving

`saveDraft()` (`:367-386`): project note → `store.add` with `project:true, whole:true, status:"open"`;
whole-screen note → `status:"open"`, current screen+state, `viewport` from the draft; area note →
`anchorFor(root, box)` resolves component/index/rect/snippet. Every new note starts **red** with one
`owner` thread entry, and is selected afterwards (`:372,377,385`).

### 7.4 Outdated anchor and re-anchor

A note is outdated when its box cannot be resolved: the component no longer resolves at that index,
or the snippet is no longer inside that element's text (`anchorEl`, `:69-76`). Judgement uses the
note's own device frame when that frame is visible, else every visible frame (`isOutdated`,
`:420-425`).

The thread dialog then shows a stock `Alert` (`:630-637`) whose `AlertDescription` is a
`flex flex-wrap items-center justify-between gap-2` row reading
**"This area changed since the note was written"** with a `Button size="sm" variant="outline"`
**Re-anchor**. Pressing it closes the card, clears any draft, sets `reanchor` to that note and turns
marking on (`:634`). The next drawn box **moves that note's anchor** instead of creating a new note,
then leaves mark mode and re-selects the note (`:344-352`). Leaving mark mode clears the pending
re-anchor (`:343`).

Atlas: `32-note-thread-open-red-outdated-anchor-alert.png`, `36-re-anchoring-mode-banner.png`
(N002 is genuinely outdated in the shipped data — its snippet no longer matches the KeyField text).

---

## 8. Journey mode

### 8.1 Journey panel (`src/review/JourneyPanel.tsx`)

Replaces the notes list in the right sidebar whenever a journey is active
(`src/review/ReviewLayer.tsx:538`). **A journey is not noted** — it has one conversation and one
status (`src/review/JourneyPanel.tsx:1-2`).

- Column `flex min-h-0 flex-1 flex-col`; thread area `min-h-0 flex-1 overflow-y-auto p-3` showing
  `NoteThread` or the empty text **"No feedback yet."** (`:24-27`).
- Form `flex flex-col gap-3 border-t border-sidebar-border p-3` with
  `Label htmlFor="journey-reply"` "Reply" + `Textarea id="journey-reply"` (`:28-33`).
- Actions row `flex justify-end gap-2`: `Button variant="outline"` **Approve** — only while the tone
  is `answered` — and `Button type="submit"` **Reply**, disabled while blank (`:34-37`).
- Approve opens an `AlertDialog`: title `Approve {journey.title}?`, description
  *"The journey stays approved until you reply again."*, Cancel / Approve (`:39-50`).

Atlas: `41-journey-panel-conversation-empty.png`, `45-journey-approve-confirm-dialog.png`,
`46-journey-panel-reply-typed.png`.

### 8.2 Journey pill (`src/review/JourneyPill.tsx`)

A bar **below** the device frames: outer `mt-4 flex w-full justify-center`, pill
`flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-1 shadow-md`
(`:16-17`). It reserves 64px of workspace height (`ReviewLayer:412`).

- **Off-journey** (`idx < 0`): `<span className="px-2 text-sm text-muted-foreground">Not on {title}</span>`
  and a `Button size="sm" variant="link"` **"Go to its start"** (`:18-22`).
  Atlas: `44-journey-not-on-this-step.png`.
- **Back**: `Button size="sm" variant="ghost"` `<ArrowLeft /> Back`, shown when some edge ends at the
  current step (`:12, :25`).
- **Hint area** `min-w-0 truncate px-2 text-sm` (`:26-35`):
  - no hints and no outgoing edge → `<span className="text-muted-foreground">End of {title}</span>`;
  - exactly one hint → its `say` text, in `text-destructive` plus the suffix
    **" (control not found)"** when the control could not be located;
  - several hints → each as a `Button size="sm" variant="link" className="h-auto px-1"` link,
    joined by `<span className="text-muted-foreground"> or </span>`; not-found ones get
    `text-destructive`.
- **Skip**: `Button size="sm" variant="ghost"` `Skip <ArrowRight />`, shown when an edge leaves the
  current step (`:13, :36`).
- **Guide toggle**: `Toggle size="sm"` with a `Sparkles` icon, `aria-label="Guide"`, `title` "Guide
  on"/"Guide off" (`:39`). Persists in `sessionStorage["guide-off"]`
  (`src/review/store.tsx:98-99`).

Atlas: `38-journey-step-1-pill-and-guide-ring.png`, `39-journey-pill-closeup.png`,
`42-journey-branch-two-hints.png`, `43-journey-end-of-journey.png`,
`40-journey-guide-off-no-ring.png`.

### 8.3 Guide ring (`src/review/useJourneyGuide.ts`, `src/index.css:131-143`)

The real control inside the mock gets `data-journey-target`, which renders as
`outline: 2px solid oklch(0.606 0.25 292.7)` with `outline-offset: 2px`, `border-radius: var(--radius)`
and a 1.4s `journey-ring` pulse (box-shadow 2px → 12px, fading). **Violet is used nowhere else** —
red/yellow/blue are note states (`src/index.css:131-132`).

Control lookup (`useJourneyGuide.ts:7-12`): scope to `[data-component="<edge.click.in>"]` when given,
else the whole mock root; candidates are `a, button, [role=button], [role=tab]`; pick the first whose
trimmed text contains `edge.click.text`, else the first candidate.

Atlas: `38-journey-step-1-pill-and-guide-ring.png` (one ring), `42-journey-branch-two-hints.png`
(two rings), `40-journey-guide-off-no-ring.png` (ring suppressed).

---

## 9. Command palette (`src/review/CommandPalette.tsx`)

shadcn `CommandDialog` with `title="Search"` and
`description="Jump to a screen, state or journey, or run an action."`, containing an explicit
`Command` root (the current shadcn `CommandDialog` does not render one, `:26-28`).

- `CommandInput` placeholder **"Search screens, states, journeys…"** (`:29`).
- `CommandEmpty`: **"No results."** (`:31`).
- Groups, separated by `CommandSeparator` (`:32-73`):
  1. **Screens** — every screen (icon `Monitor`) followed by each of its states as `stepLabel`
     ("Account – Key revealed"); keywords include the raw ids.
  2. **Journeys** — every journey (icon `Route`) followed by each step as
     `{title} {i+1} · {stepLabel}`.
  3. **Components** — every component key (icon `Blocks`), label `nameOfKey`.
  4. **Actions** — "Components" (`LayoutGrid`); "Mark an area" (`SquareDashedMousePointer`) and
     "Toggle notes panel" (`PanelRight`) **only when the host passes those handlers** — i.e. on a
     screen, not on the Components page (`ReviewLayer:662`, `ComponentsPage:203`).
- Selecting a journey *title* also turns the guide on (`:49`); selecting a step does not (`:54`).
- Opens/closes on **⌘K / Ctrl+K** — `isPaletteKey` (`:10`) — bound both on the parent window (`:16-20`)
  and inside every mock iframe (`ReviewLayer:157-159`), so it works while focus is in the mock.

Atlas: `47-command-palette-open.png`, `48-command-palette-filtered.png`.

---

## 10. Components page (`src/review/ComponentsPage.tsx`)

**Purpose.** A catalog of every component the mocks use, with live isolated previews (`:1`). Only the
project's own components and shells — never shadcn primitives (`src/review/catalog.ts:24-25`).

**Header** (`:79-95`): identical geometry to the screen header (`h-14`, `border-b`, `px-3`,
`SidebarTrigger`, `Separator`). Breadcrumb is `Components` alone, or `Components > {name}` with the
name `line-clamp-1` when one is selected.

**Left list column** (`:99-140`):
`flex flex-col gap-4 border-b p-4 md:w-80 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0`.

- `InputGroup > InputGroupAddon(Search icon) + InputGroupInput` placeholder
  **"Search components…"** (`:100-103`).
- When `from` is set: `Badge variant="secondary" className="self-start" asChild` linking to the
  unfiltered list, reading `On {screenLabel(from)}` + an `X` icon (`:104-108`).
  Atlas: `53-components-page-screen-filter-badge.png`.
- When the inventory reports layer violations: `Alert variant="destructive"` titled **"Layer
  violations"** listing them joined by ` · ` (`:109-114`). *(None in the current tree — not captured.)*
- Sections in `LAYERS` order — **"App shell"** then **"Project components"**
  (`src/review/catalog.ts:16-19`) — each a `p.text-sm.font-medium` heading over an
  `ItemGroup className="gap-1"` of `Item size="sm"` rows rendered as links; the selected row uses
  `variant="muted"`, others `variant="outline"`; each row's `ItemActions` holds a
  `Badge variant="secondary"` with the number of screens using it (`:115-138`).
- Empty result: **"No components match."** (`:139`).
  Atlas: `54-components-page-search-no-match.png`.

**Right detail pane** (`:143-201`): `flex min-w-0 flex-1 flex-col gap-6 p-6 md:overflow-y-auto`.

- No selection → `p.text-muted-foreground` **"Select a component to see where it is used."** (`:145`).
  Atlas: `49-components-page-list-no-selection.png`.
- Title row: `h1.text-lg.font-semibold` + `Badge variant="outline"` with the layer label —
  `shadcn` | `Project` | `App shell` (`:18`, `:148-151`).
- **Live preview** block: a `p.text-sm.font-medium` "Live preview" and, when the component has more
  than one example, a `Select size="sm"` of example names on the right (`:153-162`). The preview sits
  in `Card > CardContent`; with no example: **"No preview"** (`:163-168`).
  Atlas: `50-components-page-component-isolated-preview.png`,
  `51-components-page-example-select-open.png`.
- **Preview mechanics** (`:22-62`): an iframe at `/?frame=1#/__component?name=…&example=…`.
  A normal component gets the pane width and auto-height tracked from the frame's `#root`
  (`:37-44, :57-58`). A **shell** gets a fixed device box `SHELL_W 1440 × SHELL_H 900` (`:19-20`)
  scaled by `min(1, paneW / 1440)` with `transform-origin: top left` (`:47, :50-55`).
  Atlas: `52-components-page-shell-preview-scaled.png`.
- **Used on**: `p.text-sm.font-medium` "Used on" over an `ItemGroup` of screens; each row links to
  the screen and lists its states as `Button variant="link" size="xs"` links (`:171-191`). Empty:
  **"No screen"**.
- **Registry line** (`:193-198`): project component → `Registry: included`; shell →
  `Registry: not included (the registry lists src/components only)`. Both link to
  `/r/registry.json` in a new tab.

The Components page also mounts its own `CommandPalette` with no action handlers (`:203`).

---

## 11. Other routes

- **Unknown screen** (`src/main.tsx:38-44`): a `SidebarInset className="gap-2 p-6"` reading
  `No screen "{path}" in this prototype.` and a `text-muted-foreground` line "Available:" followed by
  underlined links to every screen. Atlas: `57-unknown-screen-fallback.png`.
- **`?frame=1`** (`src/main.tsx:50-67`): renders the screen's default export with the chosen state's
  `args`, falling back to `Default` when the state is unknown. `#/__component?name=&example=`
  renders the resolved component in a `div.p-4` (`:57-60`); an unresolvable name renders nothing.
  Atlas: `55-frame1-raw-screen-render.png`, `56-frame1-raw-component-render.png`.

---

## 12. Keyboard shortcuts

| key | effect | where |
| --- | --- | --- |
| `⌘K` / `Ctrl+K` | toggle the command palette (also from inside the mock iframe) | `CommandPalette.tsx:10,17`; `ReviewLayer.tsx:158` |
| `M` | toggle mark mode | `ReviewLayer.tsx:394` |
| `N` | new note on this screen (whole-screen) | `ReviewLayer.tsx:395` |
| `Esc` | leave mark mode / cancel a pending re-anchor (when no draft dialog is open) | `ReviewLayer.tsx:389` |
| `Esc` | close any dialog (stock shadcn behaviour) | `ui/dialog.tsx`, `ui/alert-dialog.tsx` |
| `⌘B` / `Ctrl+B` | toggle the left sidebar | `ui/sidebar.tsx:32,99` |

`M` and `N` are suppressed while a modifier is held, while focus is in an `input`, `textarea`,
`[contenteditable]` or `[role=dialog]`, and **entirely in journey mode** (`ReviewLayer.tsx:391-395`).

---

## 13. Behaviour rules

Every rule below is implemented; each cites its line.

1. **Three tones, one palette.** red = pending an AI fix, yellow = pending your approval, blue =
   approved (`notes-ui.tsx:15-21`). The same `TONE.pin` colours the dot, the pin badge and the box
   border everywhere.
2. **Status derivation is worst-of.** `worst()` returns `open` if any note is open, else `answered`
   if any is answered, else null (`store.tsx:24-25`).
3. **Screen tone** = worst-of that screen's notes across *all* states; with nothing pending it is
   `approved` only when the owner explicitly approved the screen, otherwise `answered`
   (`store.tsx:28-29`). Journey notes never take part (there are none).
4. **State tone** = worst-of that state's notes, with no approval concept: nothing pending → no dot
   (`store.tsx:31-32`).
5. **Journey tone** defaults to `answered` when the journey has no thread (`store.tsx:23`).
6. **A new note, or a note turning red, un-approves its screen.** On every commit the store diffs
   the notes, collects those that are new or have just become `open`, and drops their screens from
   `approvedScreens` (`store.tsx:69-73`).
7. **Any reply re-opens.** Replying to a note sets `status: "open"` and appends an `owner` entry
   (`ReviewLayer.tsx:619`); replying to a journey sets the journey to `open`
   (`store.tsx:82-84`).
8. **Approve** sets a note to `approved` (`ReviewLayer.tsx:658`); **reject and delete both remove
   the note** and clear the selection (`ReviewLayer.tsx:659`).
9. **Note ids** are `N` + zero-padded max-existing + 1 (`store.tsx:89-90`).
10. **Every mutation persists immediately** with a `POST /__notes` of the whole document
    (`store.tsx:75`), which the dev-server plugin writes to `notes.json`
    (`mock-plugin.ts:101-111`). On load the store `GET`s `/__notes` and tolerates a legacy plain
    array or a missing map (`store.tsx:61-65`).
11. **Anchoring.** The smallest `[data-component]` element that fully contains the drawn box (6px
    tolerance) wins; if none contains it, the component under the box's centre; otherwise the screen
    anchor `__screen`. The stored rect is a *fraction* of that element's box, plus an 80-character
    text snippet (`ReviewLayer.tsx:43-67`).
12. **Anchor lost → the note goes outdated.** Resolution fails when the component/index no longer
    exists or the snippet is no longer in its text (`:69-76`); an outdated note draws no box (its
    resolved box is null) and its dialog offers **Re-anchor** (`:630-637`).
13. **Re-anchor moves the existing note** rather than creating one, and also re-homes it to the
    current screen/state/viewport (`:346-352`).
14. **The note box never swallows clicks.** Boxes are `pointer-events-none`; only the pin is
    clickable, and even that is disabled while marking (`:221-227`).
15. **A note drawn in the other device shows as a ghost**, and a whole-screen note shows no box at
    all (`:214-218`).
16. **A state switch replaces the frame's hash — it never reloads the iframe.** `frameSrc` is
    memoised on `screen` only; a state change calls `win.location.replace(pathname + search + hash)`
    with the full URL, because a bare `#…` would resolve against the reviewer's URL and load the
    whole reviewer inside the frame (`:121-136`).
17. **Boxes are re-measured** on frame scroll (capture phase, so inner scrollers count), on content
    resize and on mutation, coalesced through two `requestAnimationFrame`s (`:137-167`).
18. **Selecting a note navigates.** A project note just opens; a note on another screen sets a
    module-level `pendingOpen` and changes the hash, and the remounted layer opens it
    (`:314-338`); a note in another state changes the hash (`:324`). Selection scrolls only the
    sidebar list, never the page, and only when the click came from the mock (`:325-332`).
19. **Opening a note keeps a non-empty draft** (collapsed to its box) and discards an empty one
    (`:319,323,405`).
20. **The mock is inert while a dialog is open.** `isolated = popoverOpen || !!confirm` is passed to
    the iframe's `inert` (`:418`, `:210`).
21. **The journey guide intercepts clicks in the capture phase** on the *frame's* document (clicks
    inside the mock never reach the parent), prevents default, stops propagation and navigates to
    the edge's target step (`useJourneyGuide.ts:62-71`).
22. **The guide waits for every frame to show this step** before scanning: it polls every 50ms until
    each visible frame's hash equals `#/<screen>?state=<state>`, giving up after ~2s and using
    whichever are ready — so the ring never lands on the previous state's controls
    (`useJourneyGuide.ts:32-44`).
23. **Hints work even with the guide off.** The `ring` flag only controls the violet outline and
    scrolling the control into view inside the frame; hints and click-to-advance always work on a
    journey step (`useJourneyGuide.ts:18-19, 52-60`).
24. **The guide is paused** while marking, while a note dialog is open and while a verdict dialog is
    open (`ReviewLayer.tsx:410`).
25. **Scrolling stays inside the frame.** The guide scrolls the iframe window, never the reviewer
    page (`useJourneyGuide.ts:54-59`); the marking overlay forwards wheel to the iframe
    (`ReviewLayer.tsx:245`).
26. **Journey mode has no screen notes**: note pins and mark mode are suppressed
    (`showNotes && !journey`, `marking && !journey`, `:524`), `M`/`N` do nothing (`:393`), the notes
    toggle loses its count (`:514`), and the header offers "Open in Screens" instead — which also
    flips the left sidebar to the Screens tab (`:497-501`).
27. **A journey in the URL brings its list forward**: the sidebar switches to the Journeys tab
    (`AppSidebar.tsx:25`), and starting a journey from the sidebar or the palette turns the guide on
    (`AppSidebar.tsx:54`, `CommandPalette.tsx:49`).
28. **Switching state by hand keeps the chosen journey**; the pill then reports whether this state is
    on it (`ReviewLayer.tsx:265-266`, `JourneyPill.tsx:18-22`).
29. **Journey location.** `locate()` trusts the `step` param only when that step really is the
    current screen+state; otherwise it finds the first matching step, or -1
    (`journeys.ts:50-55`).
30. **Scale never upscales** (`min(1, …)`) and never goes below 0.1 (`ReviewLayer.tsx:416`); the
    device height is whatever fills the remaining space, and the mock scrolls inside
    (`:92-93, :417`).
31. **Chrome state persists per session** in `sessionStorage`: `guide-off`, `view`, `side-tab`;
    every access is wrapped for private mode (`store.tsx:98-109`). The palette's open state is
    **not** persisted (`store.tsx:106`).
32. **Sidebar open/closed persists** in the `sidebar_state` cookie for 7 days
    (`ui/sidebar.tsx:27-28, 85`).
33. **The approve line shows only when it is actionable** — screen approval appears only at tone
    `answered` (`ReviewLayer.tsx:540-546`), journey approval likewise (`JourneyPanel.tsx:35`).
34. **States are ordered Default-first** everywhere (`labels.ts:14-20`, `ReviewLayer.tsx:260-262`),
    and a state export counts as a state only if it has `args`.
35. **Labels never show raw ids**: screens use `meta.label` or Title Case; states use the export's
    `name` in sentence case; a step is `{Screen} – {State}` (`labels.ts:9-27`).
36. **The components catalog excludes shadcn primitives** (`catalog.ts:25`) and resolves an example
    by name, falling back to the first (`catalog.ts:32-40`).
37. **Changing the selected component resets the chosen example** (`ComponentsPage.tsx:67`).
38. **An unknown `state`, `c` or `example` degrades silently** to Default / no selection / the first
    example (`main.tsx:64`, `ComponentsPage.tsx:69,74`, `catalog.ts:38`).

---

## 14. Data the UI shows

Note record (`src/review/store.tsx:8-17`):

| field | where it appears |
| --- | --- |
| `id` | pin badge, row badge, dialog title, verdict title (`ReviewLayer:228,575,625`; `notes-ui:108`) |
| `screen`, `state` | row "what" prefix, dialog description, which frame draws the box (`ReviewLayer:571-572,626,171`) |
| `component`, `index` | anchor resolution; the component name is the row/dialog subject (`:70-72,570,625`) |
| `rect` | box geometry as a fraction of the anchor element (`:77-81`) |
| `snippet` | staleness check only — never displayed (`:74`) |
| `status` | tone of the pin, the box, the row badge, and which verdict buttons show (`:219,228,574`; `notes-ui:126-137`) |
| `thread` | `thread[0].text` is the row description; the whole array is the dialog thread (`:575,638`) |
| `thread[].by` | renders as "AI" or "You" (`notes-ui:90`) |
| `viewport` | which device owns the note (others get a ghost); appended to the dialog description (`:90,626`) |
| `whole` | suppresses the box; row/dialog subject becomes "Whole screen" (`:214,570,625`) |
| `project` | row/dialog subject "Project note", description "Project", always listed in the PROJECT group (`:570,625-626,432`) |

Journey thread (`store.tsx:22`): `status` → the sidebar dot and whether Approve shows; `thread` →
the panel conversation.

`approvedScreens` (`store.tsx:47`): a screen id map; the only thing that turns a clean screen blue
(`store.tsx:29`).

Journey definition (`src/journeys.ts:11-15`): `title` (sidebar row, breadcrumb, pill, palette),
`persona` (sidebar tooltip/`title`, palette keyword), `steps[]` (sidebar sub-rows, breadcrumb
"Step i of n", palette), `edges[].say` (pill hint text), `edges[].click` (which real control gets
the ring), `edges[].from/to` (Back, Skip and branch links).

Screen module (`ReviewLayer.tsx:34`): `meta.label` → screen label, `meta.title` → the journey step's
screen id, each state export's `name` → state label, `args` → the props the frame renders.

Inventory (`mock-plugin.ts:23-51`, consumed in `catalog.ts`): `screens[].uses` → the component
list and its per-component "Used on" screens and counts; `violations` → the destructive Alert.

---

## 15. Surfaces not captured, and why

1. **"Approve screen" status line** (`ReviewLayer.tsx:540-548`) — unreachable with the shipped
   `notes.json`: it renders only when the screen's tone is `answered`, and both screens carry an
   `open` note (`console-account` N002/N006/N009, `console-home` N008). Reaching it would require
   deleting or approving existing notes, which this freeze did not do.
2. **Notes-panel empty states** ("No notes on this screen." / "No other notes.",
   `ReviewLayer.tsx:566`) — both screens have notes and the project always has notes from the other
   screen, so neither group is ever empty in this data set.
3. **Layer-violations Alert** on the Components page (`ComponentsPage.tsx:109-114`) — the current
   tree has no violations, so the alert never renders.
4. **"(control not found)"** hint styling (`JourneyPill.tsx:28`) — every edge's control resolves in
   the shipped mocks.
5. **Dark scheme** — no toggle exists; `ThemeProvider` is never mounted (§0.3).

**One deliberate data change during capture.** To photograph the approved (blue) tone — absent from
the seed data, and not creatable from scratch through the UI because a new note is always red and
only the AI can turn it yellow — note **N004** was approved through the UI (Approve → confirm) as the
last step of the capture run. Screenshots `01`–`57` show N004 yellow; `58`–`59` show it blue. No
other note, journey or approval was modified, and nothing else under the prototype was touched.
