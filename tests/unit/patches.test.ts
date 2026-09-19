// AC-20260915-02-7, AC-20260915-02-11, AC-20260915-02-12: D5/D6/D7's patch appliers.
// Pick (spec silent on exact arity): `applyNotesPatch(notes, patch, approval?)` returns
// `{ notes, approval }` — approval defaults to EMPTY_APPROVAL when omitted, so AC-7's two-arg
// call form still type-checks while AC-12 (which needs the un-approve rule to see and return an
// approval document) can pass a third. `applyApprovalPatch(approval, patch, ctx)` where
// `ctx = { hash(name): string; config: Config; statesOf(name): string[]; screenshotsFor(name):
// string[] }` — the spec names `ctx.hash` and `ctx.config.targets` explicitly; `statesOf` and
// `screenshotsFor` are this file's picks for the remaining `approval.screens[name]` fields D7
// requires (`states`, `screenshots`).
import { describe, expect, it } from 'vitest'
import { applyNotesPatch, applyApprovalPatch } from '../../src/server/patches.js'
import { NotesSchema, EMPTY_NOTES, EMPTY_APPROVAL } from '../../src/schemas/index.js'
import { NotesPatchSchema } from '../../src/schemas/patches.js'
import type { Note, Approval, Config } from '../../src/schemas/index.js'
import type { NotesPatch } from '../../src/schemas/patches.js'

function baseNote(overrides: Partial<Note> = {}): Omit<Note, 'id'> {
  return {
    screen: 'home',
    state: 'Default',
    component: 'WalletSummary',
    key: '0',
    snippet: 'Balance',
    status: 'open',
    thread: [],
    ...overrides,
  } as Omit<Note, 'id'>
}

describe('AC-20260915-02-7: applyNotesPatch add/update', () => {
  it('assigns N001 then N002 to sequential adds and keeps passthrough extras, producing a schema-valid document', () => {
    const note1 = {
      ...baseNote(),
      rect: { x: 0, y: 0, w: 1, h: 1 },
      viewport: 'desktop',
      whole: false,
    } as unknown as Note
    const r1 = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: note1 })
    expect(r1.notes.notes[0]?.id).toBe('N001')
    expect(r1.notes.notes[0]?.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(r1.notes.notes[0]?.viewport).toBe('desktop')
    expect(r1.notes.notes[0]?.whole).toBe(false)
    expect(NotesSchema.safeParse(r1.notes).success).toBe(true)

    const r2 = applyNotesPatch(r1.notes, { op: 'add', note: note1 })
    expect(r2.notes.notes[1]?.id).toBe('N002')
  })

  it('update changes only the targeted note', () => {
    const note1 = baseNote({ status: 'answered' }) as unknown as Note
    const seeded = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: note1 })
    const other = applyNotesPatch(seeded.notes, {
      op: 'add',
      note: baseNote({ screen: 'account' }) as unknown as Note,
    })
    const id = other.notes.notes[0]?.id as string
    const otherId = other.notes.notes[1]?.id as string

    const updated = applyNotesPatch(other.notes, { op: 'update', id, fields: { status: 'open' } })
    expect(updated.notes.notes.find((n: Note) => n.id === id)?.status).toBe('open')
    expect(updated.notes.notes.find((n: Note) => n.id === otherId)).toEqual(
      other.notes.notes.find((n: Note) => n.id === otherId),
    )
  })
})

const config: Config = {
  name: 'app',
  port: 5180,
  targets: { viewports: ['360x800', '1280x800'], schemes: ['light', 'dark'] },
  theme: null,
  client: { token: 'replace-me' },
}

