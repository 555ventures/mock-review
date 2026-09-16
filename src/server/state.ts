// D6: builds the `GET state` response — reuses spec 01's analysis layer (discover, screenReport,
// shellReport, journeyReport, inventory, loadConfig, the hash embedded in each Screen row) rather
// than reimplementing any of it. Refreshed on every request; `watch.ts` decides when a `files`
// SSE event means the page should ask for a fresh one.
import path from 'node:path'
import { discoverHost, type DiscoveredFile } from '../analysis/discover.js'
import type { Runner } from '../analysis/vite-runner.js'
import { loadConfig, NULL_CONFIG } from '../analysis/config.js'
import { screenReport, pickDefaultHtml } from '../analysis/screens.js'
import { shellReport } from '../analysis/shells.js'
import { journeyReport, type JourneyInput } from '../analysis/journeys.js'
import { inventory } from '../analysis/inventory.js'
import { ensureDesignFiles, readJson } from '../files/json.js'
import { ApprovalSchema, EMPTY_APPROVAL, EMPTY_NOTES, NotesSchema } from '../schemas/index.js'
import type { Shell } from '../schemas/index.js'
import type { ServerInventoryRow, ServerJourney, ServerScreen, ServerState } from '../schemas/patches.js'

/** D18(b): the component/shell module's own `examples` keys, `['Default']` when the module can't
 * be loaded at all (a readable module with a genuinely empty `examples` map keeps `[]`). */
async function moduleExamplesMap(
  cwd: string,
  runner: Runner,
  files: readonly DiscoveredFile[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  for (const file of files) {
    const abs = path.join(cwd, file.file)
    try {
      const mod = (await runner.import(abs)) as { examples?: Record<string, unknown> }
      map.set(file.name, Object.keys(mod.examples ?? {}))
    } catch {
      map.set(file.name, ['Default'])
    }
  }
  return map
}

/** D21: a journey `Step.state` is written in `meta.states` casing (D4); this normalises it once,
 * server-side, to its case-matched `examples` key (D3's actual state-list source), so no page or
 * plugin consumer ever needs to compare states case-insensitively again. A state with no matching
 * example key (an unresolved journey step) passes through unchanged. */
function normaliseStepState(exampleKeys: readonly string[], state: string): string {
  const match = exampleKeys.find((key) => key.toLowerCase() === state.toLowerCase())
  return match ?? state
}

/** D4: the optional fields the plugin's `journeys.ts` template gains on top of the analysis
 * layer's `JourneyInput` — read from the host module when present, dropped otherwise. */
type ServerJourneyInput = JourneyInput & {
  persona?: string
  steps: { screen: string; state?: string }[]
  edges: { from: number; to: number; label?: string; say?: string }[]
}

/**
 * D6/D20: builds one `ServerState` for `cwd`. `role` is decided by the caller (plugin.ts, from
 * the request's `Referer`/`?client=` token) since it has nothing to do with the host's own files.
 * `runner` is the *persistent* `serve` server's own `server.environments.ssr` runner
 * (plugin.ts) — never a fresh one-shot `createServer` (D20: a second Vite server pointed at the
 * same root computes a different config hash and deletes the shared `node_modules/.vite/deps`
 * out from under `serve`'s own optimizer, 504-ing every later frame request). Never throws: a
 * runner call that fails outright is recorded as one entry in `violations` and every
 * analysis-derived field falls back to empty/`NULL_CONFIG`, mirroring `runCheck`'s D5 behavior
 * note.
 */
export async function buildState(cwd: string, role: 'owner' | 'client', runner: Runner): Promise<ServerState> {
  ensureDesignFiles(cwd)

  const discovered = discoverHost(cwd)
  const violations: string[] = []

  let screens: ServerScreen[] = []
  let shells: Shell[] = []
  let journeys: ServerJourney[] = []
  let config: ServerState['config'] = NULL_CONFIG
  let inventoryRows: ServerInventoryRow[] = []

  try {
    const configResult = await loadConfig(cwd, runner)
    config = configResult.config
    if (configResult.finding) violations.push(configResult.finding.message)

    const screenResult = await screenReport(cwd, runner, discovered.screens)
    screens = screenResult.screens.map((screen): ServerScreen => ({
      ...screen,
      examples: screenResult.examplesByScreen.get(screen.name) ?? [],
    }))
    violations.push(...screenResult.findings.map((f) => f.message))

    shells = await shellReport(cwd, runner, discovered.shells)

    let journeyInputs: ServerJourneyInput[] = []
    if (discovered.journeysFile) {
      try {
        const mod = (await runner.import(path.join(cwd, discovered.journeysFile))) as {
          journeys?: ServerJourneyInput[]
        }
        journeyInputs = mod.journeys ?? []
      } catch {
        journeyInputs = []
      }
    }

    const resolved = journeyReport(journeyInputs, (screenName) => {
      const screen = screens.find((s) => s.name === screenName)
      return screen ? pickDefaultHtml(screen, screenResult.htmlByScreen) : undefined
    })

    journeys = resolved.map((journey, i): ServerJourney => {
      const input = journeyInputs[i]
      const rawSteps: { screen: string; state?: string }[] = input?.steps ?? journey.steps
      const steps = rawSteps.map((step) => {
        if (step.state === undefined) return step
        const screen = screens.find((s) => s.name === step.screen)
        return { ...step, state: normaliseStepState(screen?.examples ?? [], step.state) }
      })
      return {
        ...journey,
        ...(input?.persona !== undefined ? { persona: input.persona } : {}),
        steps,
        edges: journey.edges.map((edge, ei) => {
          const say = input?.edges[ei]?.say
          return say !== undefined ? { ...edge, say } : edge
        }),
      }
    })

    const specifiers = Array.from(screenResult.specifiersByScreen.entries()).map(([name, specs]) => ({
      name,
      specifiers: specs,
    }))
    const rows = inventory(cwd, discovered.components, discovered.shells, specifiers)
    const examplesByName = await moduleExamplesMap(cwd, runner, [...discovered.components, ...discovered.shells])
    inventoryRows = rows.map((row) => ({ ...row, examples: examplesByName.get(row.name) ?? ['Default'] }))
  } catch (err) {
    violations.push(err instanceof Error ? err.message : String(err))
  }

  const notesPath = path.join(cwd, 'design', 'notes.json')
  const approvalPath = path.join(cwd, 'design', 'approval.json')

  let notes = EMPTY_NOTES
  try {
    notes = readJson(notesPath, NotesSchema)
  } catch {
    // ensureDesignFiles just created it when absent; a still-unreadable file falls back to empty
    // rather than failing the whole state build.
  }

  let approval = EMPTY_APPROVAL
  try {
    approval = readJson(approvalPath, ApprovalSchema)
  } catch {
    // see above.
  }

  return {
    screens,
    shells,
    journeys,
    themes: discovered.themes.map((t) => t.name),
    config,
    inventory: inventoryRows,
    violations,
    notes,
    approval,
    role,
  }
}
