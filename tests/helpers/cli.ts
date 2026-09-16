import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readdirSync, symlinkSync, statSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'
import { cliPath, repoRoot, testDistDir } from '../setup.js'

export { cliPath, repoRoot }

/** Item 3 (leak fix): every scratch directory this helper module creates (`copyFixtureHost`,
 * `buildScratchPackage`) is tracked here and removed once this test file's own suite finishes, so
 * a run never leaves scratch hosts behind under the system temp dir — the prior behavior (never
 * removed) leaked 15+ copies per run and eventually starved this machine's /tmp of inodes (4,645
 * of them), which made the browser suite fail with ENOSPC rather than a real assertion failure.
 *
 * Cleanup is registered two ways: vitest's own `afterAll` (the reliable path — this module is
 * re-evaluated fresh per test file under vitest's default file isolation, so calling `afterAll`
 * here at module scope registers it against that file's own root suite, and it always runs as
 * part of vitest's normal lifecycle) *and* `process.once('exit', ...)` as a belt-and-braces
 * fallback for anything vitest's own teardown doesn't reach. The `afterAll` path turned out to be
 * the one that actually matters: a worker pool that tears down its processes with `terminate()`/a
 * hard kill rather than a graceful exit never fires Node's `'exit'` event at all, which is
 * exactly why an `'exit'`-only version of this still left roughly 150 directories behind after a
 * full two-run verification (confirmed by direct reproduction — this repo's default vitest pool
 * doesn't reach `process.on('exit')` reliably; the mechanism the `'exit'` handler assumed simply
 * doesn't fire in every case). Exported so a test file that creates its own scratch root directly
 * (e.g. tests/e2e's own `mkdtempSync`, not through one of the copy helpers here) can opt in too.
 * `removeScratchDir` is the eager path (tests/helpers/serve.ts's `stopServe` uses it for a host
 * `startServe` created itself); this file-scoped cleanup is the safety net for everything else,
 * including a test that fails before reaching its own cleanup. */
const scratchDirs = new Set<string>()

function cleanupAllScratchDirs(): void {
  for (const dir of scratchDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best-effort: a directory a still-running child (e.g. a `serve` process this same
      // teardown is also in the middle of killing) has open file handles under is left for the
      // OS's own temp-dir GC rather than risking a half-completed delete racing that child.
    }
  }
  scratchDirs.clear()
}

// Registered unconditionally, once, at module-collection time — `registerScratchDir` itself is
// typically first called later, from inside a running `beforeAll`/`it` body (well after
// collection), and vitest's global hooks (`afterAll` included) must be called during collection
// to attach to a suite; calling `afterAll` lazily from inside an already-running test does not
// reliably register it. Every test file that (transitively) imports this module re-evaluates it
// fresh (vitest's default per-file isolation), so this runs exactly once per file, at the right
// time, whether or not that file ever ends up calling `registerScratchDir` at all.
afterAll(cleanupAllScratchDirs)
process.once('exit', cleanupAllScratchDirs)

export function registerScratchDir(dir: string): void {
  scratchDirs.add(dir)
}

/** Removes one scratch directory immediately (used once its owner is done with it, e.g.
 * `stopServe`) rather than waiting for process exit — cheaper on inode-constrained machines when
 * a suite creates many of these in one run. Safe to call on a directory nothing else references;
 * never call it on a directory another still-running part of the same test may reuse (e.g. a
 * `startServeIn` host a test restarts `serve` on after stopping it once). */
export function removeScratchDir(dir: string): void {
  scratchDirs.delete(dir)
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort; nothing else to do if this races a child process still exiting.
  }
}

/** D20: a one-shot CLI verb takes ~1.5s; a synchronous spawn that hasn't exited by this bound is
 * hung, not slow. Every synchronous CLI spawn in tests carries this timeout so a hang fails the
 * test in seconds with a readable message instead of stalling the whole gate for its full
 * `vitest`/CI timeout. */
export const CLI_SPAWN_TIMEOUT_MS = 30_000

/** Throws a readable error naming the argv and cwd when `result` shows the child was killed by
 * `CLI_SPAWN_TIMEOUT_MS` rather than exiting on its own (`result.error?.code === 'ETIMEDOUT'`, or
 * `result.signal` set — spawnSync's timeout kill does not always populate `.error`). A normal
 * `mock-review` exit (0 or 2) never sets `.signal`, so this cannot misfire on an expected refusal. */
function dieIfTimedOut(result: SpawnSyncReturns<string>, argv: string[], cwd: string): void {
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code
  const timedOut = errorCode === 'ETIMEDOUT' || result.signal != null
  if (!timedOut) return
  const reason = result.signal ? `killed by ${result.signal}` : (result.error?.message ?? 'timed out')
  throw new Error(
    `CLI spawn hung and was killed after ${CLI_SPAWN_TIMEOUT_MS}ms (${reason}): ${JSON.stringify(argv)} in ${cwd}`,
  )
}

