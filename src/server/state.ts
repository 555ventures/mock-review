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
import { resolveState } from '../ui/frame/stateKey.js'
import { journeyReport, type JourneyInput } from '../analysis/journeys.js'
import { beatHash } from '../analysis/beats.js'
import { inventory } from '../analysis/inventory.js'
import { ensureDesignFiles, readDesignDoc } from '../files/json.js'
import { EMPTY_APPROVAL, EMPTY_NOTES } from '../schemas/index.js'
import type { Approval, Notes, Shell } from '../schemas/index.js'
import type { DocOutcome, ServerInventoryRow, ServerJourney, ServerScreen, ServerState } from '../schemas/patches.js'

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

/** D21: a journey `Step.state` is written in `meta.states` spelling; it is resolved once,
 * server-side, to its example key by `resolveStates`' rule (exact, then unique normalised — spec
 * 03 D4/D8), so no page or plugin consumer ever needs to compare states case-insensitively again.
 * An unresolved or ambiguous state passes through unchanged. */
function normaliseStepState(exampleKeys: readonly string[], state: string): string {
  return resolveState(exampleKeys, state) ?? state
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

    const resolved = journeyReport(journeyInputs, (screenName) => {
      const screen = screens.find((s) => s.name === screenName)
      return screen ? pickDefaultHtml(screen, screenResult.htmlByScreen) : undefined
    })

    // D5: `beats` is hashed here, over `journeyReport`'s raw steps — BEFORE the state-normalising
    // map below rewrites each step's `state` to the host's example key. The driver hashes the
    // seed's raw spelling, and `--mark journey-drawn` already enforces `check --json` steps ==
    // seed beats, so raw is the only spelling that can ever equal the driver's own hash (D5, A2).
    journeys = resolved.map((journey): ServerJourney => {
      const rawSteps: { screen: string; beat?: string | undefined; state?: string | undefined }[] = journey.steps
      const beats = beatHash(rawSteps)
      const steps = rawSteps.map((step) => {
        if (step.state === undefined) return step
        const screen = screens.find((s) => s.name === step.screen)
        return { ...step, state: normaliseStepState(screen?.examples ?? [], step.state) }
      })
      return { ...journey, steps, beats }
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

  // D1/D3: one verdict, from `readDesignDoc` — never this file's own `try { readJson(...) }
  // catch`. `ok: false` means the file EXISTS and could not be used; `ensureDesignFiles` above
  // already created it when absent, so a still-failing read here is a genuine parse/shape
  // failure, never a missing file. On failure the wire `notes`/`approval` value stays the
  // documented EMPTY_* PLACEHOLDER — it is not a claim that the file is actually empty, and the
  // caller must read `documents.<doc>.ok` to know whether to trust it. Every other field
  // (`screens`, `shells`, `journeys`, `themes`, `config`, `inventory`) is unaffected by either
  // read failing (D3) — they're built entirely above, before this block runs.
  const notesRead = readDesignDoc(cwd, 'notes')
  // `readDesignDoc`'s return type is keyed on the runtime `kind` argument, not narrowed by it —
  // the cast is safe because `kind: 'notes'` above guarantees `doc` is a `Notes`.
  const notes: Notes = notesRead.ok ? (notesRead.doc as Notes) : EMPTY_NOTES
  const notesOutcome: DocOutcome = notesRead.ok ? { ok: true } : { ok: false, error: notesRead.error }

  const approvalRead = readDesignDoc(cwd, 'approval')
  const approval: Approval = approvalRead.ok ? (approvalRead.doc as Approval) : EMPTY_APPROVAL
  const approvalOutcome: DocOutcome = approvalRead.ok ? { ok: true } : { ok: false, error: approvalRead.error }

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
    documents: { notes: notesOutcome, approval: approvalOutcome },
  }
}
