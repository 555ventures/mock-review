// AC-20260918-01-4 / D3: `ensureDesignFiles` must not clobber a `design/notes.json` that already
// exists but which `existsSync` — the create-time race's own observable shape — reports absent.
// `node:fs`'s `existsSync` is mocked to always answer `false` (everything else stays real), so the
// pre-image's `if (!existsSync(p)) writeJsonAtomic(p, EMPTY_*)` unconditionally overwrites the
// real, already-present file; the post-image's `writeFileSync(p, data, { flag: 'wx' })` still
// hits the real file on disk, gets a real `EEXIST`, and swallows it — leaving the file untouched.
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ensureDesignFiles } from '../../src/files/json.js'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false }
})

describe('AC-20260918-01-4: ensureDesignFiles vs a create-time existsSync race', () => {
  it('leaves an existing design/notes.json byte-identical when existsSync (mocked) reports it absent', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'design-files-'))
    mkdirSync(path.join(cwd, 'design'), { recursive: true })
    const notesPath = path.join(cwd, 'design', 'notes.json')
    const existing = JSON.stringify({
      contractVersion: 2,
      notes: [
        {
          id: 'N1',
          screen: 'home',
          state: 'Default',
          component: null,
          key: null,
          snippet: null,
          status: 'open',
          thread: [],
        },
      ],
      journeys: {},
    })
    writeFileSync(notesPath, existing)

    ensureDesignFiles(cwd)

    expect(readFileSync(notesPath, 'utf8')).toBe(existing)
  })
})
