---
date: 2026-09-17
status: hardened
tier: critical
area: schemas
design: false
breaking: true
depends_on: [specs/20260917/01-contract-version-2.md]
depended_on_by: [specs/20260917/03-the-panel-and-the-dots-tell-the-truth.md]
brief: n/a
spiked: 2026-09-17
open_markers: 0
---

# The story travels

## Goal

Contract v2 exists to carry the client's own sentences — one **beat** per journey step — from the seed all the way to the page the client confirms on, and to bind that confirmation to a hash of the exact sentences they read. The sibling spec moved this package's contract number to `2`; the story itself still cannot travel: `check --json` refuses a step carrying `beat`, the confirm writes no hash, and the note enum has no `deferred`. Worse, the plugin's already-shipped `client waive` writes an `approval.json` this package's schema **rejects**, so `buildState` silently swallows the whole document into `EMPTY_APPROVAL` — the page renders "nothing approved" and every later write answers 409 about a file the user never touched (A3, executed). This spec makes the four story fields first-class on the contract shapes, computes the one hash that binds a confirm, teaches the note lifecycle its fourth status, and repairs the read-back. Done means: a real `mocks-driver.js` run against the fixture host reaches `--mark approved` through a **client's own confirm on the page**, and a host whose journeys carry no beats still gets a green `check` with a warning instead of a crash.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The four story fields land on the **base** shapes in `src/schemas/check.ts`, all still `.strict()`: `StepSchema` gains `beat: z.string().optional()` and `state: z.string().optional()`, `EdgeSchema` gains `say: z.string().optional()`, `JourneySchema` gains `persona: z.string().optional()`. `src/analysis/journeys.ts`'s `JourneyInput` widens to match. Absent fields are **omitted**, never emitted as `undefined` — zod 4.6.5 omits absent optional keys from parse output (A4, executed: `Object.keys` of a bare parse is `['screen']`), and every hand-written emit site uses a conditional spread (AC-20260917-02-1, AC-20260917-02-2) | The plugin's `fields` block declares these as the accepted key sets and its driver reads them out of `check --json`; putting them on the base shapes is what makes `ServerJourneySchema`'s parallel wrapper collapse instead of doubling |
| D2 | `journeyReport` needs **one** change to echo the story: a conditional spread `...(journey.persona !== undefined ? { persona: journey.persona } : {})` on its returned literal. `steps` and `edges` already pass through **by reference**, so `beat`/`state`/`say` survive with no code change at all once the schemas accept them (A5, executed: a beats-bearing fixture emitted `beat`/`state`/`say` from `check --json` with only the schema edit) (AC-20260917-02-2) | The premise that `journeyReport` rebuilds steps field-by-field is false; only the journey-level literal drops keys, and only `persona` is named there |
| D3 | `beat` is **optional** in `StepSchema`, not required, and the gap is surfaced as a new **warn**-severity finding kind `beats` on `FindingSchema`: one per journey whose steps are not all beat-bearing, `file: 'src/journeys.ts'`, message naming the journey, the 1-based step index and the driver (`journey <id> step <n> has no beat — `--mark journey-drawn` will refuse this step`). `check.ok` is unchanged, since `ok = !findings.some(f => f.severity === 'error')` (A8) and the only mark that consults `ok` is `--mark shell-drawn`. This is **not** a deviation from the template's unmarked `"beat"`: every `?` in the plugin's `fields` block tracks its host-facing `journeys.ts` type (`persona?`/`state?`/`label?`/`say?` are optional props, `beat: string` is not), while `fields` itself declares *accepted* key sets, which a schema accepting `beat` when present satisfies verbatim (AC-20260917-02-3) | `src/analysis/check.ts:94` parses its own output, so a required `beat` turns a beat-less host step into a `check` **crash** with no JSON at all — for a real host with 21 beat-less journeys that is a total outage of `check` and `serve`, not a degraded signal. `@555-ventures/mock-review` is a standalone package; `beat` only means something to the plugin's seed comparison |
| D4 | A new leaf module `src/analysis/beats.ts` exports `beatHash(steps): string | null` — `null` when the array is empty **or** any step lacks `beat`, otherwise the first 12 hex of sha256 over the canonical lines `` `${beat} -> ${screen}` + (state ? `@${state}` : '') `` joined by `\n`. It mirrors `claude-plugins/spec/scripts/lib/surfaces.js:54-59` exactly, **including its falsy-state rule** (`state: ''` hashes identically to no state) — deliberately, so the two implementations cannot drift. It also exports `beatlessStep(journey): number | null` for D3's finding (AC-20260917-02-4) | The hash is the whole gate: `--mark journey-approved` refuses unless `approval.journeys[j].beats === beatHash(seed beats)`. Returning `null` rather than `e3b0c44298fc` (the sha256 of the empty string, A1) keeps "hashed nothing" from masquerading as a confirmable story |
| D5 | The hash is computed **once, in `buildState`, over `journeyReport`'s raw output, BEFORE the state-normalising map**, and carried on the served journey as `beats: string | null`. It must never be computed from the page-facing steps: `buildState` rewrites each step's `state` to the host's example key via `resolveState`, and the plugin hashes the seed's raw spelling. The falsifier is reproducible **on this repo's own fixture** — `home.tsx` declares `states: ['default','empty']` with example key `Default`, and the same steps hash `7c0be20327a0` raw against `49ef1e488591` normalised (A2, executed). Raw ≡ seed on this path because `--mark journey-drawn` already enforces `check --json` steps == seed beats; say so wherever the hash is read so nobody "fixes" it to the normalised steps later (AC-20260917-02-5, AC-20260917-02-6) | A host whose `journeys.ts` state spelling differs from its example key would otherwise write a hash that can never equal the driver's, making the journey permanently unapprovable with a "stale story" refusal no remedy resolves |
| D6 | `ServerJourneySchema` collapses to `JourneySchema.extend({ beats: z.string().nullable() })` — its `persona`/step-`state`/edge-`say` extensions move to the base shapes (D1). `ServerJourneyInput` and `buildState`'s **positional re-graft** (`journeyInputs[i]`, `input?.edges[ei]`) are deleted; only the state-normalising `map` survives. The UI's `ServerJourney` import is unchanged (AC-20260917-02-6) | The wrapper existed solely because the base shapes lacked those fields; an index-coupled dead path that pairs `resolved[i]` with `journeyInputs[i]` is the kind that "works" until a filter appears upstream |
| D7 | The client confirm is **If-Match on the story hash**. `ApprovalPatchSchema`'s `clientOk` becomes `{op:'clientOk', id: string, beats: string}` with `beats` **required**. `handlePostApproval` guards in this order, inside the existing write lock where `buildState`'s result is already in hand: (1) `id` not among `state.journeys` → 400 `{error:'unknown journey <id>'}`; (2) `state.journeys[j].beats === null` → 400 `{error:'journey <id> has no beats — every step needs a sentence before a client can confirm it'}`; (3) `patch.beats !== state.journeys[j].beats` → 409 `{error:'story changed since it was shown — reload'}`, file byte-identical; otherwise the reducer writes. `ApprovalPatchCtx` gains `beatsHash: (journeyId: string) => string | null`, supplied by `ctxFromState` from `state.journeys`; **verification stays in the endpoint, derivation in the ctx**, mirroring `approveScreen`/`ctx.hash` (AC-20260917-02-7, AC-20260917-02-8, AC-20260917-02-9, AC-20260917-02-10) | `crypto.subtle` is unavailable on the plain-http LAN URL `client open` prints for a non-localhost host, so the page cannot hash; and SSE refresh is asynchronous, so a seed edit between the client's read and their click would otherwise bind a confirm to a story they never saw. Required (not optional) `beats` means a stale page bundle 400s instead of writing `client:'ok'` with no hash — which the driver would then refuse forever as "beats undefined" |
| D8 | `clientOk`'s reducer writes `{...existing, client: 'ok', beats: ctx.beatsHash(patch.id), at: new Date().toISOString()}` and **stops defaulting** `{approvedAt: null, client: null}`. `JourneyApprovalSchema` is re-derived as `{client: z.enum(['ok','waived']).nullable(), beats: z.string().optional(), at: z.string().optional(), reason: z.string().optional(), approvedAt: z.string().nullable().optional()}.passthrough()`. `ApprovalSchema` **keeps** `theme` (AC-20260917-02-11, AC-20260917-02-12) | `approvedAt` being required-but-nullable (nullable ≠ optional) is what rejects the document the plugin's shipped `client waive` writes, and a rejected document is swallowed into `EMPTY_APPROVAL` with no error anywhere (A3, executed). Contract v2 dropped `theme` from its *required* list, not from existence — the page reads `approval.theme` in three live places |
| D9 | The `approveJourney` approval op is **removed**: from `ApprovalPatchSchema`, from `applyApprovalPatch`, and from `useNoteActions.approveJourney` (which keeps its `patchNotes({op:'journey', status:'approved'})` half and drops the `patchApproval` call). Nothing renders `approvedAt`; the driver is forbidden from reading it (`mocks-driver.js:40,71`) (AC-20260917-02-13) | It is the second writer of the exact hazard D8 repairs: its fallback literal creates `{approvedAt, client: null}` — an entry carrying neither `client` nor `beats`, outside `fields["approval.journeys{}"]` and missing from `shapes.approval["journeys{}"]`. Today's conformance test passes only because its journeys map is empty; this spec's own confirm tests put real entries there. All three touch points are already rows in this File Plan, so deleting it adds no row |
| D10 | `'deferred'` is added to **all three** status enum sites: `NoteSchema.status`, `JourneyConversationSchema.status`, and the `op:'journey'` patch's own `status` (`src/schemas/patches.ts:48`). A new **narrow** op `close: {id, status: 'approved'|'deferred'}` joins `NotesPatchSchema` — never a widened `update`, which merges arbitrary fields. Its reducer sets the status, is a no-op on an unknown id, and returns the **input `approval` object by identity** so `plugin.ts`'s `result.approval !== approval` write-suppression holds; it never touches `approval.screens`, because rule 6 fires only on a note turning `open`, which `close` cannot produce. `close` is allowed from any current status (AC-20260917-02-14, AC-20260917-02-15) | `--mark approved` refuses on an `answered` note and writes one ledger exclusion row per `deferred` one, so the client must be able to end their own points; `update` would hand a client the ability to rewrite a note's anchor, screen and thread |
| D11 | `close` joins the unknown-id **404 pre-check** at `plugin.ts` (today `update`/`remove` only); then, for `role === 'client'`, `clientNotesPatch` admits `close` only when the target note's `thread[0].by === 'client'`, else 403. **404 before 403**, so a miss never leaks existence the other way round. A client may also `close` a journey conversation, whose status lands in `notes.journeys[id].status` — the key `--mark approved`'s `deferredExclusionTargets` reads for journeys as well as notes (AC-20260917-02-15, AC-20260917-02-16) | The client ends their **own** notes; a session-raised note is not theirs to close. The journey-conversation leg is the exclusion-row path nothing in this repo demonstrates today |
| D12 | The tone unions are **not** widened. `src/ui/store/selectors.ts` gains one pure `toneOf(status: Note['status']): Tone` mapping `deferred → 'approved'` (a crash guard, not a rendering decision — nothing on the page can produce a `deferred` status in this spec), and every site that feeds a raw status into a `Tone`/`PinTone` position routes through it: `journeyTone`, `Overlay.tsx:49,58`, `NoteDialogs.tsx:137,164`, `NotesPanel.tsx:99`, `ScreenPage.tsx:360`. `worst()` gains an **explicit** "deferred is closed" line rather than relying on its `if/if/return null` fall-through order. `TONE`, `PinTone` and `Tone` are untouched, so `docs/design/design-reference.md` §4's tone table and §13's three-tone rule stay exactly true and the page renders byte-identically (AC-20260917-02-17) | User ruling 2026-09-17: the muted-grey `deferred` tone, its badge and the design-reference amendment belong to the client-page spec. Widening `PinTone` would put a fifth row in code under a §4 table that lists four. The compiler enumerates every site through `toneOf`, so the client-page spec deletes one function and finds its own work listed |
| D13 | Both e2e tests stop writing the retired ```` ```surfaces ```` seed and write the beat grammar (`N. "sentence" -> screen[@state]`); both fixture hosts (`tests/fixtures/host`, `tests/fixtures/host-broken`) adopt the template's beat-bearing `Step`/`Edge`/`Journey` types and carry beats matching those seeds; `tests/fixtures/contract.json` is re-synced **byte-equal** to the plugin's template, `fields` block included and its unmarked `"beat"` left as-is. `tests/e2e/approved.test.ts` is re-ordered for v2: it stops polling `approvedAt`, drops the owner journey-approve, and reaches `--mark journey-approved` through the **client's own POST confirm** (AC-20260917-02-18, AC-20260917-02-19) | The shipped driver refuses the old seed at `--mark seed-done`, and teaching the schemas the fields un-skips both e2e tests (A9, executed) — so the fixtures are not optional polish, they are what makes the suite green. A real POST confirm is the only test that proves this package's hash equals the driver's on one host |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/schemas/check.ts | MODIFY | schemas | D1: `beat?`/`state?` on `StepSchema`, `say?` on `EdgeSchema`, `persona?` on `JourneySchema`, all still `.strict()`; D3: warn kind `beats` on `FindingSchema` |
| src/schemas/notes.ts | MODIFY | schemas | D10: `'deferred'` on both status enums |
| src/schemas/patches.ts | MODIFY | schemas | D6: `ServerJourneySchema` collapses to `JourneySchema.extend({beats})`; D7: `clientOk` gains required `beats`; D9: `approveJourney` op removed; D10: `close` op added, `op:'journey'` status enum gains `'deferred'` |
| src/schemas/approval.ts | MODIFY | schemas | D8: `JourneyApprovalSchema` re-derived (`approvedAt` optional, `beats`/`at`/`reason` declared); `theme` kept on the strict document |
| src/analysis/beats.ts | CREATE | analysis | D4: `beatHash(steps)` and `beatlessStep(journey)` |
| src/analysis/journeys.ts | MODIFY | analysis | D1/D2: widen `JourneyInput` with explicit-undefined optionals (A6), one conditional spread for `persona` |
| src/analysis/check.ts | MODIFY | analysis | D3: emit one warn `beats` finding per beat-less journey |
| src/server/state.ts | MODIFY | server | D5: compute `beats` from the raw `journeyReport` output before normalising; D6: delete `ServerJourneyInput` and the positional re-graft, keep the state-normalising map; A6: the `rawSteps` annotation gains an explicit undefined |
| src/server/patches.ts | MODIFY | server | D8: `clientOk` writes `{client,beats,at}` and stops defaulting `approvedAt`; D9: `approveJourney` case removed; D10: `close` reducer returning `approval` by identity; `ApprovalPatchCtx` gains `beatsHash` |
| src/server/plugin.ts | MODIFY | server | D7: the three confirm guards (400/400/409); D11: `close` in the 404 pre-check and in `clientNotesPatch` with the `thread[0].by` gate; `ctxFromState` supplies `beatsHash` |
| src/cli/answer.ts | MODIFY | cli | D10: `ThreadTarget`'s hand-rolled status union gains `'deferred'` (one line; it is assigned from `Note`) |
| src/ui/store/selectors.ts | MODIFY | ui | D12: `toneOf`, `journeyTone` routed through it, explicit deferred-is-closed line in `worst()` |
| src/ui/notes/useNoteActions.ts | MODIFY | ui | D7: `clientOk` sends the hash it was served; D9: `approveJourney` drops its `patchApproval` half; the stale comment naming `approvedAt` as the driver's key is re-derived |
| src/ui/notes/Overlay.tsx | MODIFY | ui | D12: `TONE[toneOf(note.status)]` and `NotePin tone={toneOf(note.status)}` |
| src/ui/notes/NoteDialogs.tsx | MODIFY | ui | D12: `toneOf` at the `NotePin` and `NoteActions` status props |
| src/ui/notes/NotesPanel.tsx | MODIFY | ui | D12: `toneOf` at the `NoteRow` tone prop |
| src/ui/screen/ScreenPage.tsx | MODIFY | ui | D12: `toneOf` at `JourneyPanel`'s tone prop |
| tests/fixtures/contract.json | MODIFY | tests | D13: re-synced byte-equal to the plugin template, `fields` block included |
| tests/fixtures/host/src/journeys.ts | MODIFY | tests | D13: template beat-bearing types, `first-visit` carries beats/persona/say |
| tests/fixtures/host-broken/src/journeys.ts | MODIFY | tests | D13: same shape, so the broken host differs only in what it is meant to break |
| tests/unit/beats.test.ts | CREATE | tests | AC-20260917-02-4, AC-20260917-02-5 |
| tests/unit/contract-skew.test.ts | MODIFY | tests | AC-20260917-02-19 — the `beat`-refused case inverts; the all-fields case grows the real field set |
| tests/unit/patches.test.ts | MODIFY | tests | AC-20260917-02-8, AC-20260917-02-13, AC-20260917-02-14 |
| tests/unit/selectors.test.ts | MODIFY | tests | AC-20260917-02-17 — the rewritten test title MUST keep its `journeyTone` prefix: sibling `03-the-panel-and-the-dots-tell-the-truth.md` (hardened, `depends_on` this spec) resolves three of its own dispositions against `tests/unit/selectors.test.ts :: journeyTone` |
| tests/server/api.test.ts | MODIFY | tests | AC-20260917-02-7, AC-20260917-02-9, AC-20260917-02-10, AC-20260917-02-12, AC-20260917-02-15, AC-20260917-02-16 |
| tests/cli/check.test.ts | MODIFY | tests | AC-20260917-02-1, AC-20260917-02-2, AC-20260917-02-3 |
| tests/browser/surfaces.test.ts | MODIFY | tests | AC-20260917-02-20 — the confirm pin; its literal source-text `.replace()` on the fixture is re-anchored |
| tests/e2e/driver.test.ts | MODIFY | tests | D13 seed rewrite; the stale template-reports-1 comment re-derived (q16) |
| tests/e2e/approved.test.ts | MODIFY | tests | AC-20260917-02-18 — v2 ordering, confirm-driven |
| docs/canonical/package.md | MODIFY | other | q15: release step 3 becomes `git tag -f v2` |
| README.md | MODIFY | other | q15: the same tag line |
| docs/research/plugin-requirements.md | MODIFY | other | Its journeys / note-status / `approval.json` blocks are v1-era; re-derived to v2 |
| docs/research/spikes.md | MODIFY | other | The five executed spikes behind A1–A5 |

Orchestrator duty, outside the table: none of the above rows may edit another row's file.

## Contracts

**`src/schemas/check.ts` (D1, D3)**

```ts
export const StepSchema = z.object({
  screen: z.string(),
  beat: z.string().optional(),
  state: z.string().optional(),
}).strict()