// D7: `applyApprovalPatch`'s `clientOk` case derives the written `beats` from `ctx.beatsHash`,
// never from the patch's own `beats` (that's the route layer's If-Match verification — D7's own
// "verification stays in the endpoint, derivation in the ctx"). Every clientOk case in this file
// posts `beats: '7c0be20327a0'`, so the stub returns that same literal for every journey id; a
// case that needs the null (no-story) path passes its own ctx override instead of this default.
function ctx(
  beatsHash: (journeyId: string) => string | null = (_journeyId: string) => '7c0be20327a0',
) {
  return {
    hash: (_name: string) => 'abc',
    config,
    statesOf: (_name: string) => ['default', 'empty'],
    screenshotsFor: (_name: string) => [] as string[],
    beatsHash,
  }
}

describe('AC-20260915-02-11: applyApprovalPatch', () => {
  it('approveScreen writes hash/approvedAt/states/viewports/schemes/screenshots', () => {
    const result = applyApprovalPatch(EMPTY_APPROVAL, { op: 'approveScreen', name: 'home' }, ctx())
    const entry = result.screens.home
    expect(entry).toBeDefined()
    expect(entry?.hash).toBe('abc')
    expect(entry?.states).toEqual(['default', 'empty'])
    expect(entry?.viewports).toEqual(['360x800', '1280x800'])
    expect(entry?.schemes).toEqual(['light', 'dark'])
    expect(entry?.screenshots).toEqual([])
    expect(() => new Date(entry?.approvedAt ?? '').toISOString()).not.toThrow()
  })

  // AC-20260917-02-8 (D7/D8): `approveJourney` no longer exists; `clientOk` is the sole journey
  // approval op, and it now REQUIRES the story hash it was served (`beats`).
  it('AC-20260917-02-8: clientOk over an empty journeys map writes an entry with exactly client/beats/at (no approvedAt)', () => {
    const result = applyApprovalPatch(
      EMPTY_APPROVAL,
      { op: 'clientOk', id: 'first-visit', beats: '7c0be20327a0' },
      ctx(),
    )
    const entry = result.journeys['first-visit']
    expect(entry).toBeDefined()
    expect(Object.keys(entry ?? {}).sort()).toEqual(['at', 'beats', 'client'])
    expect(entry?.client).toBe('ok')
    expect((entry as unknown as { beats?: string })?.beats).toBe('7c0be20327a0')
    expect(() =>
      new Date((entry as unknown as { at?: string })?.at ?? '').toISOString(),
    ).not.toThrow()
  })

  it('AC-20260917-02-8: clientOk over an existing v1-shaped entry preserves approvedAt untouched while setting client/beats/at', () => {
    const approval: Approval = {
      ...EMPTY_APPROVAL,
      journeys: {
        'first-visit': {
          approvedAt: '2026-01-01T00:00:00.000Z',
          client: null,
        } as Approval['journeys'][string],
      },
    }
    const result = applyApprovalPatch(
      approval,
      { op: 'clientOk', id: 'first-visit', beats: '7c0be20327a0' },
      ctx(),
    )
    const entry = result.journeys['first-visit'] as unknown as {
      approvedAt?: string | null
      client: string | null
      beats?: string
      at?: string
    }
    expect(entry.approvedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(entry.client).toBe('ok')
    expect(entry.beats).toBe('7c0be20327a0')
    expect(typeof entry.at).toBe('string')
  })

  // AC-20260918-03-6 (D5): `op:'theme'` is retired from `ApprovalPatchSchema` entirely, mirroring
  // AC-20260917-02-13's own `approveJourney` case just below — any role posting it is refused at
  // the schema, never reaching `applyApprovalPatch` (the route-level 400 is
  // tests/server/api.test.ts's own AC-6 case).
  it('AC-20260918-03-6: ApprovalPatchSchema refuses a theme op outright', async () => {
    const { ApprovalPatchSchema } = await import('../../src/schemas/patches.js')
    const result = ApprovalPatchSchema.safeParse({ op: 'theme', key: 'nova' })
    expect(result.success).toBe(false)
  })

  // AC-20260917-02-13 (D9): `approveJourney` is removed from `ApprovalPatchSchema` entirely — any
  // role posting it is refused 400 `invalid approval patch` at the schema layer, never reaching
  // `applyApprovalPatch` at all. Proven here at the schema (the route-level 400 is
  // tests/server/api.test.ts's own AC-13 case).
  it('AC-20260917-02-13: ApprovalPatchSchema refuses an approveJourney op outright', async () => {
    const { ApprovalPatchSchema } = await import('../../src/schemas/patches.js')
    const result = ApprovalPatchSchema.safeParse({ op: 'approveJourney', id: 'first-visit' })
    expect(result.success).toBe(false)
  })

  // AC-20260918-04-5 (D5): the `unapproveScreen` WIRE OP is removed from `ApprovalPatchSchema` —
  // no role can post it any more, refused at the schema exactly like `theme`/`approveJourney`
  // above; the route-level 400 is covered by the same schema refusal on the approval route. The helper of
  // the same name (src/server/patches.ts:36, called by rule 6) is a different thing and is
  // exercised, unchanged, by the "notes patches un-approve a screen" describe block below.
  it('AC-20260918-04-5: ApprovalPatchSchema refuses an unapproveScreen op outright', async () => {
    const { ApprovalPatchSchema } = await import('../../src/schemas/patches.js')
    const result = ApprovalPatchSchema.safeParse({ op: 'unapproveScreen', name: 'home' })
    expect(result.success).toBe(false)
  })

  // AC-20260918-04-6/D6: the new `waive` op and its reducer case, mirroring clientOk's fresh
  // stamp — `approvedAt` is never written, and an existing one on the entry does NOT survive
  // (unlike clientOk's preserve-approvedAt case above): D6 says the written shape is exactly
  // `{ ...existing, client: 'waived', reason, beats, at }`, so `...existing` still spreads first,
  // but `client`/`reason`/`beats`/`at` are always the fresh values from the patch/stamp, never the
  // pre-existing ones.
  it('AC-20260918-04-6: waive writes client:waived, reason, beats and a fresh at stamp, never approvedAt', () => {
    const result = applyApprovalPatch(
      EMPTY_APPROVAL,
      { op: 'waive', id: 'first-visit', reason: 'client unreachable', beats: 'deadbeef0000' },
      ctx(),
    )
    const entry = result.journeys['first-visit'] as unknown as {
      client: string
      reason: string
      beats: string
      at: string
      approvedAt?: string
    }
    expect(entry.client).toBe('waived')
    expect(entry.reason).toBe('client unreachable')
    expect(entry.beats).toBe('deadbeef0000')
    expect(typeof entry.at).toBe('string')
    expect(entry.approvedAt).toBeUndefined()
  })

  it('AC-20260918-04-6: waive over an existing entry preserves unrelated keys via ...existing while overwriting client/reason/beats/at', () => {
    const approval: Approval = {
      ...EMPTY_APPROVAL,
      journeys: {
        'first-visit': {
          approvedAt: '2026-01-01T00:00:00.000Z',
          client: 'ok',
        } as Approval['journeys'][string],
      },
    }
    const result = applyApprovalPatch(
      approval,
      { op: 'waive', id: 'first-visit', reason: 'client unreachable', beats: 'deadbeef0000' },
      ctx(),
    )
    const entry = result.journeys['first-visit'] as unknown as {
      approvedAt?: string
      client: string
      reason: string
      beats: string
      at: string
    }
    expect(entry.approvedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(entry.client).toBe('waived')
    expect(entry.reason).toBe('client unreachable')
    expect(entry.beats).toBe('deadbeef0000')
  })

  it('AC-20260918-04-6: ApprovalPatchSchema accepts a waive op with a non-empty reason and rejects a whitespace-only reason', async () => {
    const { ApprovalPatchSchema } = await import('../../src/schemas/patches.js')
    const good = ApprovalPatchSchema.safeParse({
      op: 'waive',
      id: 'first-visit',
      reason: 'client unreachable',
      beats: 'h',
    })
    expect(good.success).toBe(true)

    const blank = ApprovalPatchSchema.safeParse({
      op: 'waive',
      id: 'first-visit',
      reason: '   ',
      beats: 'h',
    })
    expect(blank.success).toBe(false)
  })
})

describe('AC-20260915-02-12: notes patches un-approve a screen (D7 rule 6)', () => {
  const approvedHome: Approval = {
    ...EMPTY_APPROVAL,
    screens: {
      home: {
        hash: 'abc',
        approvedAt: 'now',
        states: ['default'],
        viewports: [],
        schemes: [],
        screenshots: [],
      },
    },
  }

  it('a new note on an approved screen removes approval.screens[name]', () => {
    const result = applyNotesPatch(
      EMPTY_NOTES,
      { op: 'add', note: baseNote() as unknown as Note },
      approvedHome,
    )
    expect(result.approval.screens.home).toBeUndefined()
  })

  it('a note turning from answered to open removes approval.screens[name]', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({ status: 'answered' }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'update', id, fields: { status: 'open' } },
      approvedHome,
    )
    expect(result.approval.screens.home).toBeUndefined()
  })

  it('approving a note leaves approval untouched', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({ status: 'answered' }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'update', id, fields: { status: 'approved' } },
      approvedHome,
    )
    expect(result.approval).toEqual(approvedHome)
  })

  // D23: "An update that moves a note to another screen un-approves both the old and the new
  // screen when the result is open." Both home and account start approved; a note that already
  // lives on home moves to account while staying open, so the note's presence would otherwise be
  // stale on whichever of the two screens the reviewer is looking at next.
  it('an update that moves an open note to another screen un-approves both the old and the new screen', () => {
    const bothApproved: Approval = {
      ...EMPTY_APPROVAL,
      screens: {
        home: {
          hash: 'abc',
          approvedAt: 'now',
          states: ['default'],
          viewports: [],
          schemes: [],
          screenshots: [],
        },
        account: {
          hash: 'def',
          approvedAt: 'now',
          states: ['default'],
          viewports: [],
          schemes: [],
          screenshots: [],
        },
      },
    }
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({ screen: 'home', status: 'open' }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'update', id, fields: { screen: 'account' } },
      bothApproved,
    )
    expect(result.approval.screens.home).toBeUndefined()
    expect(result.approval.screens.account).toBeUndefined()
  })

  it('an update that moves an already-approved note to another screen leaves both screens approved (result is not open)', () => {
    const bothApproved: Approval = {
      ...EMPTY_APPROVAL,
      screens: {
        home: {
          hash: 'abc',
          approvedAt: 'now',
          states: ['default'],
          viewports: [],
          schemes: [],
          screenshots: [],
        },
        account: {
          hash: 'def',
          approvedAt: 'now',
          states: ['default'],
          viewports: [],
          schemes: [],
          screenshots: [],
        },
      },
    }
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({ screen: 'home', status: 'approved' }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'update', id, fields: { screen: 'account' } },
      bothApproved,
    )
    expect(result.approval.screens.home).toBeDefined()
    expect(result.approval.screens.account).toBeDefined()
  })
})

