// AC-20260916-02-1, AC-20260916-02-2 (D2): `runnerOf`'s duck-typed narrowing of an ssr
// DevEnvironment — it accepts any object whose `runner.import` is a function (never checks
// `instanceof RunnableDevEnvironment`, which is exactly why today's host-run plugin mount 500s on
// a real environment from a different vite copy, spike S7) and throws the exact literal message
// from the Contracts table otherwise.
import { describe, expect, it } from 'vitest'
import { runnerOf } from '../../src/analysis/vite-runner.js'

describe('AC-20260916-02-1: runnerOf accepts a plain object shaped like a runnable ssr environment', () => {
  it('AC-20260916-02-1: delegates import() to env.runner.import with no class check', async () => {
    const env = { runner: { import: async (p: string) => ({ from: p }) } }
    const runner = runnerOf(env, { root: '/h', viteVersion: '8.3.0' })
    await expect(runner.import('/h/mock.config.ts')).resolves.toEqual({ from: '/h/mock.config.ts' })
  })
})

describe('AC-20260916-02-2: runnerOf throws the literal no-module-runner message for a non-runnable shape', () => {
  it.each([
    { name: 'empty object', env: {} },
    { name: 'undefined', env: undefined },
    { name: 'runner present but import missing', env: { runner: {} } },
    { name: 'runner.import present but not a function', env: { runner: { import: 'x' } } },
  ])('AC-20260916-02-2: $name throws exactly the literal message with the given root/viteVersion', ({ env }) => {
    expect(() => runnerOf(env, { root: '/h', viteVersion: '8.3.0' })).toThrow(
      "the host's Vite ssr environment has no module runner (vite 8.3.0 at /h) — mock-review needs one vite 8 in the host",
    )
  })
})
