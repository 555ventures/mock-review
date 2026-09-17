// AC-20260916-03-1, AC-20260916-03-2, AC-20260916-03-3, AC-20260916-03-4 (D2-D5, D11 of
// specs/20260916/03-state-keys-and-scaffold-components.md): `src/ui/frame/stateKey.ts` is the one
// resolver every state/example-key comparison in the package goes through — `stateKey` (pure
// normaliser), `resolveStates` (exact-first, then unique-normalised, ambiguity refused) and
// `resolveState` (single-lookup form, D5: exactly `resolveStates([state], exampleKeys).byState.get(state)`).
// The module does not exist yet on the pre-image, so every import below is red by missing module
// until the schemas-wave worker creates it (D2: zero imports, ships under src/ui, layer schemas).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveState, resolveStates, stateKey } from '../../src/ui/frame/stateKey.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('AC-20260916-03-1: stateKey normalises to lowercase alnum-only', () => {
  it.each([
    ['no-phone', 'nophone'],
    ['NoPhone', 'nophone'],
    ['no_phone', 'nophone'],
    ['Default', 'default'],
    ['---', ''],
  ])('stateKey(%j) === %j', (input, expected) => {
    expect(stateKey(input)).toBe(expected)
  })
})

describe('AC-20260916-03-2: resolveStates binds exact matches before normalised ones, each key claimed once', () => {
  it('exact matches for both states, no unmatched, no ambiguous', () => {
    const result = resolveStates(['default', 'no-phone'], ['Default', 'NoPhone'])
    expect(Object.fromEntries(result.byState)).toEqual({ default: 'Default', 'no-phone': 'NoPhone' })
    expect(result.unmatched).toEqual([])
    expect(result.ambiguous).toEqual([])
  })

  it('an exact key elsewhere in exampleKeys is claimed first, leaving a normalised-only spelling unmatched', () => {
    const result = resolveStates(['no-phone', 'NoPhone'], ['NoPhone'])
    expect(Object.fromEntries(result.byState)).toEqual({ NoPhone: 'NoPhone' })
    expect(result.unmatched).toEqual(['no-phone'])
    expect(result.ambiguous).toEqual([])
  })

  it('a state whose normalised form is empty and matches nothing is unmatched, not ambiguous', () => {
    const result = resolveStates(['---'], ['___'])
    expect(result.byState.size).toBe(0)
    expect(result.unmatched).toEqual(['---'])
    expect(result.ambiguous).toEqual([])
  })
})

describe('AC-20260916-03-3: two or more unclaimed normalised candidates leaves the state unbound and ambiguous', () => {
  it('resolveStates reports the ambiguous state with both candidate keys in exampleKeys order', () => {
    const result = resolveStates(['no-phone'], ['NoPhone', 'no_phone'])
    expect(result.byState.size).toBe(0)
    expect(result.unmatched).toEqual([])
    expect(result.ambiguous).toEqual([{ state: 'no-phone', keys: ['NoPhone', 'no_phone'] }])
  })

  it('resolveState returns undefined for the ambiguous spelling', () => {
    expect(resolveState(['NoPhone', 'no_phone'], 'no-phone')).toBeUndefined()
  })

  it('resolveState still returns the exact match for a differently-spelled state', () => {
    expect(resolveState(['NoPhone', 'no_phone'], 'no_phone')).toBe('no_phone')
  })
})

describe('AC-20260916-03-4: no more ad-hoc case-insensitive state comparisons, every site imports the resolver', () => {
  const NO_ADHOC_COMPARE = /\.toLowerCase\(\)\s*===\s*[\w.]+\.toLowerCase\(\)/

  const sites: { file: string; importSuffix: string }[] = [
    { file: 'src/analysis/screens.ts', importSuffix: 'ui/frame/stateKey.js' },
    { file: 'src/server/state.ts', importSuffix: 'ui/frame/stateKey.js' },
    { file: 'src/ui/store/selectors.ts', importSuffix: 'ui/frame/stateKey.js' },
    { file: 'src/ui/frame/mount.tsx', importSuffix: './stateKey.js' },
  ]

  it.each(sites)('$file has no ad-hoc toLowerCase() === toLowerCase() comparison', ({ file }) => {
    const source = readFileSync(path.join(repoRoot, file), 'utf8')
    expect(NO_ADHOC_COMPARE.test(source)).toBe(false)
  })

  it.each(sites)('$file imports from a specifier ending "$importSuffix"', ({ file, importSuffix }) => {
    const source = readFileSync(path.join(repoRoot, file), 'utf8')
    const hasImport = source
      .split('\n')
      .some((line) => line.includes('import') && line.trim().endsWith(`${importSuffix}'`))
    expect(hasImport).toBe(true)
  })
})