// AC-20260917-02-14 (D10, D11): the narrow `close` op — a client (or owner) ends a note or
// journey conversation they themselves opened, as `approved` or `deferred`. It never touches
// `approval.screens` (rule 6 fires only on a note turning `open`, which `close` cannot produce),
// and returns the input `approval` object BY IDENTITY so plugin.ts's `result.approval !==
// approval` write-suppression holds (D10's own rationale).
describe('AC-20260917-02-14: applyNotesPatch close op (D10)', () => {
  const approvedHome: Approval = {
    ...EMPTY_APPROVAL,
    screens: {
      home: {
        hash: 'abc',
        approvedAt: 'now',
        states: ['default'],
        viewports: [],
        schemes: [],
        screenshots: [],
      },
    },
  }

  it('sets the target note status to deferred and returns the SAME approval object reference, leaving approval.screens.home present', () => {
    const seeded = applyNotesPatch(
      EMPTY_NOTES,
      { op: 'add', note: baseNote({ status: 'open' }) as unknown as Note },
      approvedHome,
    )
    const id = seeded.notes.notes[0]?.id as string
    // The `add` above already un-approved home (rule 6) — re-seed a fresh approved doc so this
    // case isolates `close`'s own behaviour, not `add`'s.
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'close', id, status: 'deferred' },
      approvedHome,
    )
    expect(result.notes.notes.find((n) => n.id === id)?.status).toBe('deferred')
    expect(result.approval).toBe(approvedHome)
    expect(result.approval.screens.home).toBeDefined()
  })

  it('is a no-op on an unknown id, returning the notes document unchanged', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: baseNote() as unknown as Note })
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'close', id: 'N999', status: 'approved' },
      approvedHome,
    )
    expect(result.notes).toEqual(seeded.notes)
  })

  it('close is allowed from any current status, e.g. approved -> deferred', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({ status: 'approved' }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(seeded.notes, { op: 'close', id, status: 'deferred' })
    expect(result.notes.notes.find((n) => n.id === id)?.status).toBe('deferred')
  })
})

