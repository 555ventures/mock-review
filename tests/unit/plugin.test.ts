// AC-20260916-01-1 (D1-D5 of specs/20260916/01): `mockReview()` (no options — D4 removes
// `standalone`) must carry one unconditional, object-form `hotUpdate: { order: 'pre', handler }`.
// The handler is invoked directly here with a fake `this`/`options` (D1's Contracts block gives
// the exact fixture shape), so this is a true unit test of the classifier — no real Vite server,
// no filesystem.
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { HotUpdateOptions, Plugin } from 'vite'
import { mockReview } from '../../src/server/plugin.js'
import { registerScratchDir } from '../helpers/cli.js'

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

// AC-20260916-02-3, AC-20260916-02-4 (D1/D2): `configureServer`'s `getRunner` narrows
// `server.environments.ssr` through `runnerOf` (shape, not `instanceof`), using
// `this.meta.viteVersion` captured once at the top of the hook. Exercised the same way as the
// hotUpdate suite above — a fake `this`/fake server invoke the real `configureServer`, and the
// real middleware it registers is invoked directly — no real Vite server, no filesystem beyond a
// scratch `mock.config.ts` the stub runner never actually reads (its `import()` is faked to
// always return the same fixed module, regardless of path — needed only so
// `analysis/config.ts::loadConfig`'s `existsSync(mock.config.ts)` guard passes; the spec's own
// illustrative root `/h` is never a real directory, so a real scratch root stands in for it here).

type FakeConfigureServerThis = { meta: { viteVersion: string } }

type FakeReq = {
  method: string
  url: string
  headers: Record<string, string>
  socket: { remoteAddress: string }
}

type FakeRes = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (chunk?: string) => void
}

type CapturedHandler = (req: FakeReq, res: FakeRes, next: (err?: unknown) => void) => void

function loopbackGet(pathname: string): FakeReq {
  return { method: 'GET', url: pathname, headers: {}, socket: { remoteAddress: '127.0.0.1' } }
}

/** Calls the real `configureServer` with a fake `this`/server (per the ACs' Contracts fixture)
 * and returns the one middleware it registers via `server.middlewares.use`. */
function captureConfigureServerMiddleware(fakeThis: FakeConfigureServerThis, fakeServer: Record<string, unknown>): CapturedHandler {
  const plugin = mockReview()
  const configureServer = plugin.configureServer as unknown as (this: FakeConfigureServerThis, server: unknown) => void
  let captured: CapturedHandler | undefined
  configureServer.call(fakeThis, { ...fakeServer, middlewares: { use: (fn: CapturedHandler) => (captured = fn) } })
  if (!captured) throw new Error('configureServer never registered its middleware')
  return captured
}

/** Drives one request through a captured middleware and resolves once the response ends (200/etc)
 * or `next(err)` is called — mirroring the real `.catch(next)` wrapper around the async IIFE in
 * `configureServer`. `ended` distinguishes "answered" from "never answered" more robustly than
 * `status` alone, since a fake `res.statusCode` starts at 200 by default (mirroring real
 * `http.ServerResponse`) whether or not `end()` was ever called. */
function runMiddleware(handler: CapturedHandler, req: FakeReq): Promise<{ ended: boolean; status: number; body: string; error?: unknown }> {
  return new Promise((resolve) => {
    let body = ''
    let ended = false
    const res: FakeRes = {
      statusCode: 200,
      setHeader: () => {},
      end: (chunk) => {
        ended = true
        if (chunk) body += chunk
        resolve({ ended, status: res.statusCode, body })
      },
    }
    const next = (err?: unknown) => resolve({ ended, status: res.statusCode, body, error: err })
    handler(req, res, next)
  })
}

describe('AC-20260916-02-3: configureServer narrows a non-instance ssr environment by shape', () => {
  it('AC-20260916-02-3: a plain-object runner.import env answers GET state with the loaded config, never null', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mock-review-plugin-ac3-'))
    registerScratchDir(root)
    // Never actually read: the fake ssr runner below always returns the same fixed module
    // regardless of the path it's asked to import. Its presence only satisfies loadConfig's
    // existsSync(mock.config.ts) guard so the runner path is reached at all.
    writeFileSync(path.join(root, 'mock.config.ts'), '// stub — never loaded by the fake runner\n')

    const fakeServer = {
      config: { root, server: { fs: { allow: [] } } },
      environments: {
        ssr: {
          runner: {
            import: async () => ({
              default: {
                name: 'fake',
                port: 5199,
                targets: { viewports: [], schemes: [] },
                theme: null,
                client: { token: 'x' },
              },
            }),
          },
        },
      },
    }

    const handler = captureConfigureServerMiddleware({ meta: { viteVersion: '8.9.9' } }, fakeServer)
    const result = await runMiddleware(handler, loopbackGet('/__mock-review/state'))

    expect(result.ended).toBe(true)
    expect(result.status).toBe(200)
    const parsed = JSON.parse(result.body) as { config: { name: string | null } }
    expect(parsed.config.name).toBe('fake')
  })
})

describe("AC-20260916-02-4: configureServer's getRunner throws by shape before any config work runs", () => {
  it('AC-20260916-02-4: a non-runnable ssr environment calls next(err) with the exact no-module-runner message and never answers', async () => {
    const fakeServer = {
      config: { root: '/h', server: { fs: { allow: [] } } },
      environments: { ssr: {} },
    }

    const handler = captureConfigureServerMiddleware({ meta: { viteVersion: '8.9.9' } }, fakeServer)
    const result = await runMiddleware(handler, loopbackGet('/__mock-review/state'))

    expect(result.ended).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect((result.error as Error).message).toBe(
      "the host's Vite ssr environment has no module runner (vite 8.9.9 at /h) — mock-review needs one vite 8 in the host",
    )
  })
})
