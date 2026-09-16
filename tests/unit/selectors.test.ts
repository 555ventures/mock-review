// AC-20260915-02-4: D7 + reference §13 rules 2-5 tone derivations, and the "no `!.` in
// src/ui/store/*.ts" no-non-null-assertion rule from D2.
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { screenTone, stateTone, journeyTone } from '../../src/ui/store/selectors.js'
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
  it('screenTone is worst-of its notes: open beats answered', () => {
    const notes = [note({ screen: 'home', status: 'answered' }), note({ screen: 'home', status: 'open' })]
    expect(screenTone('home', notes, { screens: {}, journeys: {}, contractVersion: 1, theme: null })).toBe('open')
  })

  it('screenTone falls back to answered when notes are all approved and no approval.screens entry exists', () => {
    const notes = [note({ screen: 'home', status: 'approved' })]
    expect(screenTone('home', notes, { screens: {}, journeys: {}, contractVersion: 1, theme: null })).toBe('answered')
  })

  it('screenTone reports approved when approval.screens[name] exists', () => {
    const notes = [note({ screen: 'home', status: 'approved' })]
    const approval = {
      screens: { home: { hash: 'x', approvedAt: 'now', states: [], viewports: [], schemes: [], screenshots: [] } },
      journeys: {},
      contractVersion: 1 as const,
      theme: null,
    }
    expect(screenTone('home', notes, approval)).toBe('approved')
  })

  it('stateTone returns null when there are no pending notes on that screen+state', () => {
    const notes = [note({ screen: 'home', state: 'Default', status: 'approved' })]
    expect(stateTone('home', 'Default', notes)).toBeNull()
  })

  it('journeyTone defaults to answered when the journey has no conversation entry', () => {
    expect(journeyTone('first-visit', {})).toBe('answered')
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
