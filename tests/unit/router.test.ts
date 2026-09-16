// AC-20260915-02-3: the hash route grammar (reference §0.2), rebuilt as one router module.
// Pick (spec silent on parseRoute's exact arity): `parseRoute(hash, screens)` where `screens` is
// the ordered list of screen names (discovery order — alphabetical per src/analysis/discover.ts,
// so ['account', 'home'] for the fixture host) and the empty-hash default resolves to
// `screens[0]`. `href` inverts a Route back to a hash string.
import { describe, expect, it } from 'vitest'
import { parseRoute, href } from '../../src/ui/router/route.js'

const screens = ['account', 'home']

describe('AC-20260915-02-3: parseRoute / href', () => {
  it('parses a screen route with state, journey and step', () => {
    expect(parseRoute('#/account?state=Keys&j=first-visit&step=1', screens)).toEqual({
      kind: 'screen',
      screen: 'account',
      state: 'Keys',
      journey: 'first-visit',
      step: 1,
    })
  })

  it('parses a components route with c and from', () => {
    expect(parseRoute('#/components?c=WalletSummary&from=home', screens)).toEqual({
      kind: 'components',
      c: 'WalletSummary',
      from: 'home',
    })
  })

  it('defaults an empty hash to the first screen', () => {
    expect(parseRoute('', screens)).toEqual({ kind: 'screen', screen: 'account' })
  })

  it('reports an unknown screen path', () => {
    expect(parseRoute('#/nope', screens)).toEqual({ kind: 'unknown', path: 'nope' })
  })

  it('href inverts each parsed route', () => {
    expect(href({ kind: 'screen', screen: 'account', state: 'Keys', journey: 'first-visit', step: 1 })).toBe(
      '#/account?state=Keys&j=first-visit&step=1',
    )
    expect(href({ kind: 'components', c: 'WalletSummary', from: 'home' })).toBe('#/components?c=WalletSummary&from=home')
    expect(href({ kind: 'screen', screen: 'account' })).toBe('#/account')
    expect(href({ kind: 'unknown', path: 'nope' })).toBe('#/nope')
  })
})
