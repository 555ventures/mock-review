// AC-20260916-01-1 (D1-D5 of specs/20260916/01): `mockReview()` (no options — D4 removes
// `standalone`) must carry one unconditional, object-form `hotUpdate: { order: 'pre', handler }`.
// The handler is invoked directly here with a fake `this`/`options` (D1's Contracts block gives
// the exact fixture shape), so this is a true unit test of the classifier — no real Vite server,
// no filesystem.
import { describe, expect, it, vi } from 'vitest'
import type { HotUpdateOptions, Plugin } from 'vite'
import { mockReview } from '../../src/server/plugin.js'

/** The handler's `this` — only `environment.name` and `environment.hot.send` are ever touched
 * (Contracts block), so this fixture supplies exactly those two and nothing else. */
type FakeThis = { environment: { name: string; hot: { send: (event: string, data: unknown) => void } } }

function fakeThis(name: string, send: (event: string, data: unknown) => void): FakeThis {
  return { environment: { name, hot: { send } } }
}

/** A `HotUpdateOptions` fixture — only `type`, `file`, and `server.config.root` are read by the
 * classifier (Contracts block: `rootRelative(options.server.config.root, options.file)`); the
 * rest of the real interface (`timestamp`, `modules`, `read`, the rest of `server`) is never
 * touched, so this fixture supplies only those three fields and is cast through `unknown` to
 * satisfy the full `HotUpdateOptions` parameter type. */
function fakeOptions(type: HotUpdateOptions['type'], file: string, root: string): HotUpdateOptions {
  return { type, file, server: { config: { root } } } as unknown as HotUpdateOptions
}

/** Narrows `plugin.hotUpdate` (an `ObjectHook`: a plain function or `{ handler, order, ... }`)
 * down to the object form AC-1 requires, without `as any`/`!` — a plain-function survivor of the
 * old `standalone`-gated hook fails this narrowing itself, which is exactly the RED this test
 * needs to catch. */
function objectHotUpdate(plugin: Plugin): { order?: string; handler: (this: FakeThis, options: HotUpdateOptions) => Array<unknown> | void } {
  const hu = plugin.hotUpdate
  if (typeof hu !== 'object' || hu === null) {
    throw new Error('plugin.hotUpdate is not an object hook (expected { order, handler })')
  }
  return hu as unknown as { order?: string; handler: (this: FakeThis, options: HotUpdateOptions) => Array<unknown> | void }
}

describe('AC-20260916-01-1: mockReview() carries one unconditional, order: "pre" hotUpdate hook', () => {
  it('AC-20260916-01-1: hotUpdate is an object with order === "pre" and a handler function', () => {
    const plugin = mockReview()
    const hu = objectHotUpdate(plugin)
    expect(hu.order).toBe('pre')
    expect(typeof hu.handler).toBe('function')
  })

  it.each([
    { type: 'update' as const, file: '/host/design/notes.json' },
    { type: 'create' as const, file: '/host/design/notes.json.tmp' },
    { type: 'delete' as const, file: '/host/design/mocks/ledger.md' },
    { type: 'update' as const, file: '/host/design/shell/app.html' },
  ])('AC-20260916-01-1: $file returns [] and sends nothing (client environment)', ({ type, file }) => {
    const send = vi.fn()
    const plugin = mockReview()
    const hu = objectHotUpdate(plugin)
    const result = hu.handler.call(fakeThis('client', send), fakeOptions(type, file, '/host'))
    expect(result).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('AC-20260916-01-1: a src/** file returns [] and sends mock-review:frame-reload exactly once', () => {
    const send = vi.fn()
    const plugin = mockReview()
    const hu = objectHotUpdate(plugin)
    const result = hu.handler.call(
      fakeThis('client', send),
      fakeOptions('update', '/host/src/screens/home.tsx', '/host'),
    )
    expect(result).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('mock-review:frame-reload', { file: 'src/screens/home.tsx' })
  })

  it.each([
    { name: 'a file outside design/ and src/', type: 'update' as const, file: '/host/mock.config.ts', root: '/host', env: 'client' },
    { name: 'a file outside the root entirely', type: 'update' as const, file: '/elsewhere/design/notes.json', root: '/host', env: 'client' },
    { name: 'a design/ file in the ssr environment', type: 'update' as const, file: '/host/design/notes.json', root: '/host', env: 'ssr' },
  ])('AC-20260916-01-1: $name returns undefined with zero sends', ({ type, file, root, env }) => {
    const send = vi.fn()
    const plugin = mockReview()
    const hu = objectHotUpdate(plugin)
    const result = hu.handler.call(fakeThis(env, send), fakeOptions(type, file, root))
    expect(result).toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })
})