// AC-20260918-02-1/-2/-3 (D1): the new `reply` op — the one operation that appends to a thread.
// The reducer's input for `op:'reply'` is the WIDENED `AppliedNotesPatch` shape (`entry.by` can be
// `'client'` here — only the HTTP boundary parses the narrow wire enum), so these casts through
// `NotesPatch` mirror the file's existing `as unknown as Note` idiom rather than reaching for a
// type this spec has not yet added.
describe('AC-20260918-02-1/-2: applyNotesPatch reply op (D1)', () => {
  it('AC-20260918-02-1: a reply from the client to an answered note appends the entry and reopens it (thread 1 -> 2, answered -> open)', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({
        status: 'answered',
        thread: [{ by: 'session', text: 'fixed' }],
      }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    expect(seeded.notes.notes[0]?.thread).toHaveLength(1)

    const result = applyNotesPatch(seeded.notes, {
      op: 'reply',
      id,
      entry: { by: 'client', text: 'still wrong' },
    } as unknown as NotesPatch)
    const note = result.notes.notes.find((n) => n.id === id)
    expect(note?.thread).toHaveLength(2)
    expect(note?.thread?.[1]).toEqual({ by: 'client', text: 'still wrong' })
    expect(note?.status).toBe('open')
  })

  it('AC-20260918-02-2: a reply from the session sets status to answered from any source status (open, deferred)', () => {
    for (const from of ['open', 'deferred'] as const) {
      const seeded = applyNotesPatch(EMPTY_NOTES, {
        op: 'add',
        note: baseNote({ status: from }) as unknown as Note,
      })
      const id = seeded.notes.notes[0]?.id as string
      const result = applyNotesPatch(seeded.notes, {
        op: 'reply',
        id,
        entry: { by: 'session', text: 'moved it' },
      } as unknown as NotesPatch)
      expect(result.notes.notes.find((n) => n.id === id)?.status).toBe('answered')
    }
  })
})

