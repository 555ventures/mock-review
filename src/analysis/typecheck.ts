import path from 'node:path'
import ts from 'typescript'
import type { Finding } from '../schemas/index.js'

/**
 * D5 `type` findings: one per TypeScript pre-emit diagnostic under `<cwd>/src/`, from
 * `ts.createProgram` on `tsconfig.app.json` (the root `tsconfig.json` is a references stub with
 * `files: []` — spike c). `message` = `TS<code>: <text> at <line>:<col>` (1-based).
 */
export function typeFindings(cwd: string): Finding[] {
  const configPath = path.join(cwd, 'tsconfig.app.json')
  const raw = ts.readConfigFile(configPath, ts.sys.readFile)
  if (raw.error || !raw.config) return []

  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, cwd, undefined, configPath)
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
  const diagnostics = ts.getPreEmitDiagnostics(program)

  const srcDir = path.join(cwd, 'src') + path.sep
  const findings: Finding[] = []

  for (const diagnostic of diagnostics) {
    const file = diagnostic.file
    if (!file || !file.fileName.startsWith(srcDir)) continue

    const start = diagnostic.start ?? 0
    const { line, character } = file.getLineAndCharacterOfPosition(start)
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')

    findings.push({
      kind: 'type',
      severity: 'error',
      file: path.relative(cwd, file.fileName),
      message: `TS${diagnostic.code}: ${text} at ${line + 1}:${character + 1}`,
    })
  }

  return findings
}
