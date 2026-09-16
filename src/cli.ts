#!/usr/bin/env node
// D2/D19(b)/D20: `mock-review <verb> [flags]` dispatcher. Every JSON verb writes exactly one JSON
// line to stdout; every diagnostic (usage, refusal, unexpected error) goes to stderr as
// `mock-review: <reason>` with exit code 2. Each verb module is loaded with a dynamic `import()`
// inside its own dispatch branch — only `args.js`/`io.js` (no Vite/analysis/server transitively)
// load statically, so `contract` never pulls in Vite. D20: every one-shot verb (and every refusal
// path) ends the process with an explicit `process.exit` once its output has flushed — a handle
// that survives `server.close()` (Vite's watcher or similar) can otherwise keep the event loop
// alive indefinitely, so `process.exitCode` alone is not enough. `serve` is unchanged: it owns its
// own signal-driven exit and never resolves during normal operation.
import { parseArgs } from './cli/args.js'
import { CliError, printJson, writeFlushed } from './cli/io.js'

async function main(argv: string[]): Promise<number> {
  const { verb, json, values, flags } = parseArgs(argv)
  const cwd = process.cwd()

  switch (verb) {
    case 'contract': {
      const { contractVerb } = await import('./cli/contract.js')
      await printJson(contractVerb())
      return 0
    }

    case 'check': {
      const { checkVerb, formatCheckText } = await import('./cli/check.js')
      // D23: `--look` with no screen name (`flags.has('look')` but no `values.look`, e.g. a bare
      // trailing `--look`) is a distinct refusal from `check` never having named `--look` at all.
      const check = await checkVerb(cwd, values.look, values.state, flags.has('look') || values.look !== undefined)
      if (json) await printJson(check)
      else await writeFlushed(process.stdout, formatCheckText(check))
      return 0
    }

    case 'sweep': {
      const { sweepVerb, formatSweepText } = await import('./cli/sweep.js')
      const sweep = sweepVerb(cwd)
      if (json) await printJson(sweep)
      else await writeFlushed(process.stdout, formatSweepText(sweep))
      return 0
    }

    case 'answer': {
      const { answerVerb } = await import('./cli/answer.js')
      const result = answerVerb(cwd, {
        note: values.note,
        journey: values.journey,
        text: values.text,
        decision: values.decision,
      })
      await writeFlushed(process.stdout, result + '\n')
      return 0
    }

    case 'serve': {
      const { serveVerb } = await import('./cli/serve.js')
      // Never resolves during normal operation; the process exits from within `startServe`'s own
      // signal handlers.
      await serveVerb(cwd)
      return 0
    }

    default: {
      throw new CliError(`unknown verb ${verb ?? '(none)'}`)
    }
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exit(code)
  })
  .catch(async (err: unknown) => {
    const message = err instanceof CliError ? err.message : err instanceof Error ? err.message : String(err)
    await writeFlushed(process.stderr, `mock-review: ${message}\n`)
    process.exit(2)
  })
