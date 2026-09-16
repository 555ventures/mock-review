// AC-20260915-02-17 (D22): `check --look` folds `approval.theme` into the frame URL as
// `_theme=<key>` (the frame no longer fetches `GET state`, D20, so a capture must carry the theme
// itself). Exercised as a true unit test of `look()`'s own URL construction — no real browser, no
// running serve: `resolvePlaywright` resolves `playwright` from the host root via Node's own
// module resolution, so a scratch root with a fake `node_modules/playwright` whose `chromium`
// records every `goto` URL onto a process-global array is a real (if minimal) module Node
// actually loads, not a mock swapped in over an import — `look.ts` never imports `playwright`
// statically, by design (spec 01/02 must load with no `playwright` present at all).
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { registerScratchDir } from '../helpers/cli.js'
import { look } from '../../src/analysis/look.js'
import type { Config } from '../../src/schemas/index.js'

declare global {
  var __lookTestGotoUrls: string[] | undefined
}

/** Builds a scratch host whose `node_modules/playwright` is a minimal fake: `chromium.launch()`
 * returns a browser/page pair whose `page.goto(url)` records `url` onto
 * `globalThis.__lookTestGotoUrls` (shared process memory — the fake module and this test run in
 * the same Node process) instead of opening a real browser, and whose `page.screenshot()` writes
 * a tiny valid-enough PNG buffer so `look()`'s own `writeFileSync`-free flow (it uses the page's
 * own `screenshot({ path })`) completes normally. */
function buildFakePlaywrightRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'mock-review-look-unit-'))
  registerScratchDir(root)
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'scratch-host' }))

  const pkgDir = path.join(root, 'node_modules', 'playwright')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'playwright', main: 'index.cjs' }))
  writeFileSync(
    path.join(pkgDir, 'index.cjs'),
    [
      'const PNG_1x1 = Buffer.from(',
      '  "89504e470d0a1a0a0000000d49484452000000010000000108020000009077" +',
      '  "5305000000017352474200aece1ce90000000467414d410000b18f0bfc6105" +',
      '  "0000000774494d4507e40e13000200008fd0d40e0000000c49444154789c63" +',
      '  "60000002000155a1a5a80000000049454e44ae426082",',
      '  "hex",',
      ')',
      'function fakePage() {',
      '  return {',
      '    async goto(url) {',
      '      (globalThis.__lookTestGotoUrls ??= []).push(url)',
      '    },',
      '    async screenshot({ path: p }) {',
      '      require("node:fs").writeFileSync(p, PNG_1x1)',
      '      return PNG_1x1',
      '    },',
      '    async close() {},',
      '  }',
      '}',
      'exports.chromium = {',
      '  async launch() {',
      '    return {',
      '      async newPage() {',
      '        return fakePage()',
      '      },',
      '      async close() {},',
      '    }',
      '  },',
      '}',
      '',
    ].join('\n'),
  )
  return root
}

const config: Config = {
  name: 'app',
  port: 5180,
  targets: { viewports: ['1280x800'], schemes: ['light'] },
  theme: null,
  client: { token: 'replace-me' },
}

describe("AC-20260915-02-17 (D22): look()'s _theme URL construction", () => {
  it('folds approval.theme into the frame URL as _theme=<key> when a theme is passed', async () => {
    const root = buildFakePlaywrightRoot()
    globalThis.__lookTestGotoUrls = []

    await look({
      root,
      screen: 'home',
      state: 'Default',
      serveUrl: 'http://127.0.0.1:9999',
      config,
      states: ['Default'],
      theme: 'nova',
    })

    const urls = globalThis.__lookTestGotoUrls ?? []
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('&_theme=nova')
    expect(urls[0]).toContain('/?frame=1&_theme=nova#/home?state=Default&scheme=light')
  })

  it('omits _theme entirely when no theme is passed', async () => {
    const root = buildFakePlaywrightRoot()
    globalThis.__lookTestGotoUrls = []

    await look({
      root,
      screen: 'home',
      state: 'Default',
      serveUrl: 'http://127.0.0.1:9999',
      config,
      states: ['Default'],
    })

    const urls = globalThis.__lookTestGotoUrls ?? []
    expect(urls).toHaveLength(1)
    expect(urls[0]).not.toContain('_theme')
    expect(urls[0]).toContain('/?frame=1#/home?state=Default&scheme=light')
  })
})
