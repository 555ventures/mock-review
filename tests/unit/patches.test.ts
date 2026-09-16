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
import type { Note, Approval, Config } from '../../src/schemas/index.js'

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
    const note1 = { ...baseNote(), rect: { x: 0, y: 0, w: 1, h: 1 }, viewport: 'desktop', whole: false } as unknown as Note
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
    const other = applyNotesPatch(seeded.notes, { op: 'add', note: baseNote({ screen: 'account' }) as unknown as Note })
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

function ctx() {
  return {
    hash: (_name: string) => 'abc',
    config,
    statesOf: (_name: string) => ['default', 'empty'],
    screenshotsFor: (_name: string) => [] as string[],
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

  it('approveJourney keeps an existing client:"ok" and sets approvedAt', () => {
    const approval: Approval = {
      ...EMPTY_APPROVAL,
      journeys: { 'first-visit': { approvedAt: null, client: 'ok' } },
    }
    const result = applyApprovalPatch(approval, { op: 'approveJourney', id: 'first-visit' }, ctx())
    expect(result.journeys['first-visit']?.client).toBe('ok')
    expect(result.journeys['first-visit']?.approvedAt).not.toBeNull()
  })

  it('theme sets approval.theme', () => {
    const result = applyApprovalPatch(EMPTY_APPROVAL, { op: 'theme', key: 'nova' }, ctx())
    expect(result.theme).toBe('nova')
  })
})

describe('AC-20260915-02-12: notes patches un-approve a screen (D7 rule 6)', () => {
  const approvedHome: Approval = {
    ...EMPTY_APPROVAL,
    screens: {
      home: { hash: 'abc', approvedAt: 'now', states: ['default'], viewports: [], schemes: [], screenshots: [] },
    },
  }

  it('a new note on an approved screen removes approval.screens[name]', () => {
    const result = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: baseNote() as unknown as Note }, approvedHome)
    expect(result.approval.screens.home).toBeUndefined()
  })

  it('a note turning from answered to open removes approval.screens[name]', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: baseNote({ status: 'answered' }) as unknown as Note })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(seeded.notes, { op: 'update', id, fields: { status: 'open' } }, approvedHome)
    expect(result.approval.screens.home).toBeUndefined()
  })

  it('approving a note leaves approval untouched', () => {
    const seeded = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: baseNote({ status: 'answered' }) as unknown as Note })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(seeded.notes, { op: 'update', id, fields: { status: 'approved' } }, approvedHome)
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
        home: { hash: 'abc', approvedAt: 'now', states: ['default'], viewports: [], schemes: [], screenshots: [] },
        account: { hash: 'def', approvedAt: 'now', states: ['default'], viewports: [], schemes: [], screenshots: [] },
      },
    }
    const seeded = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: baseNote({ screen: 'home', status: 'open' }) as unknown as Note })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(seeded.notes, { op: 'update', id, fields: { screen: 'account' } }, bothApproved)
    expect(result.approval.screens.home).toBeUndefined()
    expect(result.approval.screens.account).toBeUndefined()
  })

  it('an update that moves an already-approved note to another screen leaves both screens approved (result is not open)', () => {
    const bothApproved: Approval = {
      ...EMPTY_APPROVAL,
      screens: {
        home: { hash: 'abc', approvedAt: 'now', states: ['default'], viewports: [], schemes: [], screenshots: [] },
        account: { hash: 'def', approvedAt: 'now', states: ['default'], viewports: [], schemes: [], screenshots: [] },
      },
    }
    const seeded = applyNotesPatch(EMPTY_NOTES, { op: 'add', note: baseNote({ screen: 'home', status: 'approved' }) as unknown as Note })
    const id = seeded.notes.notes[0]?.id as string
    const result = applyNotesPatch(seeded.notes, { op: 'update', id, fields: { screen: 'account' } }, bothApproved)
    expect(result.approval.screens.home).toBeDefined()
    expect(result.approval.screens.account).toBeDefined()
  })
})
