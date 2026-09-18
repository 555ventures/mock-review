---
date: 2026-09-18
status: hardened
tier: critical
area: server
design: false
breaking: false
depends_on: [specs/20260918/01-writes-never-tear-never-lose.md]
depended_on_by: [specs/20260918/03-the-page-has-no-operator-controls.md]
brief: n/a
spiked: 2026-09-18
open_markers: 0
---

# One reply, and the page ends a note

## Goal

A client who replies to a note is refused. `NoteDialogs.tsx` offers the Reply field to both roles,
but the page sends `op:'update'` carrying the whole recomputed thread, and the op-level gate never
admits `update` for a client (`src/server/plugin.ts:198-207`) — so the reply is answered 403, the
textarea clears, and what they typed is gone. The same whole-thread send is a lost-update race with
a concurrent CLI `answer`. And nothing on the page can put a note on hold: the server has had
`op:'close'` with a client-ownership gate since v2, and `src/ui` has never called it. This spec
makes a reply its own server-side operation that both roles and the CLI share, gives the page the
controls that end a note, and makes `deferred` a state a reviewer can actually reach and see. Done
means the client can answer back and park a note, the owner can park one too, and no thread is ever
sent from a browser again.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A new notes op: `{ op: 'reply', id, entry: { by, text } }`, `.strict()`, with `text` `z.string().trim().min(1)` on this op only. `id` resolves note-first exactly as `close` does (`plugin.ts:369-380`): unknown everywhere → 404; a real journey id with no conversation yet → seeded `{status:'open', thread:[]}`. The reducer appends the entry and sets `status = entry.by === 'session' ? 'answered' : 'open'` from any current status (AC-20260918-02-1, AC-20260918-02-2, AC-20260918-02-3) | One op for the one thing a thread does. Attribution decides whose turn it is, which is the rule the panel and the driver already read: a session reply is an answer (yellow), anybody else's reply reopens (red). Replies to `approved`/`deferred` reopen too — the dialog offers Reply at every status (design-reference §7.3) and rule 7 says any reply re-opens |
| D2 | `clientNotesOpPatch` (`plugin.ts:198-207`) admits `reply` and forces `entry.by = 'client'`, exactly as it already forces the thread on `add`. The owner's `by` is passed through, bounded to `'owner' \| 'session'` by the wire schema (AC-20260918-02-4) | The 403 was never a policy — a client replying to their own note is the entire point of the review link. Forcing `by` server-side keeps attribution unforgeable without refusing the request |
| D3 | `update.fields` refuses `status` and `thread` **by name**, through a `superRefine` in the same style as `AddNoteSchema`'s `id` refusal (`src/schemas/patches.ts:25-34`), and keeps its passthrough catchall. It does **not** use `.omit()` and does **not** become `.strict()` (AC-20260918-02-5) | Executed (A3): on a passthrough schema `.omit({status, thread}).partial()` accepts both keys anyway — the narrowing is a no-op — and `.strict()` rejects them but also rejects `rect`/`viewport`/`whole`, the page-owned geometry `patches.ts:8-13` deliberately preserves. Naming the two forbidden keys is the only form that does exactly what is meant. `update` is now anchor edits only |
| D4 | `op:'journey'` is retired from the wire and the reducer. Its `entry` half is `reply`; its `status` half is `close` (`approveJourney` becomes `{op:'close', id, status:'approved'}`, which already accepts journeys from any status). `applyNotesPatch` loses its `journey` case and its rule-7 status override, which moves into `reply` (AC-20260918-02-6) | Two ops that do one thing each are not two ops. Keeping `journey` would leave a second path that appends a thread entry, with its own attribution rule, which is how the current divergence happened |
| D5 | `approveNote` stops sending `op:'update'` with `status:'approved'` and sends `{op:'close', id, status:'approved'}`. With D3 and D4 in place, **no browser request can carry a note's `status` or `thread` any more** (AC-20260918-02-5, AC-20260918-02-7) | The whole-thread merge computed in `useNoteActions.ts:66-74` from the page's own store is the lost-update race with a concurrent `answer`; deleting the ability to send a thread is what closes it, rather than a lock that cannot help because the array was already stale when it left the browser |
| D6 | `src/cli/answer.ts` stops hand-mutating and calls `applyNotesPatch(notes, {op:'reply', id, entry:{by:'session', text}}, approval)` inside `withDesignLock`. A journey target must already have a conversation, as today (`answer.ts:52-58`) — `answer` has no Vite and cannot ask whether a journey id is real (AC-20260918-02-8, AC-20260918-02-12) | `src/server/patches.ts:2-3` claimed for two versions that every mutation goes through the reducer while `answer.ts:76-77` never did; spec 01 retires the claim, this one makes it true. Rule 6 then applies identically from both processes instead of by coincidence |
| D7 | Rule 6 gains exactly one trigger: a **note** reply whose resulting status is `open` un-approves that note's screen. A `by:'session'` reply resolves to `answered` and therefore never touches approval, preserving `answer`'s current "approval.json byte-identical" property. Journey replies never touch approval. `applyNotesPatch` returns `approval` by identity whenever unchanged (AC-20260918-02-9, AC-20260918-02-13) | A client saying "this is still wrong" is precisely the event rule 6 exists for. Identity return is contract-relevant, not stylistic: `plugin.ts:399` suppresses the approval write on it, and `tests/server/api.test.ts` pins a v1 `approval.json` staying byte-identical through a notes patch |
| D8 | `NoteActions` (`src/ui/notes/notes-ui.tsx:189-219`) takes `role` and `own` (`thread[0].by === 'client'`, the server's own gate). **Client**, on a note they raised and while it is not closed: **Approve** and **Defer**, never Delete or Reject. **Owner**: Delete while `open`; Reject, Approve and **Defer** while `answered`. Every one of those buttons issues `close` except Delete/Reject, which stay `remove`. `VerdictDialog` gains a `defer` kind (AC-20260918-02-10, AC-20260918-02-11) | The plugin's doctrine lists the page's controls as approve, defer, reject, delete and its driver tells a client to "approve or defer it on the link" — unimplementable until now. Defer was missing for the owner too, so this is not a client-only gap |
| D9 | `deferred` becomes a **fourth pin tone**, muted grey: `PinTone` (`notes-ui.tsx:21`) and `TONE` (`:24`) widen, the note row and dialog title carry the word `Deferred`, and `toneOf` (`src/ui/store/selectors.ts:22-24`) is **deleted** — the compiler lists its call sites. The aggregate `Tone` (`selectors.ts:7`) stays at three members and `worst()` keeps bucketing `deferred` as closed, so sidebar and panel dots are unchanged (AC-20260918-02-11) | The user chose a distinct colour so a parked note is separable at a glance. Widening the aggregate `Tone` as well would change what a screen's and a journey's dot mean, which is a different frozen-surface question nobody has been asked — `selectors.ts:20`'s note to widen both is followed only where the user's answer reaches |
| D10 | `docs/design/design-reference.md` gains one Amendments entry covering: the fourth pin tone and its §4/§13 rules, the client's Approve/Defer controls, the owner's new Defer, and the already-landed `Notice` banner from the direct fix that preceded this series `[no-ac: documentation of decisions covered by AC-20260918-02-10 and AC-20260918-02-11]` | The reference is binding and frozen; every deviation in this repo is recorded there rather than argued again later. The landed `Notice` is on the same footing as `ForbiddenNotice` and has no entry yet |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/schemas/patches.ts | MODIFY | schemas | D1 `reply` member with trimmed non-empty `text`; D3 `update.fields` superRefine refusing `status`/`thread`; D4 `journey` member deleted |
| src/server/patches.ts | MODIFY | server | D1/D7 `reply` case with attribution-driven status and the one new rule-6 trigger; D4 `journey` case and its rule-7 override deleted |
| src/server/plugin.ts | MODIFY | server | D1 `reply` 404/seed resolution beside `close`; D2 client admission forcing `entry.by` |
| src/cli/answer.ts | MODIFY | cli | D6: reducer via `op:'reply'`, `by:'session'`, inside spec 01's lock |
| src/ui/notes/useNoteActions.ts | MODIFY | ui | D1/D4/D5: `replyNote`/`replyJourney` send `reply`; `approveNote`/`approveJourney` send `close`; no thread leaves the browser |
| src/ui/notes/NoteDialogs.tsx | MODIFY | ui | D8: `NoteActions` by role and ownership; `VerdictDialog` gains `defer`; D9 `Deferred` in the dialog title |
| src/ui/notes/notes-ui.tsx | MODIFY | ui | D8 `NoteActions` props; D9 `PinTone`/`TONE` gain `deferred` |
| src/ui/screen/ScreenPage.tsx | MODIFY | ui | D5/D8: verdict dispatch routes approve and defer to `close`, reject/delete to `remove` |
| src/ui/notes/Overlay.tsx | MODIFY | ui | D9: two `toneOf(note.status)` call sites (`:50`, `:59`) pass `note.status` straight to `PinTone` |
| src/ui/notes/NotesPanel.tsx | MODIFY | ui | D9: the row's `tone={toneOf(n.status)}` (`:97`) passes `n.status`; the `Tone` import narrows to the aggregate use |
| src/ui/store/selectors.ts | MODIFY | ui | D9: `toneOf` deleted; aggregate `Tone` and `worst()` unchanged |
| docs/design/design-reference.md | MODIFY | other | D10: one Amendments entry |
| tests/unit/patches.test.ts | MODIFY | tests | AC-20260918-02-1, AC-20260918-02-2, AC-20260918-02-3, AC-20260918-02-6, AC-20260918-02-9, AC-20260918-02-13 |
| tests/server/api.test.ts | MODIFY | tests | AC-20260918-02-4, AC-20260918-02-5, AC-20260918-02-7 |
| tests/cli/answer.test.ts | MODIFY | tests | AC-20260918-02-8, AC-20260918-02-12 |
| tests/unit/selectors.test.ts | MODIFY | tests | AC-20260918-02-11 |
| tests/browser/surfaces.test.ts | MODIFY | tests | AC-20260918-02-10 |

## Contracts

```ts
// src/schemas/patches.ts

/** The one operation that adds to a thread. `text` is trimmed and must be non-empty — an empty
 * reply is a mis-click, never an intent. `by` is bounded HERE (the wire); the read-back
 * `ThreadEntrySchema.by` stays `z.string()` under the read-back permissiveness rule (spec 04 D4). */
const ReplyEntrySchema = z.object({
  by: z.enum(['owner', 'client', 'session']),
  text: z.string().trim().min(1),
}).strict()

// added member:
z.object({ op: z.literal('reply'), id: z.string(), entry: ReplyEntrySchema }).strict()

// removed member: { op: 'journey', id, status?, entry? }

/** D3: `status` and `thread` are refused BY NAME. `.omit()` cannot do this — the catchall re-admits
 * them (A3, executed) — and `.strict()` would also reject `rect`/`viewport`/`whole`. */
const UpdateFieldsSchema = NoteSchema.omit({ id: true }).partial().superRefine((fields, ctx) => {
  for (const key of ['status', 'thread'] as const) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      ctx.addIssue({ code: 'custom', message: `update may not set ${key}`, path: [key] })
    }
  }
})
```

```ts
// src/server/patches.ts — the reply case
// status is decided by attribution, from ANY current status:
//   by === 'session' -> 'answered'   (the session answered; the reviewer's turn)
//   otherwise        -> 'open'       (somebody asked again; the session's turn)
// rule 6 fires only for a NOTE whose resulting status is 'open' and whose screen is non-null.
```

## UI

**Note card (`NoteDialogs.tsx`).** Unchanged layout. The footer's action group is now a function of
role and ownership:

| Viewer | Note status | Buttons shown |
|--------|-------------|---------------|
| owner | `open` | Delete |
| owner | `answered` | Reject · Approve · **Defer** |
| owner | `approved` / `deferred` | none |
| client | `open` / `answered`, thread raised by the client | **Approve** · **Defer** |
| client | any other | none |

Reply stays available to both roles at every status, as today.

**Confirm dialog.** `VerdictDialog` gains a third kind, `defer`, titled `Defer {id}?` with the body
`It stays on the list, greyed out, until someone replies again.` Approve and Reject keep their
current wording.

**Pin and row.** A `deferred` note renders in the new muted-grey tone. Its panel row and its dialog
title carry the word `Deferred`. Sidebar and panel status dots are unchanged — a deferred note still
counts as closed in every aggregate.

## Data Model

No on-disk shape change and no `contractVersion` change. The set of `status` values written to
`design/notes.json` is unchanged in membership (`open`/`answered`/`approved`/`deferred`) but
`deferred` becomes reachable from the page for the first time, so hosts will start seeing it on
disk. Thread entries stay `{by, text}` — a timestamp needs a schema change and is not in this spec.

## Behavior

**Who speaks last decides whose turn it is.** A reply from the client or the owner reopens the note
(red, the session owes an answer). A reply from the session answers it (yellow, the reviewer owes a
verdict). This is the rule the panel already renders and the plugin's driver already reads; it was
simply not enforced in one place.

**Ending a note.** Approve and Defer both go through `close`, which accepts any source status and
never touches approval. Delete and Reject both remove the note outright, as today — Reject has never
been a status change and this spec does not make it one.

**A client on someone else's note.** They can reply (reopening it) but see no verdict buttons; the
server's ownership gate would refuse `close` anyway, and now the page does not offer it.

**A stale page.** A browser still running pre-spec code sends `op:'update'` with `status`/`thread`
and is refused 400 instead of clobbering a thread. The landed notice surfaces the refusal.

## Acceptance Criteria

- **AC-20260918-02-1**: WHEN `{op:'reply', id:'N1', entry:{by:'client', text:'still wrong'}}` is
  applied to a note whose status is `answered` THE SYSTEM SHALL append the entry and set the note's
  status to `open` (thread length 1 → 2, `status: 'answered'` → `'open'`)
  → writes tests/unit/patches.test.ts
- **AC-20260918-02-2**: WHEN the same op carries `by:'session'` THE SYSTEM SHALL set the note's
  status to `answered` from any source status (`open` → `answered`, `deferred` → `answered`)
  → writes tests/unit/patches.test.ts
- **AC-20260918-02-3**: WHEN `entry.text` is `'   '` THE SYSTEM SHALL refuse the patch at the schema
  (`NotesPatchSchema.safeParse` → `success: false`) → writes tests/unit/patches.test.ts
- **AC-20260918-02-4**: WHEN a client-role request posts `{op:'reply', id:'N1', entry:{by:'owner',
  text:'hi'}}` THE SYSTEM SHALL answer 200 and persist the entry with `by: 'client'`
  → writes tests/server/api.test.ts
- **AC-20260918-02-5**: WHEN any request posts `{op:'update', id:'N1', fields:{status:'approved'}}`
  or `fields:{thread:[]}` THE SYSTEM SHALL answer 400 and leave `design/notes.json` byte-identical,
  while `fields:{rect:{...}, viewport:'desktop'}` is still accepted
  → writes tests/server/api.test.ts
- **AC-20260918-02-6**: WHEN a request posts `{op:'journey', id:'first-visit', entry:{...}}` THE
  SYSTEM SHALL answer 400, the op no longer being a member of the patch union
  → rewrites tests/unit/patches.test.ts :: AC-20260917-02-13
- **AC-20260918-02-7**: WHEN the owner approves a note on the page THE SYSTEM SHALL send
  `{op:'close', id, status:'approved'}` and the served note SHALL become `approved` with its thread
  unchanged in length → writes tests/server/api.test.ts
- **AC-20260918-02-8**: WHEN `mock-review answer --note N1 --text 'moved it'` runs THE SYSTEM SHALL
  produce the same document the reducer produces for `{op:'reply', entry:{by:'session', text:'moved
  it'}}` — `status: 'answered'`, thread ending `{by:'session', text:'moved it'}`
  → rewrites tests/cli/answer.test.ts :: AC-20260915-01-16: answer --note
- **AC-20260918-02-9**: WHEN a client replies to a note on a screen that is currently approved THE
  SYSTEM SHALL delete that screen's entry from `approval.screens`, and WHEN the session replies to
  the same note THE SYSTEM SHALL leave `approval` unchanged by identity
  → writes tests/unit/patches.test.ts
- **AC-20260918-02-10**: WHEN a client opens a note they raised THE SYSTEM SHALL show Approve and
  Defer and no Delete or Reject, and clicking Defer SHALL persist `status: 'deferred'`
  → writes tests/browser/surfaces.test.ts
- **AC-20260918-02-11**: WHEN a note's status is `deferred` THE SYSTEM SHALL render it in the
  `deferred` pin tone (`TONE.deferred`, distinct from `TONE.approved`) while `worst()` continues to
  report it as `approved` in aggregates
  → rewrites tests/unit/selectors.test.ts :: AC-20260917-02-17
- **AC-20260918-02-12**: WHEN `mock-review answer --journey J --text t` names a journey with no
  conversation THE SYSTEM SHALL CONTINUE TO exit 2 with `mock-review: no conversation for journey J`
  → reuses tests/cli/answer.test.ts :: AC-20260915-01-17: answer on
- **AC-20260918-02-13**: WHEN a notes patch leaves approval unchanged THE SYSTEM SHALL CONTINUE TO
  leave `design/approval.json` byte-identical including a `contractVersion` of 1
  → reuses tests/server/api.test.ts :: AC-20260917-01-12

## Assumptions (escalation triggers)

- **A1** — Executed 2026-09-18, zod 4.6.5: a `discriminatedUnion('op', …)` accepts a newly added
  `.strict()` member, still refuses an unknown `op`, and refuses an `entry` carrying an extra key.
  — **if false:** the op cannot be added to the existing union; STOP and ask.
- **A2** — Executed 2026-09-18: `.omit()` preserves a `.passthrough()` catchall, so `rect`,
  `viewport` and `whole` continue to round-trip through `add` and `update`. — **if false:** those
  three become declared optional fields on `NoteSchema`, which is a contract change and belongs in
  the v3 unit, not here.
- **A3** — Executed 2026-09-18: on a passthrough object schema, `.omit({status, thread}).partial()`
  **accepts** `{status:'approved', thread:[]}` (the narrowing is a no-op), `.strict()` refuses them
  but also refuses `{rect, viewport}` with `unrecognized_keys: ["rect","viewport"]`. — **if false:**
  D3 reverts to `.strict()` and `rect`/`viewport`/`whole` must become declared fields first.
- **A4** — Executed 2026-09-18 (during the direct fix that preceded this series): a Radix modal
  `aria-hidden`s everything behind it, so a banner outside an open dialog is not reachable by role
  and must be located by attribute. The Defer confirm stacks over the note card, so
  AC-20260918-02-10's assertions use attribute locators, not roles, for anything outside the
  topmost dialog. — **if false:** role locators are fine and the test simplifies.
- **A5** — `close` accepts any source status and returns `approval` by identity
  (`src/server/patches.ts`, pinned by `tests/unit/patches.test.ts :: AC-20260917-02-14`). Verified
  by reading; relied upon by D5 and D8. — **if false:** approving a note would start rewriting
  `approval.json`, breaking AC-20260918-02-13; add a rule-6 exclusion for `close`.
- **A6** — The plugin's `--mark approved` and `--mark journey-approved` read note and conversation
  statuses only, and treat anything that is not `open` as settled. Making `deferred` page-reachable
  therefore unblocks those marks rather than confusing them. Verified by reading `mocks-driver.js`;
  **not executed**. — **if false:** the driver needs a matching edit and it moves into the v3 unit
  where the plugin is already being changed.

## Rationale

The client-reply 403 reads like a permission decision and is not one: `clientNotesOpPatch` refuses
`update` because `update` can rewrite a note's whole thread and status, which a client must not do.
The permission is right; the op is wrong. Splitting the one thing a client legitimately does into
its own op makes the gate express what was actually meant, and the refusal disappears without
loosening anything — indeed the wire gets tighter, because after D3 and D5 no browser can send a
thread at all.

That tightening is also the real fix for the concurrent-reply race. Spec 01's lock cannot help a
thread array that was already stale when it left the browser; only removing the ability to send one
can. This is why the two specs are siblings and not one: 01 must be provable on its own, with no new
op in play, and 02 depends on it for the writes it then performs.

`deferred` getting its own tone is the user's call, taken with the alternative on screen. The
smaller option — render it blue and distinguish by wording — was rejected because a reviewer
scanning a long list is exactly the reader who needs to see what is parked. The aggregate `Tone`
deliberately does **not** widen with it: a screen dot answering "is anything outstanding here" gets
no better by splitting settled into two kinds, and changing what a dot means is a frozen-surface
question the user has not been asked. `selectors.ts:20` asks for both to widen; only the half the
user ruled on is taken, and the other half is recorded here rather than assumed.

Collision closure for D9's deletion of `toneOf` and D4's retirement of `op:'journey'` ran against
the stems `toneOf` and `op: 'journey'`. Every `toneOf` hit is **fixed, not waived** — `Overlay.tsx`,
`NotesPanel.tsx`, `NoteDialogs.tsx`, `selectors.ts` and `tests/unit/selectors.test.ts` are all File
Plan rows; the compiler enumerates them once the function is gone. Both `op: 'journey'` hits
(`useNoteActions.ts`, `tests/server/api.test.ts`) are File Plan rows. The bare stem `'journey'` was
also swept and is **recorded as noise, not waived work**: it matches the journeys feature at large
(`src/cli/sweep.ts`, `src/schemas/sweep.ts`, `docs/canonical/package.md`, the committed `dist/`),
none of which this spec narrows — `dist/` is rebuilt at release, never in a build wave.

Rejected: keeping `op:'journey'` as an alias for `reply`. It would preserve a second append path
with its own attribution rule, which is the shape that produced the divergence this spec closes.

## Canonical Delta

`docs/canonical/package.md` — the notes section gains: a thread is appended only through
`op:'reply'`, which both roles and the `answer` CLI share. The author decides the resulting status —
a reply by the session answers the note, a reply by anyone else reopens it — and a reopened note
un-approves its screen. `op:'update'` carries anchor fields only and refuses `status` and `thread`
by name; `op:'journey'` is retired, its two halves being `reply` and `close`. A note is ended only
by `op:'close'`, which the page now issues for Approve and for Defer: the client may end a note they
raised, the owner may end any answered note, and a deferred note renders in its own muted-grey tone
while still counting as closed in every aggregate dot.
