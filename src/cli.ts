#!/usr/bin/env node
// D2: `mock-review <verb> [flags]` dispatcher. Every JSON verb writes exactly one JSON line to
// stdout; every diagnostic (usage, refusal, unexpected error) goes to stderr as
// `mock-review: <reason>` with exit code 2. `serve` never returns during normal operation — its
// own signal handlers call `process.exit` directly.
import { parseArgs } from './cli/args.js'
import { CliError, printJson } from './cli/io.js'
import { contractVerb } from './cli/contract.js'
import { checkVerb, formatCheckText } from './cli/check.js'
import { sweepVerb, formatSweepText } from './cli/sweep.js'
import { answerVerb } from './cli/answer.js'
import { serveVerb } from './cli/serve.js'

async function main(argv: string[]): Promise<number> {
  const { verb, json, values, flags } = parseArgs(argv)
  const cwd = process.cwd()

  switch (verb) {
    case 'contract': {
      printJson(contractVerb())
      return 0
    }

    case 'check': {
      const check = await checkVerb(cwd, flags.has('look'))
      if (json) printJson(check)
      else process.stdout.write(formatCheckText(check))
      return 0
    }

    case 'sweep': {
      const sweep = sweepVerb(cwd)
      if (json) printJson(sweep)
      else process.stdout.write(formatSweepText(sweep))
      return 0
    }

    case 'answer': {
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