/** Runs `node .test-dist/cli.js <args>` with the given cwd, capturing stdout/stderr/status. */
export function run(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const argv = [process.execPath, cliPath, ...args]
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  dieIfTimedOut(result, argv, cwd)
  return result
}

/** Runs the `mock-review` bin exactly as the plugin's mock-cli.js spawns it: unqualified, with
 * `<cwd>/node_modules/.bin` prepended to PATH, shell disabled. */
export function runInstalled(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const bin = path.join(cwd, 'node_modules', '.bin')
  const argv = ['mock-review', ...args]
  const result = spawnSync('mock-review', args, {
    cwd,
    shell: false,
    encoding: 'utf8',
    timeout: CLI_SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
  })
  dieIfTimedOut(result, argv, cwd)
  return result
}

/** Runs any synchronous child process (not the `mock-review` bin itself, e.g. a scratch package's
 * copy of the built CLI, or the plugin's mocks-driver.js which shells out to the CLI internally)
 * with the same D20 hang guard as `run`/`runInstalled`. */
export function spawnWithTimeout(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): SpawnSyncReturns<string> {
  const cwd = options.cwd ?? process.cwd()
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: CLI_SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    ...(options.env ? { env: options.env } : {}),
  })
  dieIfTimedOut(result, [command, ...args], cwd)
  return result
}

/** Builds a real (non-symlinked) `node_modules` under `hostDir`, with one symlink per top-level
 * entry back into the package's own `node_modules` (including scoped `@foo` dirs) and one per
 * `.bin` entry. Never writes through to the shared repo `node_modules` — adding
 * `node_modules/.bin/mock-review` afterwards is then a local, isolated symlink.
 *
 * D20: every dot-directory except `.bin` is skipped (never symlinked) — most importantly
 * `.vite`, Vite's dep-optimizer cache. Symlinking `.vite` would make every scratch host's `serve`
 * share one cache keyed by a different config hash (no `mock-review` plugin in the repo's own
 * node_modules-adjacent config), so each server's optimizer start deletes the others'
 * `deps` directory mid-flight — the "blank frame" flake (a stale module request then 404s/504s
 * with no re-optimize). Each scratch host must get its own real `node_modules/.vite`, created by
 * its own Vite instance on first run. */
export function linkNodeModulesInto(hostDir: string): void {
  const target = path.join(hostDir, 'node_modules')
  mkdirSync(target, { recursive: true })
  const sourceModules = path.join(repoRoot, 'node_modules')
  for (const entry of readdirSync(sourceModules)) {
    if (entry === '.bin' || entry.startsWith('.')) continue
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
  registerScratchDir(scratch)
  return copyHostInto(fixtureDir, path.join(scratch, 'app'))
}

/** Adds `<hostDir>/node_modules/.bin/mock-review` pointing at the built dist/cli.js, exactly as
 * an `npm i -D @555/mock-review` install would produce. `hostDir` must already have an isolated
 * node_modules (see copyFixtureHost). */
export function linkInstalledBin(hostDir: string): void {
  const target = path.join(hostDir, 'node_modules', '.bin', 'mock-review')
  symlinkSync(cliPath, target)
}

/** Copies `.test-dist/` + the package's own `package.json` into a scratch directory shaped like
 * an installed package (`<scratch>/package.json`, `<scratch>/dist/cli.js`, same relative depth
 * `contractVerb()`'s `require('../../package.json')` expects), with an isolated `node_modules`
 * containing every top-level entry from the package's own `node_modules` except those named in
 * `exclude`. Used to prove `contract` never needs a package it doesn't import (D2/D19,
 * AC-20260915-01-3) — e.g. `buildScratchPackage(['vite'])` for "contract works with no vite
 * resolvable". */
export function buildScratchPackage(exclude: readonly string[] = []): { dir: string; cliPath: string } {
  const scratch = mkdtempSync(path.join(tmpdir(), 'mock-review-pkg-'))
  registerScratchDir(scratch)
  cpSync(testDistDir, path.join(scratch, 'dist'), { recursive: true })
  cpSync(path.join(repoRoot, 'package.json'), path.join(scratch, 'package.json'))
  const target = path.join(scratch, 'node_modules')
  mkdirSync(target, { recursive: true })
  const sourceModules = path.join(repoRoot, 'node_modules')
  for (const entry of readdirSync(sourceModules)) {
    if (entry === '.bin' || exclude.includes(entry)) continue
    symlinkSync(
      path.join(sourceModules, entry),
      path.join(target, entry),
      statSync(path.join(sourceModules, entry)).isDirectory() ? 'dir' : 'file',
    )
  }
  return { dir: scratch, cliPath: path.join(scratch, 'dist', 'cli.js') }
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