// AC-20260918-02-3 (D1): `ReplyEntrySchema`'s `text` is `z.string().trim().min(1)` on this op
// ONLY — a whitespace-only reply is refused at the schema, never reaching the reducer.
describe('AC-20260918-02-3: NotesPatchSchema refuses a whitespace-only reply text', () => {
  it('AC-20260918-02-3: entry.text of "   " fails safeParse for op:reply with an issue on entry.text (not merely an unrecognised op)', () => {
    const result = NotesPatchSchema.safeParse({
      op: 'reply',
      id: 'N1',
      entry: { by: 'owner', text: '   ' },
    })
    expect(result.success).toBe(false)
    // Distinguishes "the reply op doesn't exist yet" (an issue on `op`, e.g. an invalid
    // discriminator) from "the op exists but text is refused" (an issue on `entry.text`) — this
    // op is not a NotesPatchSchema member yet, so this fails for the wrong reason until D1 lands.
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('entry.text')
  })
})

// AC-20260918-02-9 (D7): rule 6 gains exactly one trigger — a NOTE reply whose resulting status is
// `open` un-approves that note's screen. A session reply resolves to `answered` and therefore
// never touches approval, and `applyNotesPatch` returns `approval` BY IDENTITY when unchanged —
// contract-relevant, not stylistic: `plugin.ts` suppresses the approval write on it.
describe('AC-20260918-02-9: reply op un-approves on reopen (rule 6), returns approval by identity when unchanged', () => {
  const approvedHome: Approval = {
    ...EMPTY_APPROVAL,
    screens: {
      home: {
        hash: 'abc',
        approvedAt: 'now',
        states: ['default'],
        viewports: [],
        schemes: [],
        screenshots: [],
      },
    },
  }

  it('a client reply to a note on a currently-approved screen deletes approval.screens[name]', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({ status: 'answered' }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'reply', id, entry: { by: 'client', text: 'nope' } } as unknown as NotesPatch,
      approvedHome,
    )
    expect(result.approval.screens.home).toBeUndefined()
  })

  it('a session reply leaves approval unchanged BY IDENTITY (same object reference)', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, {
      op: 'add',
      note: baseNote({ status: 'open' }) as unknown as Note,
    })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(
      seeded.notes,
      { op: 'reply', id, entry: { by: 'session', text: 'fixed' } } as unknown as NotesPatch,
      approvedHome,
    )
    expect(result.approval).toBe(approvedHome)
  })
})

