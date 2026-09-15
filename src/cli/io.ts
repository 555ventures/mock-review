// D2: every JSON verb writes exactly one `JSON.stringify(result) + "\n"` to stdout and nothing
// else; every diagnostic (including a refusal) goes to stderr as `mock-review: <reason>`, exit 2.
// `fail` throws rather than calling `process.exit` directly so callers (Vite servers, open file
// handles) get a chance to be caught and the dispatcher can print a clean, single stderr line.
export class CliError extends Error {}

export function printJson(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

export function fail(reason: string): never {
  throw new CliError(reason)
}
