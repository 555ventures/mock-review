// D5-D8/D12/D23: the `check` verb — JSON and text forms over the analysis layer's `runCheck`,
// plus D12's `--look <screen> [--state <s>]` Playwright capture.
import path from 'node:path'
import { runCheck } from '../analysis/check.js'
import { serveUrl } from '../analysis/liveness.js'
import { look } from '../analysis/look.js'
import { readJson } from '../files/json.js'
import { ApprovalSchema } from '../schemas/index.js'
import type { Check, Config } from '../schemas/index.js'
import { ServerStateSchema } from '../schemas/patches.js'
import { fail, writeFlushed } from './io.js'

/** D23: `--theme` for `check --look`'s frame captures — `approval.theme` when the file is
 * readable and a theme is picked, `undefined` otherwise (a missing/unreadable/theme-less
 * `design/approval.json` never fails the capture). */
function themeFor(cwd: string): string | undefined {
  try {
    const approval = readJson(path.join(cwd, 'design', 'approval.json'), ApprovalSchema)
    return approval.theme ?? undefined
  } catch {
    return undefined
  }
}

/** D21/review-2: when `--state` is omitted, `--look` must capture every state using the same
 * casing D21 already normalized the page to (`Object.keys(examples)`), not `check --json`'s raw
 * `meta.states` — otherwise a screen declaring `meta.states: ['Default']` but exporting
 * `examples.Default` would still write `home-default-...png` from this path while
 * `--look home --state Default` writes `home-Default-...png` for the very same state. `--look`
 * already requires a running `serve` (D12), so this reads that server's own `GET state` (D21's
 * source of truth for state casing) instead of recomputing anything. */
async function exampleStatesFor(serveBaseUrl: string, screen: string): Promise<string[]> {
  const res = await fetch(`${serveBaseUrl}/__mock-review/state`)
  const state = ServerStateSchema.parse(await res.json())
  return state.screens.find((s) => s.name === screen)?.examples ?? []
}

/**
 * D12/D23: when `screen` is given (`--look <screen>` was passed with a screen name), captures
 * screenshots and exits the process directly once its one-path-per-line output has flushed
 * (D20's "flush then exit explicitly" pattern) — this bypasses the dispatcher's own `check`
 * JSON/text printing entirely, since a look's stdout contract (paths, not a `Check`) is
 * unconditional regardless of `--json`. `screen` undefined and `lookRequested` false means
 * `--look` was not passed at all: spec 01's plain `check` behavior. `lookRequested` true with
 * `screen` undefined is a bare `--look` with no screen name (D23): exit 2.
 */
export async function checkVerb(
  cwd: string,
  screen?: string,
  state?: string,
  lookRequested = screen !== undefined,
): Promise<Check> {
  if (lookRequested) {
    if (screen === undefined) fail('--look needs a screen name — remedy: mock-review check --look <screen>')

    const url = await serveUrl(cwd)
    if (url === null) fail('--look needs a running serve — remedy: npx mock-review serve')

    const check = await runCheck(cwd)
    const found = check.screens.find((s) => s.name === screen)
    if (!found) fail(`--look: unknown screen ${screen}`)

    let states: string[] = []
    if (state === undefined) {
      states = await exampleStatesFor(url, screen)
      // D23/pass-3: an empty `examples` (D21: the screen's module failed to import) means the
      // capture loop below would run zero times — writing nothing and exiting 0 is exactly the
      // silent success D23 already refused for the unknown-screen and bare-`--look` cases, so
      // this is refused the same way instead of quietly doing nothing.
      if (states.length === 0) {
        fail(`--look: ${screen} has no states to capture (its module failed to load)`)
      }
    }

    const config = check.config
    if (config.name === null || config.targets === null || config.client === null) {
      fail('--look needs a valid mock.config.ts')
    }
    const resolvedConfig: Config = config
    const theme = themeFor(cwd)

    const paths = await look({
      root: cwd,
      screen,
      serveUrl: url,
      config: resolvedConfig,
      states,
      ...(state !== undefined ? { state } : {}),
      ...(theme !== undefined ? { theme } : {}),
    })
    await writeFlushed(process.stdout, paths.map((p) => `${p}\n`).join(''))
    process.exit(0)
  }

  return runCheck(cwd)
}

/** File Plan: text form — one line per finding, then `ok`/`not ok`. */
export function formatCheckText(check: Check): string {
  const lines = check.findings.map((f) => `${f.severity} ${f.kind} ${f.file}: ${f.message}`)
  lines.push(check.ok ? 'ok' : 'not ok')
  return lines.join('\n') + '\n'
}
