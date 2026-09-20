// AC-20260919-01-4, -5, -6, -7 (D2/D4/D1/D15): the repo's first unit test over `store.ts`. D2's
// `enterMarking` patch builder (spread order plus the `Omit` argument type make the
// marking:true/pins:true pair unoverridable and uncircumventable at the type level); D4's source
// scan that enforces every mark-mode ENTRY (never an exit) routes through it; D1's split
// `notesPanel`/`pins` defaults (both `true` in `initialUi()`); and D1's negative case — rule 31
// persists only `guide-off`/`view`/`side-tab`, so neither successor of `showNotes` ever joins them.
import { beforeEach, describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore, enterMarking, initialUi } from '../../src/ui/store/store.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** In-memory `Storage` stand-in. `src/ui/prefs.ts` is the only sessionStorage accessor in this
 * package, and this file is the first unit test to exercise it — vitest's `unit` project runs in
 * the plain `node` environment (vitest.config.ts), which has no `sessionStorage` global at all.
 * Assigned onto `globalThis` (never a bare `sessionStorage = …`, which throws under ESM's
 * always-strict mode when the identifier has no prior binding) fresh before every test, so no
 * test's writes leak into the next. */
class MemoryStorage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  keys(): string[] {
    return Array.from(this.map.keys())
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  globalThis.sessionStorage = storage
})

describe('AC-20260919-01-6: initialUi() defaults both notesPanel and pins to true (D1)', () => {
  it('AC-20260919-01-6: initialUi().notesPanel is true and initialUi().pins is true', () => {
    const ui = initialUi()
    expect(ui.notesPanel).toBe(true)
    expect(ui.pins).toBe(true)
  })
})

describe('AC-20260919-01-7: setUi never persists notesPanel or pins (D1, design rule 31)', () => {
  it('AC-20260919-01-7: setUi({ notesPanel: false }) and setUi({ pins: false }) write nothing to sessionStorage — the three persisted keys keep their values and no fourth key appears', () => {
    storage.setItem('guide-off', '1')
    storage.setItem('view', 'mobile')
    storage.setItem('side-tab', 'screens')

    const store = createStore()
    // Read through the store's own public `getState()`, never `initialUi()` directly — this is
    // also what keeps this test from passing vacuously pre-wave: today's `UiState` has no
    // `notesPanel`/`pins` fields at all, so these two reads are `undefined`, not `true`.
    expect(store.getState().ui.notesPanel).toBe(true)
    expect(store.getState().ui.pins).toBe(true)

    store.setUi({ notesPanel: false })
    store.setUi({ pins: false })

    expect(store.getState().ui.notesPanel).toBe(false)
    expect(store.getState().ui.pins).toBe(false)
    expect(sessionStorage.getItem('guide-off')).toBe('1')
    expect(sessionStorage.getItem('view')).toBe('mobile')
    expect(sessionStorage.getItem('side-tab')).toBe('screens')
    expect(storage.keys().sort()).toEqual(['guide-off', 'side-tab', 'view'])
  })
})

describe('AC-20260919-01-4: enterMarking is a pure, unoverridable/uncircumventable patch builder (D2)', () => {
  it('AC-20260919-01-4: enterMarking spreads its extra first, so marking:true and pins:true always win', () => {
    expect(enterMarking({ draft: null, cardOpen: false })).toEqual({
      draft: null,
      cardOpen: false,
      marking: true,
      pins: true,
    })
    // `Partial<Omit<UiState, 'marking' | 'pins'>>` makes this uncircumventable at the type level —
    // the `as never` below is exactly what a caller has to fight the type system with to even
    // attempt the override; this proves the attempt also fails at runtime, by spread order.
    expect(enterMarking({ pins: false } as never)).toEqual({ pins: true, marking: true })
  })

  it('AC-20260919-01-4: enterMarking() with no argument still returns exactly { marking: true, pins: true }', () => {
    expect(enterMarking()).toEqual({ marking: true, pins: true })
  })
})

describe("AC-20260919-01-5: rule 39's source scan (D4) — no non-store marking: assignment outside false/boolean", () => {
  it('AC-20260919-01-5: /\\bmarking:(?!\\s*(false|boolean)\\b)/ matches zero lines under src/ui/**/*.{ts,tsx} excluding store.ts', () => {
    const storeFile = path.resolve(repoRoot, 'src', 'ui', 'store', 'store.ts')
    const files = globSync(path.join(repoRoot, 'src', 'ui', '**', '*.{ts,tsx}')).filter(
      (f) => path.resolve(f) !== storeFile,
    )
    expect(files.length).toBeGreaterThan(0)

    const rule39 = /\bmarking:(?!\s*(false|boolean)\b)/
    const hits: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (rule39.test(line)) hits.push(`${path.relative(repoRoot, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })
})