// AC-20260917-03-10/-12 (D6): the write-path scope invariant — a note is either product-wide
// (`project: true`, no screen) or anchored to a screen, never both and never neither. Enforced on
// `AddNoteSchema` only; the read-back document schemas (`NotesSchema`/`NoteSchema`) stay
// permissive on purpose (D6's own rationale: a refinement there would blank an existing host's
// panel with no error surfaced, since `buildState` swallows a parse failure into `EMPTY_NOTES`).
describe('AC-20260917-03-10/-12: the notes scope invariant (D6)', () => {
  it('AC-20260917-03-10: NotesPatchSchema rejects an add whose note carries both screen and project:true, with the exact issue message', () => {
    const result = NotesPatchSchema.safeParse({
      op: 'add',
      note: {
        screen: 'home',
        state: null,
        component: null,
        key: null,
        snippet: null,
        status: 'open',
        thread: [],
        project: true,
      },
    })
    expect(result.success).toBe(false)
    const messages = result.success ? [] : result.error.issues.map((i) => i.message)
    expect(messages).toContain('a project note carries no screen')
  })

  it('AC-20260917-03-10: NotesPatchSchema rejects an add whose note carries screen:null with no project marker, with the exact issue message', () => {
    const result = NotesPatchSchema.safeParse({
      op: 'add',
      note: {
        screen: null,
        state: null,
        component: null,
        key: null,
        snippet: null,
        status: 'open',
        thread: [],
      },
    })
    expect(result.success).toBe(false)
    const messages = result.success ? [] : result.error.issues.map((i) => i.message)
    expect(messages).toContain('a note with no screen must be project:true')
  })

  it('AC-20260917-03-12: NotesSchema still accepts a contradictory note (screen + project:true) already on disk — the read-back path stays permissive', () => {
    const result = NotesSchema.safeParse({
      contractVersion: 3,
      notes: [
        {
          id: 'N001',
          screen: 'home',
          state: null,
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [],
          project: true,
        },
      ],
      journeys: {},
    })
    expect(result.success).toBe(true)
  })
})
