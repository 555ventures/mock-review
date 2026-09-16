import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { renderToString } from 'react-dom/server'
import type { Finding, Screen } from '../schemas/index.js'
import { importsOf, shellOf } from './imports.js'
import type { Runner } from './vite-runner.js'
import type { DiscoveredFile } from './discover.js'

type ScreenModule = {
  meta?: { name?: string; states?: string[] }
  examples?: Record<string, unknown>
}

export type ScreenReportResult = {
  screens: Screen[]
  findings: Finding[]
  /** Screen name -> import specifiers (feeds `usedOn` in the sweep inventory). */
  specifiersByScreen: Map<string, string[]>
  /** Screen name -> example key -> its rendered HTML (successful renders only). */
  htmlByScreen: Map<string, Record<string, string>>
  /** D21: screen name -> `Object.keys(examples)` (every declared example, render success or not;
   * `[]` for a screen whose module cannot be imported at all). Feeds `ServerScreenSchema.examples`
   * — the page's state list source (D3/D21), distinct from `htmlByScreen`'s render-only keys. */
  examplesByScreen: Map<string, string[]>
}

/**
 * D5/D6/D17/D19(d): one pass per discovered screen — hash and line count from the raw bytes,
 * `meta`/`examples` loaded through the Vite runner, a `render` finding per throwing example
 * (`message: "<examples key>: <error.message>"` per D17's ruling on D5 vs the former AC-8
 * literal), a `size` warning over 150 lines, and a `states` warning per `meta.states` entry with
 * no case-insensitively matching `examples` key. A screen whose module import itself throws
 * (not per-example) reports exactly one `render` finding, `"module failed to load:
 * <error.message>"` (D17), and skips meta/examples processing entirely — no `meta: missing`
 * follow-on finding (D19(d)). A screen whose module *loads* but has no `meta` still reports
 * `states: []` plus a `render` finding `meta: missing` (D6). Both cases keep the screen's row in
 * `screens[]` with `states: []`.
 */
export async function screenReport(
  cwd: string,
  runner: Runner,
  discovered: DiscoveredFile[],
): Promise<ScreenReportResult> {
  const findings: Finding[] = []
  const screens: Screen[] = []
  const specifiersByScreen = new Map<string, string[]>()
  const htmlByScreen = new Map<string, Record<string, string>>()
  const examplesByScreen = new Map<string, string[]>()

  for (const d of discovered) {
    const abs = path.join(cwd, d.file)
    const bytes = readFileSync(abs)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const lines = bytes.toString('utf8').split('\n').length
    const specifiers = importsOf(abs)
    specifiersByScreen.set(d.name, specifiers)
    const shell = shellOf(specifiers)

    let mod: ScreenModule | undefined
    let importFailed = false
    try {
      mod = (await runner.import(abs)) as ScreenModule
    } catch (err) {
      importFailed = true
      const message = err instanceof Error ? err.message : String(err)
      findings.push({ kind: 'render', severity: 'error', file: d.file, message: `module failed to load: ${message}` })
    }

    if (importFailed) {
      examplesByScreen.set(d.name, [])
      screens.push({ name: d.name, file: d.file, states: [], shell, hash, lines })
      continue
    }

    if (!mod || !mod.meta) {
      findings.push({ kind: 'render', severity: 'error', file: d.file, message: 'meta: missing' })
      examplesByScreen.set(d.name, Object.keys(mod?.examples ?? {}))
      screens.push({ name: d.name, file: d.file, states: [], shell, hash, lines })
      continue
    }

    const states = mod.meta.states ?? []
    const examples = mod.examples ?? {}
    examplesByScreen.set(d.name, Object.keys(examples))
    const html: Record<string, string> = {}

    for (const [stateName, node] of Object.entries(examples)) {
      try {
        html[stateName] = renderToString(node as never)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        findings.push({ kind: 'render', severity: 'error', file: d.file, message: `${stateName}: ${message}` })
      }
    }
    htmlByScreen.set(d.name, html)

    if (lines > 150) {
      findings.push({ kind: 'size', severity: 'warn', file: d.file, message: `${lines} lines` })
    }

    for (const state of states) {
      const hasExample = Object.keys(examples).some((k) => k.toLowerCase() === state.toLowerCase())
      if (!hasExample) {
        findings.push({ kind: 'states', severity: 'warn', file: d.file, message: `state ${state} has no example` })
      }
    }

    screens.push({ name: d.name, file: d.file, states, shell, hash, lines })
  }

  return { screens, findings, specifiersByScreen, htmlByScreen, examplesByScreen }
}

/**
 * D7: the default example for journey resolution — the one named like `meta.states[0]`
 * (case-insensitively), or failing that the first `examples` entry.
 */
export function pickDefaultHtml(screen: Screen, htmlByScreen: Map<string, Record<string, string>>): string | undefined {
  const html = htmlByScreen.get(screen.name)
  if (!html) return undefined

  const keys = Object.keys(html)
  const firstState = screen.states[0]
  if (firstState) {
    const match = keys.find((k) => k.toLowerCase() === firstState.toLowerCase())
    if (match) return html[match]
  }
  const first = keys[0]
  return first ? html[first] : undefined
}
