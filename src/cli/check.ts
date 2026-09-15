// D5-D8: the `check` verb — JSON and text forms over the analysis layer's `runCheck`.
import { runCheck } from '../analysis/check.js'
import type { Check } from '../schemas/index.js'
import { fail } from './io.js'

/** Contracts (spec 01): `check --look` is spec 02's page and refuses here verbatim. */
export async function checkVerb(cwd: string, hasLook: boolean): Promise<Check> {
  if (hasLook) fail('--look lands in spec 02')
  return runCheck(cwd)
}

/** File Plan: text form — one line per finding, then `ok`/`not ok`. */
export function formatCheckText(check: Check): string {
  const lines = check.findings.map((f) => `${f.severity} ${f.kind} ${f.file}: ${f.message}`)
  lines.push(check.ok ? 'ok' : 'not ok')
  return lines.join('\n') + '\n'
}
