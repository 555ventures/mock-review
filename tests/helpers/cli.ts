import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readdirSync, symlinkSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cliPath, repoRoot } from '../setup.js'

export { cliPath, repoRoot }

/** Runs `node dist/cli.js <args>` with the given cwd, capturing stdout/stderr/status. */
export function run(cwd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' })
}

/** Runs the `mock-review` bin exactly as the plugin's mock-cli.js spawns it: unqualified, with
 * `<cwd>/node_modules/.bin` prepended to PATH, shell disabled. */
export function runInstalled(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const bin = path.join(cwd, 'node_modules', '.bin')
  return spawnSync('mock-review', args, {
    cwd,
    shell: false,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
  })
}

/** Builds a real (non-symlinked) `node_modules` under `hostDir`, with one symlink per top-level
 * entry back into the package's own `node_modules` (including scoped `@foo` dirs) and one per
 * `.bin` entry. Never writes through to the shared repo `node_modules` — adding
 * `node_modules/.bin/mock-review` afterwards is then a local, isolated symlink. */
export function linkNodeModulesInto(hostDir: string): void {
  const target = path.join(hostDir, 'node_modules')
  mkdirSync(target, { recursive: true })
  const sourceModules = path.join(repoRoot, 'node_modules')
  for (const entry of readdirSync(sourceModules)) {
    if (entry === '.bin') continue
    symlinkSync(
      path.join(sourceModules, entry),
      path.join(target, entry),
      statSync(path.join(sourceModules, entry)).isDirectory() ? 'dir' : 'file',
    )
  }
  const bindir = path.join(target, '.bin')
  mkdirSync(bindir, { recursive: true })
  const sourceBin = path.join(sourceModules, '.bin')
  for (const entry of readdirSync(sourceBin)) {
    symlinkSync(path.join(sourceBin, entry), path.join(bindir, entry), 'file')
  }
}

/** Design-state files a `check`/`serve` run can write into a host's `design/` directory (D9).
 * Never copy these out of a fixture host: a fixture that was run in place (e.g. tests/e2e's
 * AC-22 case) may carry them, and a stray copy would let that pollution leak into every other
 * test's otherwise-fresh scratch copy. */
export const DESIGN_STATE_FILES = ['notes.json', 'approval.json', 'decisions.json', '.serve.json'] as const

/** Copies a fixture host (excluding node_modules and any design/ state file a prior run may have
 * written into the source fixture) to an exact destination and builds an isolated node_modules
 * for it there (see linkNodeModulesInto). */
export function copyHostInto(fixtureDir: string, dest: string): string {
  cpSync(fixtureDir, dest, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(path.sep)
      if (parts.includes('node_modules')) return false
      const designIdx = parts.indexOf('design')
      if (designIdx !== -1 && parts.length === designIdx + 2) {
        const name = parts[designIdx + 1]
        if (name !== undefined && (DESIGN_STATE_FILES as readonly string[]).includes(name)) return false
      }
      return true
    },
  })
  linkNodeModulesInto(dest)
  return dest
}

/** Copies a fixture host (excluding node_modules) into a fresh scratch directory (at
 * `<scratch>/app`) and builds an isolated node_modules for it, so tests never mutate the
 * checked-in fixture or the shared repo node_modules. */
export function copyFixtureHost(fixtureDir: string, label = 'mock-review-'): string {
  const scratch = mkdtempSync(path.join(tmpdir(), label))
  return copyHostInto(fixtureDir, path.join(scratch, 'app'))
}

/** Adds `<hostDir>/node_modules/.bin/mock-review` pointing at the built dist/cli.js, exactly as
 * an `npm i -D @555/mock-review` install would produce. `hostDir` must already have an isolated
 * node_modules (see copyFixtureHost). */
export function linkInstalledBin(hostDir: string): void {
  const target = path.join(hostDir, 'node_modules', '.bin', 'mock-review')
  symlinkSync(cliPath, target)
}

export function readJsonFile(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'))
}

type Contract = {
  shapes: Record<string, Record<string, unknown>>
}

/** Mirrors mock-cli.js's key-presence walk (spec/scripts/lib/mock-cli.js): every key in
 * shapes.<verb>.required must be present (null counts as present) on `value`; every
 * `<field>[]` entry's keys must be present on each array element; every `<field>{}` entry's
 * keys must be present on each map value; any other array-valued shape entry describes keys
 * required on the scalar sub-object at that field. Returns the list of missing dotted paths —
 * empty means the shape is satisfied. */
export function missingContractKeys(contract: Contract, verb: string, value: Record<string, unknown>): string[] {
  const shape = contract.shapes[verb]
  if (!shape) throw new Error(`contract has no shape for verb "${verb}"`)
  const missing: string[] = []

  const required = shape.required
  if (Array.isArray(required)) {
    for (const key of required as string[]) {
      if (!(key in value)) missing.push(key)
    }
  }

  for (const [field, keys] of Object.entries(shape)) {
    if (field === 'required' || !Array.isArray(keys)) continue

    if (field.endsWith('[]')) {
      const arrKey = field.slice(0, -2)
      const arr = value[arrKey]
      if (Array.isArray(arr)) {
        arr.forEach((item: Record<string, unknown>, i: number) => {
          for (const k of keys as string[]) {
            if (!(k in item)) missing.push(`${arrKey}[${i}].${k}`)
          }
        })
      }
      continue
    }

    if (field.endsWith('{}')) {
      const mapKey = field.slice(0, -2)
      const map = value[mapKey]
      if (map && typeof map === 'object') {
        for (const [mk, mv] of Object.entries(map as Record<string, unknown>)) {
          for (const k of keys as string[]) {
            if (!mv || typeof mv !== 'object' || !(k in mv)) missing.push(`${mapKey}.${mk}.${k}`)
          }
        }
      }
      continue
    }

    // Scalar sub-shape, e.g. check.config / check.serve.
    const sub = value[field]
    if (sub && typeof sub === 'object') {
      for (const k of keys as string[]) {
        if (!(k in sub)) missing.push(`${field}.${k}`)
      }
    }
  }

  return missing
}
