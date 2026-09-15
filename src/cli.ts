#!/usr/bin/env node
// D2/D19(b): `mock-review <verb> [flags]` dispatcher. Every JSON verb writes exactly one JSON
// line to stdout; every diagnostic (usage, refusal, unexpected error) goes to stderr as
// `mock-review: <reason>` with exit code 2. Each verb module is loaded with a dynamic `import()`
// inside its own dispatch branch — only `args.js`/`io.js` (no Vite/analysis/server transitively)
// load statically, so `contract` never pulls in Vite. `serve` never returns during normal
// operation — its own signal handlers call `process.exit` directly.
import { parseArgs } from './cli/args.js'
import { CliError, printJson } from './cli/io.js'

async function main(argv: string[]): Promise<number> {
  const { verb, json, values, flags } = parseArgs(argv)
  const cwd = process.cwd()

  switch (verb) {
    case 'contract': {
      const { contractVerb } = await import('./cli/contract.js')
      printJson(contractVerb())
      return 0
    }

    case 'check': {
      const { checkVerb, formatCheckText } = await import('./cli/check.js')
      const check = await checkVerb(cwd, flags.has('look'))
      if (json) printJson(check)
      else process.stdout.write(formatCheckText(check))
      return 0
    }

    case 'sweep': {
      const { sweepVerb, formatSweepText } = await import('./cli/sweep.js')
      const sweep = sweepVerb(cwd)
      if (json) printJson(sweep)
      else process.stdout.write(formatSweepText(sweep))
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
      process.stdout.write(result + '\n')
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
    process.exitCode = code
  })
  .catch((err: unknown) => {
    const message = err instanceof CliError ? err.message : err instanceof Error ? err.message : String(err)
    process.stderr.write(`mock-review: ${message}\n`)
    process.exitCode = 2
  })
