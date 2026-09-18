// AC-20260915-02-4: D7 + reference §13 rules 2-5 tone derivations, and the "no `!.` in
// src/ui/store/*.ts" no-non-null-assertion rule from D2.
// AC-20260917-02-17 (D12): `toneOf` is the one crash guard for the new `deferred` note status —
// `deferred` renders exactly as `approved` (a closed status), never a widened `Tone`/`PinTone`.
// AC-20260917-03-1, -4 through -9, -15, -16, -19: D1/D3/D4's rewrite — `worst` now sees
// `approved`/empty distinctly, `screenTone`/`stateTone` report `approved` for an all-approved list
// instead of falling back to `answered`, `journeyTone` returns `Tone | null` (null = untouched,
// never a default), and `projectNotes` replaces `notesRest` as the panel's PROJECT-group
// membership rule (project:true only, never "not this screen").
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { screenTone, stateTone, journeyTone, notesHere, projectNotes, worst } from '../../src/ui/store/selectors.js'
import type { Note } from '../../src/schemas/index.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function note(fields: Partial<Note> & Pick<Note, 'screen' | 'status'>): Note {
  return {
    id: 'N000',
    screen: fields.screen,
    state: fields.state ?? null,
    component: fields.component ?? null,
    key: fields.key ?? null,
    snippet: fields.snippet ?? null,
    status: fields.status,
    thread: fields.thread ?? [],
  }
}

