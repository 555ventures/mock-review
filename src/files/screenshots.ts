import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** D23: matches `^<name>-<state>-<WxH>-<scheme>\.png$` exactly — a plain `startsWith(name + '-')`
 * also matched a sibling screen whose name shares `name` as a prefix (e.g. `home` matching
 * `home-detail-...png`). D3: moved verbatim from `src/server/plugin.ts:165-173` so the CLI's
 * `approve` verb and the server share one implementation of the `screenshots` field. */
export function screenshotsFor(cwd: string, name: string): string[] {
  const dir = path.join(cwd, 'design', 'screenshots')
  if (!existsSync(dir)) return []
  const pattern = new RegExp(`^${escapeRegExp(name)}-[^-]+-\\d+x\\d+-[^-]+\\.png$`)
  return readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort()
    .map((f) => path.posix.join('design', 'screenshots', f))
}
