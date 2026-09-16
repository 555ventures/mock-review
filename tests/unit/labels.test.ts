// AC-20260915-02-5: D3's label rules — screenLabel/stateLabel/stepLabel live in
// src/ui/store/labels.ts per the File Plan; statesOf is listed under src/ui/store/selectors.ts
// in the same File Plan row (`worst, screenTone, stateTone, journeyTone, notesHere, notesRest,
// statesOf, labels`), so this file imports it from there even though the AC that exercises it
// (AC-5) is routed to this test file by the File Plan's tests/unit/labels.test.ts row.
import { describe, expect, it } from 'vitest'
import { screenLabel, stateLabel, stepLabel } from '../../src/ui/store/labels.js'
import { statesOf } from '../../src/ui/store/selectors.js'

describe('AC-20260915-02-5: screen/state/step labels and state ordering', () => {
  it('screenLabel splits dashes and camel humps into Title Case', () => {
    expect(screenLabel('console-account')).toBe('Console Account')
  })

  it('stateLabel renders the key in sentence case', () => {
    expect(stateLabel('SignedOut')).toBe('Signed out')
    expect(stateLabel('Keys')).toBe('Keys')
  })

  it('stepLabel joins screen and state labels with an en dash', () => {
    expect(stepLabel('console-account', 'Keys')).toBe('Console Account – Keys')
  })

  it('statesOf orders meta.states first (case-matched against examples keys), unknown examples after', () => {
    const screen = {
      meta: { states: ['default', 'empty'] },
      examples: { Empty: {}, Default: {} },
    }
    expect(statesOf(screen)).toEqual(['Default', 'Empty'])
  })
})