describe('AC-20260915-02-4: store selectors (tone derivations)', () => {
  it('AC-20260917-03-15: screenTone is worst-of its notes: open beats answered', () => {
    const notes = [note({ screen: 'home', status: 'answered' }), note({ screen: 'home', status: 'open' })]
    expect(screenTone('home', notes, { screens: {}, journeys: {}, contractVersion: 1, theme: null })).toBe('open')
  })

  // AC-20260917-03-4 (D3): an all-approved screen is `approved`, never the old `answered`
  // fallback — the whole reason nearly every screen sat yellow before this spec.
  it('AC-20260917-03-4: screenTone reports approved (not the old answered fallback) when every note is approved and no approval.screens entry exists', () => {
    const notes = [
      note({ screen: 'home', status: 'approved' }),
      note({ screen: 'home', status: 'approved' }),
    ]
    expect(screenTone('home', notes, { screens: {}, journeys: {}, contractVersion: 1, theme: null })).toBe('approved')
  })

  // AC-20260917-03-5 (D3): a screen with NO notes at all and no explicit approval renders no dot —
  // distinct from the all-approved case above, which the old `worst()` could not tell apart.
  it('AC-20260917-03-5: screenTone returns null for a screen with no notes and no approval.screens entry', () => {
    expect(screenTone('home', [], { screens: {}, journeys: {}, contractVersion: 1, theme: null })).toBeNull()
  })

  it('AC-20260917-03-16: screenTone reports approved when approval.screens[name] exists', () => {
    const notes = [note({ screen: 'home', status: 'approved' })]
    const approval = {
      screens: { home: { hash: 'x', approvedAt: 'now', states: [], viewports: [], schemes: [], screenshots: [] } },
      journeys: {},
      contractVersion: 1 as const,
      theme: null,
    }
    expect(screenTone('home', notes, approval)).toBe('approved')
  })

  // AC-20260917-03-7 (D3): rewritten — an all-approved state is `approved`, not the old `null`;
  // an empty list is still `null`.
  it('AC-20260917-03-7: stateTone returns approved when every note on that screen+state is approved (was null), and null when there are none', () => {
    const notes = [note({ screen: 'home', state: 'Default', status: 'approved' })]
    expect(stateTone('home', 'Default', notes)).toBe('approved')
    expect(stateTone('home', 'Default', [])).toBeNull()
  })

  // AC-20260917-03-8 (D4): rewritten — an untouched journey (no conversation entry) now returns
  // `null` (no dot), never the old `answered` default.
  it('AC-20260917-03-8: journeyTone returns null (not the old answered default) when the journey has no conversation entry', () => {
    expect(journeyTone('first-visit', {})).toBeNull()
  })

  // AC-20260917-03-9 (D4): a journey's tone is its own conversation status and nothing else —
  // `journeyTone`'s signature takes no `approval` and no notes, so there is nothing else it COULD
  // read; this just proves both live statuses still round-trip through the rewritten function.
  it('AC-20260917-03-9: journeyTone reports the journey\'s own conversation status (approved, then open)', () => {
    expect(journeyTone('first-visit', { 'first-visit': { status: 'approved', thread: [] } })).toBe('approved')
    expect(journeyTone('first-visit', { 'first-visit': { status: 'open', thread: [] } })).toBe('open')
  })

  // AC-20260917-03-6 (D3): worst() over the plain lifecycle — null only for an EMPTY list, never
  // as a stand-in for "nothing pending".
  it('AC-20260917-03-6: worst() — empty is null, otherwise open beats answered beats approved', () => {
    expect(worst([])).toBeNull()
    expect(worst([note({ screen: 'home', status: 'approved' })])).toBe('approved')
    expect(
      worst([note({ screen: 'home', status: 'answered' }), note({ screen: 'home', status: 'approved' })]),
    ).toBe('answered')
    expect(
      worst([
        note({ screen: 'home', status: 'open' }),
        note({ screen: 'home', status: 'answered' }),
        note({ screen: 'home', status: 'approved' }),
      ]),
    ).toBe('open')
  })

  // AC-20260917-03-1 (D1): `projectNotes` replaces `notesRest` as the PROJECT group's membership
  // rule — screen-independent, `project: true` only, never "not this screen". `notesHere` is
  // unchanged but reasserted here alongside it since the AC exercises both over the same list.
  it('AC-20260917-03-1: projectNotes returns only project:true notes; notesHere is unaffected', () => {
    const notes = [
      { id: 'N1', screen: 'home', state: null, component: null, key: null, snippet: null, status: 'open', thread: [] },
      { id: 'N2', screen: 'account', state: null, component: null, key: null, snippet: null, status: 'open', thread: [] },
      { id: 'N3', screen: null, state: null, component: null, key: null, snippet: null, status: 'open', thread: [], project: true },
    ] as unknown as Note[]
    expect(projectNotes(notes).map((n) => n.id)).toEqual(['N3'])
    expect(notesHere('home', notes).map((n) => n.id)).toEqual(['N1'])
  })

  // AC-20260918-02-11 (D9, supersedes AC-20260917-02-17): `deferred` becomes a fourth PIN tone —
  // owned by `notes-ui.tsx`'s `TONE` table, not by a widened aggregate `Tone`/`toneOf` here.
  // `toneOf` is DELETED by D9 (its call sites are all File Plan rows — the compiler enumerates
  // them once the function is gone), so this file no longer imports or asserts on it; instead it
  // asserts the thing D9 actually promises: `TONE.deferred` exists and is muted-grey, distinct
  // from `TONE.approved`'s blue.
  it('AC-20260918-02-11: TONE.deferred is a distinct muted-grey pin tone, not merely an alias of TONE.approved', async () => {
    const { TONE } = await import('../../src/ui/notes/notes-ui.js')
    const tone = TONE as Record<string, { box: string; pin: string } | undefined>
    expect(tone.deferred).toBeDefined()
    expect(tone.deferred).not.toEqual(tone.approved)
    expect(tone.deferred?.pin).not.toContain('blue')
    expect(tone.deferred?.box).not.toContain('blue')
  })

  // AC-20260917-03-19 (D10): supersedes spec 02's AC-20260917-02-17 pin of `null` for this exact
  // input. Under D3's rewrite a list holding a `deferred` note is non-empty, so it resolves
  // through worst()'s final "everything else is closed" branch to `approved`, not `null` — D10
  // retires spec 02's explicit "deferred is closed, return null" line entirely; deferred simply
  // falls into the same closed bucket as approved.
  it('AC-20260917-03-19: worst() treats a deferred-plus-approved list as approved, superseding spec 02\'s null pin for the same input', () => {
    expect(
      worst([
        { screen: 'home', state: null, component: null, key: null, snippet: null, status: 'deferred', thread: [] },
        { screen: 'home', state: null, component: null, key: null, snippet: null, status: 'approved', thread: [] },
      ] as unknown as Note[]),
    ).toBe('approved')
  })

  // AC-20260917-03-20: unaffected by D10 — toneOf('deferred') and journeyTone over an existing
  // deferred conversation both continue to report approved.
  it('AC-20260917-03-20: journeyTone routes a deferred journey conversation through toneOf, returning approved', () => {
    expect(
      journeyTone('j', { j: { status: 'deferred', thread: [] } as unknown as { status: Note['status']; thread: [] } }),
    ).toBe('approved')
  })

  it('src/ui/store/*.ts never uses `!.` non-null assertions (D2)', () => {
    const files = globSync(path.join(repoRoot, 'src', 'ui', 'store', '*.ts'))
    expect(files.length).toBeGreaterThan(0)
    // `grep -c` prints a per-file "0" and exits 1 when a file has zero matches — spawnSync (not
    // execFileSync) so a non-zero exit doesn't throw before we can read stdout.
    const result = spawnSync('grep', ['-c', '!\\.', ...files], { encoding: 'utf8' })
    const total = result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .reduce((sum, line) => sum + Number(line.split(':').pop()), 0)
    expect(total).toBe(0)
  })
})
