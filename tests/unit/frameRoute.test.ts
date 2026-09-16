// AC-20260915-04-1, AC-20260915-04-2 (D2 of specs/20260915/04-journey-guide-honours-the-frame-boundary.md):
// `src/ui/frame/frameRoute.ts` is the one module that owns the frame's hash grammar. DOM-free —
// this is a pure unit test of `buildFrameHash`/`parseFrameHash`/`sameScreenState`/`frameSrc`, no
// browser, no serve. The module does not exist yet on the pre-image (frameHref.ts is what exists
// today); this file is red by missing module until the analysis-wave worker creates it.
import { describe, expect, it } from 'vitest'
import { buildFrameHash, frameSrc, parseFrameHash, sameScreenState, type FrameRoute } from '../../src/ui/frame/frameRoute.js'

const STATES = ['Default', 'Low balance', 'A&B', 'a/b', 'what?', 'a%b', 'a+b', '日本語', ''] as const

describe('AC-20260915-04-1: buildFrameHash / parseFrameHash round-trip', () => {
  it.each(STATES)('a screen route with state %j round-trips through buildFrameHash → parseFrameHash', (state) => {
    const route: FrameRoute = { kind: 'screen', screen: 'account', state }
    const hash = buildFrameHash(route)
    expect(hash.startsWith('#/')).toBe(true)
    expect(parseFrameHash(hash)).toEqual(route)
  })

  it.each(STATES)('a component route with example %j round-trips through buildFrameHash → parseFrameHash', (example) => {
    const route: FrameRoute = { kind: 'component', name: 'Wallet Summary', example }
    const hash = buildFrameHash(route)
    expect(hash.startsWith('#/')).toBe(true)
    expect(parseFrameHash(hash)).toEqual(route)
  })

  it('encodes each tricky value exactly as the encoding rules specify (byte-identical to the retired builders)', () => {
    expect(buildFrameHash({ kind: 'screen', screen: 'account', state: 'Low balance' })).toBe('#/account?state=Low%20balance')
    expect(buildFrameHash({ kind: 'screen', screen: 'account', state: 'A&B' })).toBe('#/account?state=A%26B')
    expect(buildFrameHash({ kind: 'screen', screen: 'account', state: 'a/b' })).toBe('#/account?state=a%2Fb')
    expect(buildFrameHash({ kind: 'screen', screen: 'account', state: 'a+b' })).toBe('#/account?state=a%2Bb')
    expect(buildFrameHash({ kind: 'screen', screen: 'account', state: '日本語' })).toBe(
      '#/account?state=%E6%97%A5%E6%9C%AC%E8%AA%9E',
    )
    expect(buildFrameHash({ kind: 'screen', screen: 'account', state: '' })).toBe('#/account?state=')
    expect(buildFrameHash({ kind: 'screen', screen: 'home', state: 'Default', scheme: 'dark' })).toBe(
      '#/home?state=Default&scheme=dark',
    )
    expect(buildFrameHash({ kind: 'component', name: 'Wallet Summary', example: 'Default' })).toBe(
      '#/__component?name=Wallet%20Summary&example=Default',
    )
  })

  it('deep-equal round-trip for the exact example from D2 (account/Low balance)', () => {
    const route: FrameRoute = { kind: 'screen', screen: 'account', state: 'Low balance' }
    expect(buildFrameHash(route)).toBe('#/account?state=Low%20balance')
    expect(parseFrameHash('#/account?state=Low%20balance')).toEqual(route)
  })

  it("'a+b' round-trips through parseFrameHash even though buildFrameHash never emits a literal '+'", () => {
    const route: FrameRoute = { kind: 'screen', screen: 'account', state: 'a+b' }
    const hash = buildFrameHash(route)
    expect(hash).toBe('#/account?state=a%2Bb')
    expect(parseFrameHash(hash)).toEqual(route)
  })

  it('a screen route with scheme:"dark" round-trips with scheme intact', () => {
    const route: FrameRoute = { kind: 'screen', screen: 'home', state: 'Default', scheme: 'dark' }
    const hash = buildFrameHash(route)
    expect(hash).toBe('#/home?state=Default&scheme=dark')
    expect(parseFrameHash(hash)).toEqual(route)
  })
})

describe('AC-20260915-04-2: parseFrameHash / sameScreenState', () => {
  it('#/account?state=Low+balance and #/account?state=Low%20balance both parse to the same decoded state', () => {
    const expected: FrameRoute = { kind: 'screen', screen: 'account', state: 'Low balance' }
    expect(parseFrameHash('#/account?state=Low+balance')).toEqual(expected)
    expect(parseFrameHash('#/account?state=Low%20balance')).toEqual(expected)
  })

  it('ignores unknown params: #/account?state=Default&unknown=1&j=first-visit&step=2 → {screen:"account", state:"Default"}', () => {
    expect(parseFrameHash('#/account?state=Default&unknown=1&j=first-visit&step=2')).toEqual({
      kind: 'screen',
      screen: 'account',
      state: 'Default',
    })
  })

  it("returns undefined for '' and '#/'", () => {
    expect(parseFrameHash('')).toBeUndefined()
    expect(parseFrameHash('#/')).toBeUndefined()
  })

  it('never throws on a malformed hash', () => {
    expect(() => parseFrameHash('#/__component?name=%')).not.toThrow()
    expect(() => parseFrameHash('not-a-hash-at-all')).not.toThrow()
  })

  it('sameScreenState ignores scheme and unrelated extra params', () => {
    const a = parseFrameHash('#/account?state=Low%20balance&scheme=dark')
    expect(a).toBeDefined()
    expect(sameScreenState(a as FrameRoute, { kind: 'screen', screen: 'account', state: 'Low balance' })).toBe(true)

    const b = parseFrameHash('#/account?state=Low%20balance&scheme=light&extra=1')
    expect(b).toBeDefined()
    expect(sameScreenState(a as FrameRoute, b as FrameRoute)).toBe(true)
  })

  it('sameScreenState is false for different state and for screen vs component routes with the same name', () => {
    expect(
      sameScreenState(
        { kind: 'screen', screen: 'account', state: 'Default' },
        { kind: 'screen', screen: 'account', state: 'Keys' },
      ),
    ).toBe(false)
    expect(
      sameScreenState(
        { kind: 'screen', screen: 'account', state: 'Default' },
        { kind: 'component', name: 'account', example: 'Default' },
      ),
    ).toBe(false)
  })
})

describe('AC-20260915-04-1: frameSrc (verified alongside buildFrameHash — Contracts example)', () => {
  it('frameSrc({kind:"screen", screen:"home", state:"Default", scheme:"light"}, "nova") matches today\'s look.ts string byte for byte', () => {
    expect(frameSrc({ kind: 'screen', screen: 'home', state: 'Default', scheme: 'light' }, 'nova')).toBe(
      '/?frame=1&_theme=nova#/home?state=Default&scheme=light',
    )
  })
})
