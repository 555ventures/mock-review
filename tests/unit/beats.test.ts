// AC-20260917-02-4, AC-20260917-02-5, AC-20260917-02-21: D4's `beatHash`/`beatlessStep` — the one
// hash of a journey's story, mirroring `claude-plugins/spec/scripts/lib/surfaces.js:54-59`
// exactly (A1, executed). Pure functions, no filesystem/server involved — every literal below was
// independently computed with `node:crypto` in the spike behind A1/A2 and is reproduced here
// verbatim so a drift between this package's hash and the plugin's own is caught immediately.
import { describe, expect, it } from 'vitest'
import { beatHash, beatlessStep } from '../../src/analysis/beats.js'

describe('AC-20260917-02-4: beatHash', () => {
  it('hashes the Contracts pair (home -> login@empty) to the pinned literal', () => {
    expect(
      beatHash([
        { beat: 'I open the app', screen: 'home' },
        { beat: 'I tap Sign in', screen: 'login', state: 'empty' },
      ]),
    ).toBe('7c0be20327a0')
  })

  it('returns null for an empty array — never e3b0c44298fc, the sha256 of the empty string', () => {
    expect(beatHash([])).toBeNull()
    expect(beatHash([])).not.toBe('e3b0c44298fc')
  })

  it('returns null when any step lacks beat', () => {
    expect(
      beatHash([
        { beat: 'I open the app', screen: 'home' },
        { screen: 'login' } as unknown as { beat?: string; screen: string },
      ]),
    ).toBeNull()
  })

  it('a falsy state (empty string) hashes identically to no state at all — the plugin\'s deliberate rule', () => {
    const withEmptyState = beatHash([{ beat: 'a', screen: 'b', state: '' }])
    const withNoState = beatHash([{ beat: 'a', screen: 'b' }])
    expect(withEmptyState).toBe('849092e16a6b')
    expect(withEmptyState).toBe(withNoState)
  })
})

describe('AC-20260917-02-5: raw vs normalised state spelling produce different hashes', () => {
  it('the same steps hash differently for the raw meta.states spelling ("empty") vs the normalised example-key spelling ("Empty") — the served `beats` must be the raw one', () => {
    const raw = beatHash([
      { beat: 'I open the app', screen: 'home' },
      { beat: 'I tap Sign in', screen: 'login', state: 'empty' },
    ])
    const normalised = beatHash([
      { beat: 'I open the app', screen: 'home' },
      { beat: 'I tap Sign in', screen: 'login', state: 'Empty' },
    ])
    expect(raw).toBe('7c0be20327a0')
    expect(normalised).toBe('49ef1e488591')
    expect(raw).not.toBe(normalised)
  })
})

describe('AC-20260917-02-21: a stateless step continues to resolve, serve and hash as stateless', () => {
  it('a step with no state hashes the same whether or not neighbouring steps carry one', () => {
    const stateless = beatHash([{ beat: 'I open the app', screen: 'home' }])
    expect(stateless).toBe('b87021072adb')
    expect(stateless).not.toBeNull()
  })
})

describe('AC-20260917-02-3/-4: beatlessStep', () => {
  it('returns the 1-based index of the first step with no beat', () => {
    expect(
      beatlessStep({
        steps: [{ beat: 'I open the app' }, {}, { beat: 'I tap Account' }],
      }),
    ).toBe(2)
  })

  it('returns null when every step carries a beat', () => {
    expect(
      beatlessStep({
        steps: [{ beat: 'I open the app' }, { beat: 'I tap Account' }],
      }),
    ).toBeNull()
  })

  it('returns null for a journey with zero steps', () => {
    expect(beatlessStep({ steps: [] })).toBeNull()
  })
})
