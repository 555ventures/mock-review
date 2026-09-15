import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ConfigSchema } from '../schemas/index.js'
import type { Config, Finding, NullConfig } from '../schemas/index.js'
import type { Runner } from './vite-runner.js'

export const NULL_CONFIG: NullConfig = { name: null, port: null, targets: null, theme: null, client: null }

export type ConfigResult = { config: Config | NullConfig; finding?: Finding }

/**
 * D5/D6: loads `mock.config.ts`'s default export through the Vite runner (D4) and validates it
 * against `ConfigSchema`. Missing file, an unloadable module, or a schema failure all report the
 * all-null placeholder alongside a `config` error finding whose message is the zod pretty error's
 * first line (or a plain description when there is no zod error to pretty-print).
 */
export async function loadConfig(cwd: string, runner: Runner): Promise<ConfigResult> {
  const configPath = path.join(cwd, 'mock.config.ts')

  if (!existsSync(configPath)) {
    return {
      config: NULL_CONFIG,
      finding: { kind: 'config', severity: 'error', file: 'mock.config.ts', message: 'mock.config.ts is missing' },
    }
  }

  let mod: unknown
  try {
    mod = await runner.import(configPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { config: NULL_CONFIG, finding: { kind: 'config', severity: 'error', file: 'mock.config.ts', message } }
  }

  const candidate = (mod as { default?: unknown } | undefined)?.default
  const parsed = ConfigSchema.safeParse(candidate)
  if (!parsed.success) {
    const pretty = z.prettifyError(parsed.error)
    const firstLine = pretty.split('\n')[0] ?? 'mock.config.ts failed validation'
    return { config: NULL_CONFIG, finding: { kind: 'config', severity: 'error', file: 'mock.config.ts', message: firstLine } }
  }

  return { config: parsed.data }
}
