# The client view — design (binding for the prototype build)

## Who, and what for

The reader is a business owner or one of their staff. Not technical. On a phone, in spare
minutes, over several weeks. They were sent a link. They have one job: read the story of
their product in their own words, look at each screen, say what is wrong, and confirm the
story when it is right.

The owner's page (the three-column reviewer) is a workbench. This is not a workbench. It has
no sidebar, no breadcrumbs, no toggles, no search, no state dropdown, no pins switch.

## The idea: a storyboard

A film storyboard is a row of frames, each with a line of script under it. That is exactly
what we hold: a gray frame (the wireframe) and the client's own sentence. The sentence is the
script; the frame illustrates it. So the sentence leads and the frame follows. A note is a
highlighter mark on the printed board.

The one memorable thing: **the client's sentence, set large in a serif, in quotation marks,
above the frame.** Everything else is quiet.

## Tokens

Colour (the wireframes are gray, so the chrome stays cool and out of their way):

| Name | Hex | Used for |
| --- | --- | --- |
| ink | `#16202A` | text, primary buttons |
| slate | `#E9EDF1` | page background |
| sheet | `#FFFFFF` | frames, sheets, bars |
| quiet | `#66727F` | secondary text, hairlines at 25% |
| highlighter | `#FFD84A` | everything about notes: the pick outline, pins, the note count |
| confirmed | `#0F7B5C` | the confirmed state only |

No other colour. No gradients. No shadows except one on the bottom sheet
(`0 -8px 32px rgba(22,32,42,.18)`). Status is carried by words, not by a colour code the
reader must learn: a note says "Waiting for an answer", "Answered", "Done".

Type:

- **Newsreader** (Google Fonts, weights 400 and 500, italic 400) — the story voice: the
  sentences, and nothing else.
- **Geist Variable** (already in the project) — every control, label and note.
- Scale (phone / desktop): sentence 26/34 px, line-height 1.2, weight 500; step title
  13/14 px quiet; body 16 px; control label 15 px weight 500; small 13 px.
- Sentence case everywhere. No all-caps labels. No middle-dot strings. No arrows appended to
  button text.

Shape: frames have a 10 px radius and a 1 px quiet/25% border. Buttons are 48 px tall on a
phone (44 on desktop), 10 px radius. Sheets have a 20 px top radius. Nothing else is rounded.

Motion: the bottom sheet slides up in 180 ms; the step change cross-fades the frame in
120 ms. Nothing else moves. `prefers-reduced-motion` turns both off.

## Screens

### 1. A step (the main screen)

Phone (one column, the frame scaled to the column width, never scrolled sideways):

```
┌────────────────────────────┐
│ Hearwell          Step 2 of 4 │  bar: project name left, position right
│ ━━━━━━━━──────────────── │  progress: 4 segments, filled up to here
├────────────────────────────┤
│                              │
│  “I check who is on          │  the sentence — Newsreader 26
│   my team”                   │
│                              │
│  Changed since you last looked│  only when true (quiet, 13 px, with a
│                              │  highlighter dot)
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │        the frame         │ │  wireframe at phone width (390), scaled
│ │                          │ │
│ └──────────────────────────┘ │
│                              │
│  2 notes on this step        │  a row that opens the notes sheet
│                              │
├────────────────────────────┤
│ [ Back ]  [ Add a note ]  [ Next ] │  sticky bar; Next is the ink button
└────────────────────────────┘
```

Desktop (≥ 960 px) is a real two-column layout, not a centred phone:

```
┌───────────────┬──────────────────────────────────────────────┐
│ Hearwell       │  “I check who is on my team”                        │
│ Owner onboarding│                                                    │
│                │  ┌──────────────────────────────────────────┐ │
│ 1 I open the   │  │                                            │ │
│   invitation   │  │            the frame (1280 wide,           │ │
│ 2 I check who  │  │            scaled to fit)                  │ │
│   is on my team│  │                                            │ │
│ 3 I see nobody │  └──────────────────────────────────────────┘ │
│   is listed yet│  Phone   Desktop            2 notes on this step   │
│ 4 I read what  │                                                    │
│   happens next │  [ Back ]            [ Add a note ]      [ Next ]  │
│                │                                                    │
│ See the whole  │                                                    │
│ story          │                                                    │
└───────────────┴──────────────────────────────────────────────┘
```

