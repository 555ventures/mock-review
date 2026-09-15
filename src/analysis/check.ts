import path from 'node:path'
import { CheckSchema } from '../schemas/index.js'
import type { Check, Finding, Journey, Screen, Shell } from '../schemas/index.js'
import { ensureDesignFiles } from '../files/json.js'
import { discoverHost } from './discover.js'
import { withRunner } from './vite-runner.js'
import { typeFindings } from './typecheck.js'
import { layerFindings } from './imports.js'
import { docFindings } from './docs.js'
import { screenReport, pickDefaultHtml } from './screens.js'
import { shellReport } from './shells.js'
import { journeyReport, type JourneyInput } from './journeys.js'
import { loadConfig, NULL_CONFIG } from './config.js'
import { serveUrl } from './liveness.js'

/**
 * D5-D8: composes the analysis modules into one `Check`, validated against `CheckSchema` before
 * return. Behavior order (spec 01): ensure design files (D9) -> discover (D3) -> open the Vite
 * runner and load config/screens/shells/journeys through it (D4/D5/D6/D7) -> close the runner ->
 * the TypeScript pass, layer/doc findings, and liveness (D5/D8). A runner that cannot start at
 * all (Vite refuses, `vite.config.ts` missing) reports one `config` finding naming
 * `vite.config.ts` and an otherwise-empty report, per D5's Behavior note.
 */
export async function runCheck(cwd: string): Promise<Check> {
  ensureDesignFiles(cwd)

  const discovered = discoverHost(cwd)
  const findings: Finding[] = []

  let screens: Screen[] = []
  let shells: Shell[] = []
  let journeys: Journey[] = []
  let config: Check['config'] = NULL_CONFIG

  try {
    await withRunner(cwd, async (runner) => {
      const configResult = await loadConfig(cwd, runner)
      config = configResult.config
      if (configResult.finding) findings.push(configResult.finding)

      const screenResult = await screenReport(cwd, runner, discovered.screens)
      screens = screenResult.screens
      findings.push(...screenResult.findings)

      shells = await shellReport(cwd, runner, discovered.shells)

      let journeyInputs: JourneyInput[] = []
      if (discovered.journeysFile) {
        try {
          const mod = (await runner.import(path.join(cwd, discovered.journeysFile))) as {
            journeys?: JourneyInput[]
          }
          journeyInputs = mod.journeys ?? []
        } catch {
          journeyInputs = []
        }
      }

      journeys = journeyReport(journeyInputs, (screenName) => {
        const screen = screens.find((s) => s.name === screenName)
        return screen ? pickDefaultHtml(screen, screenResult.htmlByScreen) : undefined
      })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    findings.push({ kind: 'config', severity: 'error', file: 'vite.config.ts', message })
  }

  const screenAbs = discovered.screens.map((s) => ({ ...s, abs: path.join(cwd, s.file) }))
  findings.push(...layerFindings(screenAbs))

  const docTargets = [...discovered.components, ...discovered.shells].map((f) => ({
    file: f.file,
    abs: path.join(cwd, f.file),
  }))
  findings.push(...docFindings(docTargets))

  findings.push(...typeFindings(cwd))

  const serve = { url: await serveUrl(cwd) }

  const check: Check = {
    contractVersion: 1,
    ok: !findings.some((f) => f.severity === 'error'),
    findings,
    screens,
    shells,
    journeys,
    themes: discovered.themes.map((t) => t.name),
    config,
    serve,
  }

  return CheckSchema.parse(check)
}
