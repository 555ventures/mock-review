#!/usr/bin/env node
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

const CONTRACT_VERSION = 1
const PACKAGE_NAME = '@555/mock-review'

function main(argv: string[]): number {
  const verb = argv[2]

  if (verb === 'contract') {
    process.stdout.write(
      JSON.stringify({
        contractVersion: CONTRACT_VERSION,
        package: PACKAGE_NAME,
        version: pkg.version,
      }) + '\n',
    )
    return 0
  }

  process.stderr.write(`mock-review: ${verb ?? '(no verb)'} not implemented\n`)
  return 2
}

process.exitCode = main(process.argv)