export const EdgeSchema = z.object({
  from: z.number(), to: z.number(),
  label: z.string().optional(),
  say: z.string().optional(),
}).strict()

export const JourneySchema = z.object({
  id: z.string(), title: z.string(),
  persona: z.string().optional(),
  steps: z.array(StepSchema), edges: z.array(EdgeSchema),
  resolved: z.boolean(), unresolved: z.array(UnresolvedEdgeSchema),
}).strict()

// FindingSchema's warn arm: kind: z.enum(['size', 'twin', 'states', 'beats'])
```

**`src/analysis/beats.ts` (D4)** — mirrors `claude-plugins/spec/scripts/lib/surfaces.js:54-59`:

```ts
import { createHash } from 'node:crypto'

/** The one hash of a journey's story. `null` when there is nothing confirmable: no steps at all,
 * or any step without a beat. The `state ? … : ''` falsy test is the plugin's, copied deliberately
 * — an empty-string state hashes as an absent one on BOTH sides, and "fixing" it here would make
 * the two implementations disagree. The steps handed in are the RAW ones `check --json` echoes,
 * never `buildState`'s normalised ones (D5). */
export function beatHash(steps: readonly { screen: string; beat?: string | undefined; state?: string | undefined }[]): string | null {
  if (steps.length === 0) return null
  if (steps.some((s) => s.beat === undefined)) return null
  const canonical = steps.map((s) => `${s.beat} -> ${s.screen}` + (s.state ? `@${s.state}` : '')).join('\n')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

/** D3: the 1-based index of the first step with no beat, or `null` when every step has one. */
export function beatlessStep(journey: { steps: readonly { beat?: string | undefined }[] }): number | null
```

**`src/schemas/patches.ts` (D6, D7, D9, D10)** — changed members only:

```ts
// NotesPatchSchema gains, and the `journey` member's status enum grows 'deferred':
z.object({ op: z.literal('close'), id: z.string(), status: z.enum(['approved', 'deferred']) }).strict()

// ApprovalPatchSchema: `approveJourney` REMOVED; `clientOk` becomes:
z.object({ op: z.literal('clientOk'), id: z.string(), beats: z.string() }).strict()

// The server-only wrapper, now carrying only what GET state adds:
export const ServerJourneySchema = JourneySchema.extend({ beats: z.string().nullable() })
```

**`src/schemas/approval.ts` (D8)**

```ts
/** `.passthrough()` and every key but `client` optional: the plugin's `client waive` writes
 * `{client:'waived', reason, at, beats}` with NO `approvedAt`, and contract v2's
 * `fields["approval.journeys{}"]` is `["client","beats","at?","reason?"]`. A required-but-nullable
 * `approvedAt` rejected that document, and a rejected document is swallowed into EMPTY_APPROVAL
 * with no error surfaced anywhere (A3). */
export const JourneyApprovalSchema = z.object({
  client: z.enum(['ok', 'waived']).nullable(),
  beats: z.string().optional(),
  at: z.string().optional(),
  reason: z.string().optional(),
  approvedAt: z.string().nullable().optional(),
}).passthrough()
```

**`src/ui/store/selectors.ts` (D12)**

```ts
/** D12: `deferred` is a CLOSED status that this spec renders exactly as `approved`. It is a crash
 * guard, not a rendering decision — nothing on the page can produce it here (only the `close` op,
 * whose page caller is the client-page spec). THAT spec owns the real muted-grey tone and the
 * `Deferred` badge, widens `Tone`/`PinTone`/`TONE`, amends design-reference §4 and §13, and
 * DELETES this function; the compiler lists its call sites. */
export function toneOf(status: Note['status']): Tone {
  return status === 'deferred' ? 'approved' : status
}
```

**`POST /__mock-review/approval`, `op: 'clientOk'` (D7)** — wire and refusals:

```
→ {"op":"clientOk","id":"first-visit","beats":"7c0be20327a0"}
← 200  the stamped approval document; journeys["first-visit"] = {"client":"ok","beats":"7c0be20327a0","at":"<iso>"}
← 400  {"error":"unknown journey <id>"}
← 400  {"error":"journey <id> has no beats — every step needs a sentence before a client can confirm it"}
← 400  {"error":"invalid approval patch"}          // `beats` absent from the body
← 409  {"error":"story changed since it was shown — reload"}   // approval.json byte-identical
```

**`design/approval.json` after a confirm** — no `approvedAt` key is written:

```json
{ "contractVersion": 2, "screens": {}, "theme": null,
  "journeys": { "first-visit": { "client": "ok", "beats": "7c0be20327a0", "at": "2026-09-17T…Z" } } }
```

## Data Model

`design/approval.json` and `design/notes.json` are affected, and both migrate on read, never by a
separate step. **Existing rows are preserved**: a `journeys{}` entry written under v1
(`{approvedAt, client}`) still parses under D8's schema and keeps both keys through a round trip
(A4, executed — `{approvedAt: null, client: null}` parses identically before and after). A
`notes[].status` of `open`/`answered`/`approved` is untouched; `deferred` is additive. Nothing
rewrites `approvedAt` that this spec does not already rewrite, and no writer emits it any more.

## Behavior

**The confirm round trip.** `GET state` serves each journey with `beats` — the hash of the story as
`check --json` reports it. The page renders the beats and, on confirm, echoes that same hash back.
The server compares it against the hash it would compute now: equal means the client is confirming
what they read, and the entry is written; different means the seed moved under them, and they are
told to reload. This is If-Match, with the served response as the entity tag.

**Why the page cannot hash.** `client open` prints a LAN URL over plain http for any non-localhost
host, where `crypto.subtle` is unavailable; and a second hash implementation on the page would be a
third copy of a format two repos already share.

**Beat-less hosts.** A host that has not yet written beats gets a green `check` with one warn
finding per journey, a served `beats: null`, and a 400 if anything tries to confirm it. It never
crashes, and the driver's own `--mark journey-drawn` carries the real remedy.

**Closing a point.** A client may end a note or journey conversation they themselves opened, as
`approved` or `deferred`. `deferred` is closed, not pending: it leaves screen approval alone, drops
out of the sweep queue exactly as `answered`/`approved` do, and is what `--mark approved` turns into
a ledger exclusion row. An unknown id answers 404 before any ownership check.

## Acceptance Criteria

- **AC-20260917-02-1**: WHEN `check --json` runs on the fixture host whose `first-visit` step 0 is `{screen:'home', beat:'I open the app'}` and step 1 is `{screen:'account', beat:'I land on my account', state:'default'}` with edge `{from:0,to:1,label:'Account',say:'I tap Account'}` THE SYSTEM SHALL echo every one of those keys verbatim in `journeys[0]`, and for a step written as `{screen:'home'}` alone SHALL emit exactly `{"screen":"home"}` — `'beat' in step` is `false`, never `"beat":undefined` → rewrites tests/cli/check.test.ts :: AC-20260915-01-12: an
- **AC-20260917-02-2**: WHEN the fixture host's journey declares `persona: 'a new customer'` THE SYSTEM SHALL report it as `journeys[0].persona`, and WHEN the journey declares no `persona` SHALL omit the key entirely (`'persona' in journeys[0]` is `false`) → writes tests/cli/check.test.ts
- **AC-20260917-02-3**: WHEN a host journey's step 2 carries no `beat` THE SYSTEM SHALL exit 0, print parseable JSON, report `ok: true`, and include exactly one finding `{kind:'beats', severity:'warn', file:'src/journeys.ts'}` whose message names `first-visit` and step `2`; WHEN every step carries a beat SHALL emit no `beats` finding → writes tests/cli/check.test.ts
- **AC-20260917-02-4**: WHEN `beatHash([{beat:'I open the app',screen:'home'},{beat:'I tap Sign in',screen:'login',state:'empty'}])` is called THE SYSTEM SHALL return exactly `'7c0be20327a0'`; WHEN given `[]` SHALL return `null` (never `'e3b0c44298fc'`, the sha256 of the empty string); WHEN any step lacks `beat` SHALL return `null`; WHEN given `[{beat:'a',screen:'b',state:''}]` SHALL return the same value as `[{beat:'a',screen:'b'}]` (`'849092e16a6b'`) → writes tests/unit/beats.test.ts
- **AC-20260917-02-5**: WHEN a journey's step is `{screen:'home', beat:'I open the app', state:'default'}` on a host whose `home` screen exposes example key `Default` THE SYSTEM SHALL serve `journeys[0].steps[0].state === 'Default'` (normalised, unchanged behaviour) while `journeys[0].beats` equals `beatHash` over the **raw** `default` spelling — the two differ (`7c0be20327a0` vs `49ef1e488591` for the Contracts pair), and the served `beats` SHALL be the raw one → writes tests/unit/beats.test.ts
- **AC-20260917-02-6**: WHEN `GET /__mock-review/state` runs on the fixture host THE SYSTEM SHALL include `journeys[0].beats` as a 12-character hex string, `journeys[0].persona`, `journeys[0].steps[*].beat` and `journeys[0].edges[*].say`; and on a host whose journey has a beat-less step SHALL serve `journeys[0].beats === null` → writes tests/server/api.test.ts
- **AC-20260917-02-7**: WHEN a client-role request posts `{op:'clientOk', id:'first-visit', beats:'<the hash GET state served>'}` THE SYSTEM SHALL answer 200 and leave `design/approval.json` carrying `journeys['first-visit']` equal to `{client:'ok', beats:'<that hash>', at:'<iso>'}` with **no** `approvedAt` key → writes tests/server/api.test.ts
- **AC-20260917-02-8**: WHEN `applyApprovalPatch` is given `{op:'clientOk', id:'first-visit', beats:'7c0be20327a0'}` over an approval whose `journeys` is `{}` THE SYSTEM SHALL return an entry with exactly the keys `client`, `beats`, `at` (no `approvedAt`), and over an existing `{approvedAt:'2026-01-01T00:00:00.000Z', client:null}` SHALL preserve `approvedAt` untouched while setting the three → rewrites tests/unit/patches.test.ts :: approveJourney
- **AC-20260917-02-9**: WHEN a client posts `clientOk` with `beats:'deadbeef0000'` against a journey serving `7c0be20327a0` THE SYSTEM SHALL answer 409 with body `{"error":"story changed since it was shown — reload"}` and leave `design/approval.json` byte-identical → writes tests/server/api.test.ts
- **AC-20260917-02-10**: WHEN a client posts `clientOk` for an id no journey carries THE SYSTEM SHALL answer 400 `{"error":"unknown journey ghost"}`; WHEN the named journey serves `beats: null` SHALL answer 400 `{"error":"journey first-visit has no beats — every step needs a sentence before a client can confirm it"}`; WHEN the body omits `beats` entirely SHALL answer 400 `{"error":"invalid approval patch"}`; in all three cases `design/approval.json` SHALL be byte-identical → writes tests/server/api.test.ts
- **AC-20260917-02-11**: WHEN `design/approval.json` carries `journeys['first-visit'] = {client:'waived', reason:'no client', at:'<iso>', beats:'7c0be20327a0'}` — the document the plugin's `client waive` writes, with no `approvedAt` — THE SYSTEM SHALL parse it, serve that entry intact from `GET state` (never an empty `journeys` map), and answer 200 to a subsequent theme patch that leaves the waived entry unchanged → writes tests/server/api.test.ts
- **AC-20260917-02-12**: WHEN `ApprovalSchema` parses a document carrying `theme: 'nova'` THE SYSTEM SHALL accept it and `GET state` SHALL continue to serve `approval.theme` → reuses tests/server/api.test.ts :: AC-20260915-02-8:
- **AC-20260917-02-13**: WHEN any role posts `{op:'approveJourney', id:'first-visit'}` to `/__mock-review/approval` THE SYSTEM SHALL answer 400 `{"error":"invalid approval patch"}` and leave `design/approval.json` byte-identical → writes tests/unit/patches.test.ts
- **AC-20260917-02-14**: WHEN `applyNotesPatch` is given `{op:'close', id:'N1', status:'deferred'}` over a note whose screen `home` is approved THE SYSTEM SHALL set `notes[0].status` to `'deferred'` and return the **same** `approval` object reference it was given (`result.approval === approval`), leaving `approval.screens.home` present; WHEN given an unknown id SHALL return the notes document unchanged → writes tests/unit/patches.test.ts
- **AC-20260917-02-15**: WHEN a client-role request posts `{op:'close', id:'N1', status:'deferred'}` for a note whose `thread[0].by` is `'client'` THE SYSTEM SHALL answer 200 and persist `status:'deferred'`; WHEN `thread[0].by` is `'session'` SHALL answer 403 with `design/notes.json` byte-identical; WHEN the id exists nowhere SHALL answer 404 (before any ownership check) with the file byte-identical; WHEN an owner-role request closes any note SHALL answer 200 → rewrites tests/server/api.test.ts :: AC-20260915-02-10
- **AC-20260917-02-16**: WHEN a client posts `{op:'journey', id:'first-visit', status:'deferred'}` with no `entry` THE SYSTEM SHALL answer 403 (a client may not set a journey status directly), and WHEN an owner posts `{op:'close', id:'first-visit', status:'deferred'}` THE SYSTEM SHALL leave `notes.journeys['first-visit'].status === 'deferred'` — the key `--mark approved` reads for its journey exclusion rows → writes tests/server/api.test.ts
- **AC-20260917-02-17**: WHEN `toneOf('deferred')` is called THE SYSTEM SHALL return `'approved'`, and `toneOf` SHALL be the identity on the other three; WHEN `worst([{status:'deferred'}, {status:'approved'}])` is called SHALL return `null` (deferred is closed, nothing pending); WHEN `journeyTone('j', {j:{status:'deferred', thread:[]}})` is called SHALL return `'approved'` → rewrites tests/unit/selectors.test.ts :: journeyTone
- **AC-20260917-02-18** `[env: SPEC_PLUGIN_ROOT]`: WHEN the real `mocks-driver.js` runs against the fixture host seeded with the beat grammar THE SYSTEM SHALL record `seed-done`, `shell-drawn` and `journey-drawn` at exit 0, and — after the **client** confirms on the served page at `?client=replace-me` (no owner journey-approve, no `approvedAt` poll anywhere) — SHALL record `journey-approved` and then `approved` at exit 0, with `status.json`'s `journeys['first-visit'].beats` equal to the `beats` in `design/approval.json` → rewrites tests/e2e/approved.test.ts :: AC-20260915-03-11
- **AC-20260917-02-19**: WHEN `contractSkew(<the plugin's live template>, CONTRACT_VERSION)` is called THE SYSTEM SHALL return `null`; WHEN a template declares a journey field this package still refuses (`{'check.journeys[]': ['nonesuch']}`) SHALL return `plugin template declares journey field nonesuch this package's contract does not accept — build mock-review specs/20260917/02-the-story-travels first`; and `tests/fixtures/contract.json` SHALL be byte-equal to the plugin's `spec/templates/mock/contract.json` → rewrites tests/unit/contract-skew.test.ts :: AC-20260917-01-9 (D10): returns the
- **AC-20260917-02-20**: WHEN the client role opens `?client=replace-me` and clicks Confirm journey then Confirm THE SYSTEM SHALL CONTINUE TO leave `approval.journeys['first-visit'].client === 'ok'`, and SHALL CONTINUE TO hide the Components link and the Search / Delete / Reject / Approve controls → rewrites tests/browser/surfaces.test.ts :: AC-20260915-02-16:
- **AC-20260917-02-21**: WHEN a journey step declares no `state` THE SYSTEM SHALL CONTINUE TO resolve, serve and hash it as a stateless step, so that `check --json`'s step equals the seed beat whose `state` is `null` → writes tests/unit/beats.test.ts

## Assumptions (escalation triggers)

- A1: `beatHash`'s canonical form is sha256 over `` `${beat} -> ${screen}` + (state ? `@${state}` : '') `` joined by `\n`, first 12 hex. Executed 2026-09-17 (node:crypto, scratch, deleted): the Contracts pair → `7c0be20327a0` (matches the plugin's own pinned literal); `[]` → `e3b0c44298fc` (the sha256 of the empty string); one stateless step → `b87021072adb`; `state: ''` → `849092e16a6b`, identical to no state. — **if false:** STOP; the hash is the gate and both repos must agree byte for byte.
- A2: `buildState`'s normalisation is lossy for the hash. Executed 2026-09-17 against `src/ui/frame/stateKey.ts`: `resolveState(['Default','Empty','NoPhone'], 'empty')` → `'Empty'`, `'no-phone'` → `'NoPhone'`, `'missing'` → `undefined`. The same steps hash `7c0be20327a0` raw and `49ef1e488591` normalised. The repo's own `tests/fixtures/host/src/screens/home.tsx` declares `states: ['default','empty']` with example key `Default`, so the divergence is reachable on the fixture. — **if false (normalisation were identity):** D5 is still correct and costs nothing.
- A3: today `ApprovalSchema.safeParse` REJECTS the document the plugin's shipped `client waive` writes — `invalid_type` at `journeys.first-visit.approvedAt` ("expected string, received undefined") — and `src/server/state.ts:150-156` catches that into `EMPTY_APPROVAL`. Executed 2026-09-17. This is a live defect, not a hypothetical. — **if false:** D8 is still required by contract v2's key set; only the urgency changes.
- A4: zod 4.6.5 OMITS absent optional keys from parse output — `Object.keys(Proposed.parse({client:'ok'}))` is `['client']`, and `'beat' in parsedStep` is `false` for a bare step. The proposed `JourneyApprovalSchema` accepts the waive entry, `{approvedAt:null, client:null}`, `{approvedAt:'iso', client:'ok'}` and `{client:'ok',beats,at}`, and a document already carrying `approvedAt: null` parses identically before and after. Executed 2026-09-17. — **if false:** emit sites would need explicit key deletion before writing; D1's "omitted when absent" would need its own helper.
- A5: `journeyReport` passes `steps`/`edges` through by reference, so `beat`/`state`/`say` already survive `check --json` once the schemas accept them; only journey-level `persona` is dropped by the returned literal. Executed in the spike worktree: a beats-bearing fixture emitted `beat`/`state`/`say` with only the schema edit. — **if false:** D2 grows two more conditional spreads; no decision changes.
- A6: `exactOptionalPropertyTypes: true` (`tsconfig.json:15`). `z.string().optional()` infers `?: T | undefined`, which is **not** assignable to a hand-written `?: T`; the schema change alone breaks `src/server/state.ts:111`. Every hand-written optional in this spec is spelled `?: T | undefined` and every emit site uses a conditional spread. Executed (spike worktree, `tsc --noEmit`). — **if false:** the rule is harmless either way.
- A7: `check.ok = !findings.some(f => f.severity === 'error')` (`src/analysis/check.ts:84`), and `mocks-driver.js:421` filters findings by **severity only**, never by kind. So a new warn kind `beats` cannot block any mark. Verified by reading both. — **if false:** STOP; D3 would be gating a host on a warning.
- A8: teaching the schemas the fields UN-SKIPS both driver e2e tests (they skip on `contractSkew`, which then returns `null`), after which they fail `--mark seed-done` with `journey "first-visit" has malformed beat line(s), first: ```surfaces`. Executed (spike worktree, full gate): the additive change alone turns exactly three files red — `tests/unit/contract-skew.test.ts:47` plus those two. — **if false:** D13's seed rewrite is still required by the shipped driver.
- A9: adding `'deferred'` to the two notes enums produces 9 TypeScript errors across 6 files and **zero** failing test assertions; the blocking declarations are three hand-written unions (`src/cli/answer.ts:20`, `src/ui/store/selectors.ts:7`, `src/ui/notes/notes-ui.tsx:21`) plus `TONE: Record<PinTone, …>`. D12's `toneOf` resolves all of them without touching `notes-ui.tsx`. Executed (spike worktree, `tsc --noEmit`). — **if false:** the `toneOf` call sites are whatever the compiler names; the decision is unchanged.
- A10: the plugin's `spec/templates/mock/contract.json` will not move again before this spec lands (its `20260917/01` is done and merged; `contractVersion` is 2 and the `fields` block is final). — **if false:** re-sync `tests/fixtures/contract.json` and re-run the `contractSkew` probe; the schemas are a superset either way.

## Rationale

The whole spec follows from one fact the sibling repo already shipped: a journey is the client's
sentences, and a confirmation is only meaningful if it binds to the exact sentences the client read.
That forces a hash, and the hash forces everything else — the fields must reach `check --json`
because the driver may not read `src/journeys.ts`; the hash must be computed where the raw spelling
still exists, because the page deliberately rewrites state names; and the confirm must carry a
witness, because the page refreshes asynchronously and a seed edit between reading and clicking
would otherwise bind a client to a story they never saw.

Two premises I started with were wrong and are worth recording so they are not re-adopted. First,
that the witness should be the beats themselves: on disk `beats` is a 12-hex string the driver
compares with `===`, and the page only holds the normalised state spelling anyway, so a tuple
witness would have smuggled the normalisation bug onto the wire. Second, that the confirm path had
no page caller until the client-page spec: `JourneyPanel` already renders "Confirm journey" for the
client role, so requiring `beats` without rewiring `useNoteActions.clientOk` would have made the
existing button 400 silently.

`beat` optional was contested. The plugin's template declares it unmarked, and I proposed a
one-character change in that repo to match. That was rejected on inspection: every `?` in the
plugin's `fields` block tracks its host-facing `journeys.ts` type, `fields` declares *accepted* key
sets, and this package's own probe strips the `?` before testing — so the edit would buy nothing
mechanically and make the plugin's template disagree with its own type and seed grammar. The real
argument is local: `check` parses its own output, so a required `beat` is a crash for a beat-less
host, and a warn finding says the same thing without taking the host down.

A two-sibling split was considered and rejected on evidence, not taste. The obvious seam (fields,
then confirm) leaves `tests/e2e/approved.test.ts` red in the middle: teaching the schemas the fields
un-skips it, and its body still approves the journey as the owner and polls `approvedAt` before the
client confirms — which the v2 driver refuses. The only genuinely green seam re-touches four files
and nets more rows. Seventeen source rows is past the ~12 guidance; two of them are single-line
(`cli/answer.ts` widens a union, `plugin.ts` routes an op) and six are the mechanical `toneOf`
call sites the compiler enumerates. Held as one landing unit.

Fable's `TONE`-widening alternative (a fifth row reusing the approved colours) was put to the user
with its tradeoff and rejected in favour of `toneOf`: the binding design reference lists the tone
table row by row, and keeping it exactly true for one more spec is worth four mechanical edits that
the client-page spec deletes.

Collision closure for D9's retirement of `approveJourney` and D6's of `ServerJourneyInput`
(`--literal approveJourney --literal ServerJourneyInput`) returned eleven literals-leg hits. Eight
are File Plan rows. The three survivors — `dist/schemas/patches.d.ts`, `dist/schemas/patches.js`,
`dist/server/patches.js` — are **waived**: `dist/` is a committed release artifact that the host's
pipeline rules forbid touching in a build batch (§ Build, "`dist/` is committed at release only,
never in a build batch"), and it is rebuilt wholesale by the release that follows this spec, which
is also when the `v2` tag moves (spec 01 A6). The paths leg's three `mentions`
(`tests/package/version.test.ts`, `tests/unit/stateKey.test.ts`, `tests/unit/labels.test.ts`) are
visibility only and owe no waive.

Fragile: the hash's canonical form is duplicated across two repos by design, and only
AC-20260917-02-4's literal keeps them honest. Watch `src/server/state.ts` during the build — it is
where the raw and normalised step arrays coexist, and it is the one place a plausible "cleanup"
would silently re-point the hash at the wrong one.

## Canonical Delta

`docs/canonical/package.md` — release procedure step 3 becomes **`git tag -f v2`** (the package is
`2.0.0` and the install line already reads `#v2`; following the old step would retag the previous
major onto a v2 package). The same line in `README.md` moves with it.

`docs/canonical/package.md` — the contract surface paragraph gains: **a journey step carries the
client's sentence.** `check --json` accepts and echoes `step.beat`, `step.state`, `edge.say` and
`journey.persona`, all optional and omitted when absent; a step with no beat is a warn finding, never
a refusal. `GET state` adds one server-only field, `journey.beats` — the 12-hex sha256 of the
journey's story, computed over the steps `check --json` reports and never over the page-normalised
ones. The client's confirm is If-Match on that hash: `{op:'clientOk', id, beats}` writes
`approval.journeys[id] = {client:'ok', beats, at}` and answers 409 when the story moved. `approvedAt`
is no longer written by anything; `approveJourney` is gone. A note or journey conversation has four
statuses — `open`, `answered`, `approved`, `deferred` — and the narrow `close` op is how a client
ends a point they themselves raised.

`.claude/rules/spec-pipeline.md` § Gotchas gains two entries:

- [host] `exactOptionalPropertyTypes: true` makes `z.…optional()` infer `?: T | undefined`, which is
  not assignable to a hand-written `?: T`; every hand-written optional is spelled `?: T | undefined`
  and every emit site uses a conditional spread rather than assigning a possibly-`undefined` value.
  — A6 of specs/20260917/02-the-story-travels.md
- [host] A browser test that edits the fixture host by literal source-text `.replace()` breaks the
  moment the fixture's own source changes shape; anchor such an edit on a parsed value, not on a
  source line. — AC-20260917-02-20
