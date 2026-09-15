// D2: `mock-review <verb> [flags]` — `--json` is accepted at any argv position; every other
// `--name` flag either consumes the following token as its value (when that token is not itself
// a flag) or is recorded as a bare boolean flag (e.g. `check --look`).
export type ParsedArgs = {
  verb: string | undefined
  json: boolean
  values: Record<string, string>
  flags: Set<string>
}

export function parseArgs(argv: string[]): ParsedArgs {
  let verb: string | undefined
  let json = false
  const values: Record<string, string> = {}
  const flags = new Set<string>()

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === undefined) continue

    if (token === '--json') {
      json = true
      continue
    }

    if (token.startsWith('--')) {
      const name = token.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        values[name] = next
        i++
      } else {
        flags.add(name)
      }
      continue
    }

    if (verb === undefined) verb = token
  }

  return { verb, json, values, flags }
}
