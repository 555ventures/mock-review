// D13: prepares the fixture hosts for CLI/e2e tests — links each fixture's `node_modules` to the
// package's own `node_modules` (so `@/`, `react`, `vite`, `@vitejs/plugin-react`,
// `@tailwindcss/vite` all resolve from the fixture without a network install per run) and builds
// `dist/cli.js` once. Idempotent: every test file's `beforeAll` may call `ensureFixtures()` — it
// does the work only once per process and is a no-op on a second call.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const cliPath = path.join(repoRoot, 'dist', 'cli.js')
export const fixturesDir = path.join(repoRoot, 'tests', 'fixtures')
export const greenHost = path.join(fixturesDir, 'host')
export const brokenHost = path.join(fixturesDir, 'host-broken')

let ready: Promise<void> | null = null

function linkNodeModules(hostDir: string) {
  const target = path.join(hostDir, 'node_modules')
  const source = path.join(repoRoot, 'node_modules')
  if (existsSync(target)) {
    const stat = lstatSync(target)
    if (stat.isSymbolicLink()) return
    unlinkSync(target)
  }
  symlinkSync(source, target, 'dir')
}

function buildDist() {
  if (existsSync(cliPath)) return
  execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' })
}

/** Builds dist/cli.js (if missing) and links node_modules into both fixture hosts. Safe to call
 * from every test file's beforeAll — the work happens at most once per test process. */
export function ensureFixtures(): Promise<void> {
  if (!ready) {
    ready = Promise.resolve().then(() => {
      buildDist()
      linkNodeModules(greenHost)
      linkNodeModules(brokenHost)
    })
  }
  return ready
}
