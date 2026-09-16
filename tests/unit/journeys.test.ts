// AC-20260915-02-6: D4's optional-field pill hint, and rule 29's step location.
// Picks (spec silent on exact signatures):
//  - `hintFor` has no named File Plan home; placed alongside `locate` in
//    src/ui/journeys/locate.ts (the only pure-logic module the journeys feature lists — the
//    other journeys/* files in the File Plan are presentational/hook components).
//  - `locate(journey, screen, state, screens)` — the AC's "and with step 1 = {screen:'account'}
//    (no state) and the screen's first state Default" requires resolving a step's default state
//    (D4: "default: the screen's first state"), which needs the screens' state lists; `screens`
//    is `{ name: string; states: string[] }[]` with label-cased states (as `statesOf` produces).
import { describe, expect, it } from 'vitest'
import { hintFor, locate } from '../../src/ui/journeys/locate.js'

describe('AC-20260915-02-6: journey pill hint and step location', () => {
  it('hintFor prefers say over label', () => {
    expect(hintFor({ from: 0, to: 1, label: 'Account', say: 'Open your account' })).toBe('Open your account')
  })

  it('hintFor falls back to label when say is absent', () => {
    expect(hintFor({ from: 0, to: 1, label: 'Account' })).toBe('Account')
  })

  const screens = [{ name: 'account', states: ['Default', 'Keys'] }]

  it('locate finds the step whose screen and explicit state match', () => {
    const journey = { steps: [{ screen: 'home' }, { screen: 'account', state: 'Keys' }] }
    expect(locate(journey, 'account', 'Keys', screens)).toBe(1)
  })

  it('locate resolves a stateless step to the screen\'s first state and matches only that state', () => {
    const journey = { steps: [{ screen: 'home' }, { screen: 'account' }] }
    expect(locate(journey, 'account', 'Default', screens)).toBe(1)
    expect(locate(journey, 'account', 'Keys', screens)).toBeUndefined()
  })
})
