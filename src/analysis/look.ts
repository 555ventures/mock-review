// D12: `check --look`'s Playwright capture. `playwright` is an optional peer resolved from the
// HOST root (never a static package import — spec 01/02's package must load with no `playwright`
// present at all), so an unresolvable module surfaces as a typed error the CLI wave maps to
// `mock-review: --look needs playwright — remedy: npm i -D playwright` (exit 2). The "no serve
// running" refusal is the CLI wave's job (src/analysis/liveness.ts's `serveUrl` already owns that
// probe) — this module only ever receives an already-live `serveUrl`.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Config } from '../schemas/index.js'
import { resolveHostModule } from './host-modules.js'
import { frameSrc } from '../ui/frame/frameRoute.js'

/** Thrown when `playwright` cannot be resolved from the host root. The message is exactly the
 * remedy text the dispatcher (src/cli.ts) prints after its `mock-review: ` prefix. */
export class PlaywrightUnresolvedError extends Error {}

type PlaywrightViewport = { width: number; height: number }

type PlaywrightPage = {
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' }): Promise<unknown>
  screenshot(options?: { path?: string }): Promise<Buffer>
  close?: () => Promise<void>
}

type PlaywrightBrowser = {
  newPage(options?: { viewport?: PlaywrightViewport | null }): Promise<PlaywrightPage>
  close(): Promise<void>
}

type PlaywrightModule = {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>
  }
}

/** The shape a dynamic `import()` of playwright's CJS entry actually produces: Node's CJS/ESM
 * interop can't statically detect its named exports (they're assigned dynamically), so only
 * `default` (the real `module.exports` object, carrying `chromium`) is reliable; a `chromium` key
 * appearing directly on the namespace (e.g. when resolution instead lands on an ESM-native entry)
 * is accepted too. */
type PlaywrightImport = Partial<PlaywrightModule> & { default?: PlaywrightModule }

/** Resolves `playwright` from `root` (the host, not this package) via `createRequire`, then loads
 * it with a dynamic `import()` so the package itself never statically depends on it. */
async function resolvePlaywright(root: string): Promise<PlaywrightModule> {
  let resolved: string
  try {
    resolved = resolveHostModule(root, 'playwright')
  } catch {
    throw new PlaywrightUnresolvedError('--look needs playwright — remedy: npm i -D playwright')
  }
  const imported = (await import(pathToFileURL(resolved).href)) as unknown as PlaywrightImport
  const mod = imported.default ?? imported
  if (!mod.chromium) {
    throw new PlaywrightUnresolvedError('--look needs playwright — remedy: npm i -D playwright')
  }
  return mod as PlaywrightModule
}

/** Parses a `WxH` viewport spec (D9's config shape) into numeric width/height. */
function parseViewport(spec: string): PlaywrightViewport {
  const [w, h] = spec.split('x')
  return { width: Number(w), height: Number(h) }
}

export type LookOptions = {
  /** The host root — where `design/screenshots/` is written and where `playwright` is resolved. */
  root: string
  screen: string
  /** A single state to capture; omit to capture every entry in `states`. */
  state?: string
  /** A live `serve` URL (already probed live by the caller, e.g. `src/analysis/liveness.ts`). */
  serveUrl: string
  config: Config
  /** The screen's full state list, used when `state` is omitted. */
  states: string[]
  /** D22: `approval.theme`, when one is picked — folded into the frame URL as `_theme=<key>` so a
   * capture carries the picked theme now that the frame no longer fetches `GET state` (D20). */
  theme?: string
}

/**
 * D12/D22: opens `<serveUrl>/?frame=1[&_theme=<theme>]#/<screen>?state=<s>&scheme=<scheme>` for
 * every `config.targets.viewports x config.targets.schemes x` (one state, or every state in
 * `states` when `state` is omitted) in headless Chromium at that viewport size, waits for network
 * idle, and writes `design/screenshots/<screen>-<state>-<WxH>-<scheme>.png`. Returns the written
 * paths, relative to `root`, in capture order. Always closes the browser, even on a mid-capture
 * failure.
 */
export async function look(options: LookOptions): Promise<string[]> {
  const { root, screen, state, serveUrl, config, states, theme } = options
  const playwright = await resolvePlaywright(root)
  const targetStates = state ? [state] : states

  const outDir = path.join(root, 'design', 'screenshots')
  mkdirSync(outDir, { recursive: true })

  const written: string[] = []
  const browser = await playwright.chromium.launch({ headless: true })
  try {
    for (const viewport of config.targets.viewports) {
      const size = parseViewport(viewport)
      for (const scheme of config.targets.schemes) {
        for (const s of targetStates) {
          const page = await browser.newPage({ viewport: size })
          try {
            // D20/D22: `_theme` is the frame's own top-level search param (the frame entry reads
            // it directly and never fetches `GET state`), distinct from the hash route's
            // `state`/`scheme` query.
            const url = `${serveUrl}${frameSrc({ kind: 'screen', screen, state: s, scheme }, theme ?? null)}`
            await page.goto(url, { waitUntil: 'networkidle' })
            const rel = `design/screenshots/${screen}-${s}-${viewport}-${scheme}.png`
            await page.screenshot({ path: path.join(root, rel) })
            written.push(rel)
          } finally {
            await page.close?.()
          }
        }
      }
    }
  } finally {
    await browser.close()
  }

  return written
}