- Left column 340 px, fixed: the numbered sentences (it is a real sequence, so numbers are
  honest). The current one is ink and weight 500, the others quiet. A step with a note that
  is waiting shows a highlighter dot after its sentence. Clicking a sentence goes to it.
- "Phone / Desktop" is a two-word switch under the frame, shown only when the round has both
  widths. On a phone it is not shown: the phone gets the phone width.
- Pressing the control the story expects inside the frame (the element with `data-to`)
  advances, same as Next. The ring from the old guide is NOT drawn: the client is not being
  trained, Next is always there.

### 2. Adding a note

1. "Add a note" turns the bar into: `Tap the part you mean` (left) and `Cancel` (right), with
   a second line `or write about the whole screen` as a text button.
2. While in this mode, the element under the finger/pointer gets a 2 px highlighter outline
   with a 4 px highlighter/30% halo. No drag. One tap picks it.
   On a picture (screenshots round) the tap drops a highlighter pin at that point.
3. A bottom sheet opens (on desktop: a 420 px panel docked right):

```
┌────────────────────────────┐
│  About “Ren” on this screen    │  what was picked, in the reader's words:
│                                │  the element's visible text, shortened to
│  ┌──────────────────────────┐ │  40 chars; "this screen" when nothing was
│  │ What should change here?    │ │  picked; "this spot" on a picture
│  │                            │ │
│  └──────────────────────────┘ │
│                                │
│  [ Cancel ]        [ Save note ] │
└────────────────────────────┘
```

4. After saving: the sheet closes, a highlighter pin with the note's number sits on the
   element, and a line appears for 4 seconds above the bar: `Note saved. We will answer it
   here.`

Never show an internal name (`who`, `row1`, `N001`). Notes are numbered 1, 2, 3 per project
in the order the reader sees them.

### 3. Reading notes and answers

"2 notes on this step" opens a sheet listing them. Each note:

```
  1  About “Ren”
     You: Ren has a surname: Ito
     Team: Fixed: the roster now shows Ren Ito.
     Answered                                   [ Looks right ]  [ Reply ]
```

- Authors are `You`, `Team` (the session or the owner), or the person's role if it is another
  client user later.
