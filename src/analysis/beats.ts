import { createHash } from 'node:crypto'

/** The one hash of a journey's story. `null` when there is nothing confirmable: no steps at all,
 * or any step without a beat. The `state ? … : ''` falsy test is the plugin's, copied deliberately
 * — an empty-string state hashes identically to no state on BOTH sides, and "fixing" it here would
 * make the two implementations disagree. The steps handed in are the RAW ones `check --json`
 * echoes, never `buildState`'s normalised ones (D5). Mirrors
 * `claude-plugins/spec/scripts/lib/surfaces.js:54-59` exactly (A1, executed). */
export function beatHash(steps: readonly { screen: string; beat?: string | undefined; state?: string | undefined }[]): string | null {
  if (steps.length === 0) return null
  if (steps.some((s) => s.beat === undefined)) return null
  const canonical = steps.map((s) => `${s.beat} -> ${s.screen}` + (s.state ? `@${s.state}` : '')).join('\n')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

/** D3: the 1-based index of the first step with no beat, or `null` when every step has one
 * (including a journey with zero steps). */
export function beatlessStep(journey: { steps: readonly { beat?: string | undefined }[] }): number | null {
  const index = journey.steps.findIndex((s) => s.beat === undefined)
  return index === -1 ? null : index + 1
}