- States in words: `Waiting for an answer`, `Answered`, `Done`.
- `Looks right` closes the note as done (today's `close → approved`). `Reply` opens the text
  field in place. There is no "defer" for a client.
- Tapping a note scrolls the frame to its pin and pulses the pin once.

### 4. The whole story (the overview; replaces the thumbnail map that never existed)

Reached by "See the whole story" and shown automatically after the last step.

```
┌────────────────────────────┐
│ Owner onboarding               │
│ Mika is invited, confirms her  │  the persona line
│ roster, and ends at the brief. │
│                                │
│ ┌────────┐ 1 “I open the       │  small frame (scaled wireframe) + sentence
│ │ frame  │    invitation”      │
│ └────────┘                     │
│ ┌────────┐ 2 “I check who is   │
│ │ frame  │    on my team”      │
│ └────────┘    1 note waiting   │
│  …                             │
│                                │
│ [ This is my story ]           │  the confirm, full width, ink
│ You can still add notes after. │
└────────────────────────────┘
```

Desktop: the frames form a grid of 2 or 3 columns (a storyboard sheet), each with its
sentence under it; the confirm block sits at the end, left-aligned, max 520 px wide.

- If notes are still waiting, the confirm button stays enabled but the line under it reads
  `1 note is still waiting for an answer. You can confirm now or wait.`
- After confirming, the button is replaced by: a `confirmed` green check and
  `You confirmed this story on 29 September.` The page does not navigate away.
- If the story changed after the confirmation: a highlighter band at the top of every screen
  of this view: `The story changed since you confirmed it. Please read it again.` with the
  changed sentences marked `Changed` in the list, and the confirm button back.
- A journey whose steps have no sentences cannot be confirmed: the button is replaced by
  `This story is not written yet.`

### 5. Several journeys (the stories page)

With one journey the link opens straight on step 1 and this page does not exist. With more,
it is the entry screen, and it is a storyboard too: every story shows its frames.

The push carries two new optional fields per journey: `actor` (who the story is about, short:
`Mika, clinic owner`) and `variantOf` (the id of the main story this one is an alternate
path of). A story with `variantOf` never stands alone; it sits under its main story.

Phone:

```
┌────────────────────────────┐
│ Hearwell                       │
├────────────────────────────┤
│ 3 of 8 stories confirmed       │  Geist 20/500; under it the 8-segment
│ ━━━ ━━━ ━━━ ─── ─── ─── ─── ─── │  bar, confirmed segments in `confirmed`
│                                │
│ Needs you                      │  section heading, Geist 15/500 ink
│ ┌────────────────────────────┐ │
│ │ ▭ ▭ ▭ ▭                      │ │  strip: the story's first 4 frames,
│ │ Owner onboarding             │ │  each 64 px wide, cropped to 4:3,
│ │ Mika, clinic owner           │ │  then title (16/500) and actor (quiet)
│ │ ● 1 answer to read           │ │  status line, highlighter dot
│ │   └ If nobody is listed yet  │ │  variants: indented rows, title +
│ │       Not read yet           │ │  status only, no strip
│ └────────────────────────────┘ │
│                                │
│ Not read yet                   │
│  …                             │
│ Confirmed                      │
│  …                             │
└────────────────────────────┘
```

Desktop (≥ 960 px): the same three sections, each a grid of story tiles, 3 columns (2 below
1200 px), 24 px gap, full content width (max 1320 px). A tile's strip shows up to 4 frames at
the tile's width / 4. Variants are rows inside their main story's tile. The progress line and
bar sit top-left, max 520 px wide.

- Sections, in this order, each omitted when empty:
  - `Needs you` — the story changed since the reader confirmed it, or a note of theirs has
    an answer they have not closed.
  - `Not read yet` — never opened in this browser, or opened and not confirmed.
  - `Confirmed` — confirmed and unchanged.
  A main story takes the most urgent section among itself and its variants.
- Status line per story or variant, one of: `Changed since you confirmed`,
  `1 answer to read` / `3 answers to read`, `1 note waiting for an answer`, `Not read yet`,
  `Read, not confirmed yet`, `Confirmed on 29 September`. Only the first two carry the
  highlighter dot; the last carries the `confirmed` check.
- When the project has stories for more than one `actor` AND more than 6 main stories, each
  section is sub-grouped by actor with the actor as a quiet 13 px line above its tiles
  (`Mika, clinic owner`). Otherwise the actor is only the line inside the tile.
- The progress counts main stories and variants alike (each is confirmed on its own).
- The whole tile is one link to the story's step 1 (or to its whole-story page when it is
  confirmed). A variant row is its own link. 44 px minimum height for a variant row.
- Frames in the strip are real scaled wireframes (or the picture), not icons. While they
  load, the slate placeholder holds their size.
- No cards with shadows: a tile is a sheet-white rectangle, 10 px radius, 1 px quiet/25%
  border, like a frame.

### 6. Empty, loading, broken

- No round pushed yet: `Nothing to look at yet. We will send you a message when the first
  version is ready.`
- Link no longer valid: `This link no longer works. Ask the person who sent it for a new one.`
- Save failed: the sheet stays open with the text intact and a line: `The note was not saved.
  Check your connection and press Save note again.`
- The frame is still loading: the frame area shows the slate background at the frame's final
  height (no spinner, no layout jump).

## What the server must add

- `state.changes`: for the shown round, per `screen` + `state`: `new`, `changed` or `same`,
  compared with the previous round's spec (deep-equal on the stored spec; for pictures,
  byte-equal); and per journey: which step sentences differ from the previous round.
- Notes carry `pickedText` (the element's visible text at the time, ≤ 40 chars) so the
  reader sees "About “Ren”" and never an element name.
- The `rect` field and every drag-area field are removed from the anchor. The anchor is
  `{node, index}` on a wireframe, `{x, y, width}` on a picture, or null.

## The owner's page

Stays the three-column reviewer, with two changes only: "Mark an area" and the drag gesture
are removed and replaced by the same `Add a note` pick mode (one click on an element, one
click on a picture); and a note's label is its picked text, never an element name.
