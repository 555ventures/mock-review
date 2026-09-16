// D13/D19: prepares the fixture hosts for CLI/e2e tests — links each fixture's `node_modules` to
// the package's own `node_modules` (so `@/`, `react`, `vite`, `@vitejs/plugin-react`,
// `@tailwindcss/vite` all resolve from the fixture without a network install per run) and builds
// the CLI once into the gitignored `.test-dist/` (never the committed `dist/` — D19a). Idempotent:
// every test file's `beforeAll` may call `ensureFixtures()` — it does the work only once per
// process and is a no-op on a second call.
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const testDistDir = path.join(repoRoot, '.test-dist')
export const cliPath = path.join(testDistDir, 'cli.js')
export const fixturesDir = path.join(repoRoot, 'tests', 'fixtures')
export const greenHost = path.join(fixturesDir, 'host')
export const brokenHost = path.join(fixturesDir, 'host-broken')

// D15: the prebuilt reviewer page and the frame entry source, built into `.test-dist/` (never
// the committed `dist/`) exactly like the release build's `dist/page/` + `dist/frame/entry.tsx`,
// just redirected. Skipped entirely while `vite.page.config.ts` doesn't exist yet (spec 02's ui
// wave adds it) so this file stays a no-op red-safe modification until then.
export const pageDir = path.join(testDistDir, 'page')
export const frameDir = path.join(testDistDir, 'frame')
export const frameEntryPath = path.join(frameDir, 'entry.tsx')
const vitePageConfigPath = path.join(repoRoot, 'vite.page.config.ts')
const frameEntrySrc = path.join(repoRoot, 'src', 'frame', 'entry.tsx')

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

/** The newest mtime (ms) of any file under `src/`, or 0 if `src/` is somehow empty. */
function newestSrcMtimeMs(): number {
  const srcDir = path.join(repoRoot, 'src')
  let newest = 0
  for (const entry of readdirSync(srcDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const full = path.join(entry.parentPath, entry.name)
    const mtime = statSync(full).mtimeMs
    if (mtime > newest) newest = mtime
  }
  return newest
}

function testDistIsStale(): boolean {
  if (!existsSync(cliPath)) return true
  return newestSrcMtimeMs() > statSync(cliPath).mtimeMs
}

const lockDir = path.join(repoRoot, '.test-dist-build.lock')
const LOCK_STALE_MS = 2 * 60 * 1000
const LOCK_POLL_MS = 150

function lockIsStale(): boolean {
  try {
    return Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS
  } catch {
    return true
  }
}

function tryAcquireLock(): boolean {
  try {
    mkdirSync(lockDir)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw err
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/** Compiles `src/` into `.test-dist/` (tsconfig.build.json's own layout, just redirected) exactly
 * when `.test-dist/cli.js` is missing or older than any `src/**` file. An atomic `mkdir` lock
 * directory serializes concurrent builders across test-runner processes (vitest may fork per test
 * file): the loser polls until either the winner's build satisfies `testDistIsStale() === false`
 * or the lock looks abandoned (`lockIsStale()`, ~2 min), in which case it reclaims the lock itself
 * rather than waiting forever on a crashed holder. The committed `dist/` is never written here. */
/** D15: true once `vite.page.config.ts` exists and either the page or the frame entry copy is
 * missing or older than the newest `src/**` file. Always false (a deliberate no-op) while
 * `vite.page.config.ts` is absent — the page/frame build steps land in a later wave. */
function pageBuildIsStale(): boolean {
  if (!existsSync(vitePageConfigPath)) return false
  const indexHtml = path.join(pageDir, 'index.html')
  const newestSrc = newestSrcMtimeMs()
  if (!existsSync(indexHtml) || newestSrc > statSync(indexHtml).mtimeMs) return true
  if (!existsSync(frameEntrySrc)) return false
  if (!existsSync(frameEntryPath) || statSync(frameEntrySrc).mtimeMs > statSync(frameEntryPath).mtimeMs) return true
  return false
}

/** D15: `vite build -c vite.page.config.ts` into `.test-dist/page`, then a plain copy of
 * `src/frame/entry.tsx` into `.test-dist/frame/entry.tsx` (the frame entry is never compiled —
 * it is imported as source by the host's own Vite pipeline, D8). Skipped while
 * `vite.page.config.ts` doesn't exist yet. */
function buildPageAndFrame(): void {
  if (!existsSync(vitePageConfigPath)) return
  execFileSync(
    'npx',
    ['vite', 'build', '-c', 'vite.page.config.ts', '--outDir', pageDir, '--emptyOutDir'],
    { cwd: repoRoot, stdio: 'inherit' },
  )
  if (existsSync(frameEntrySrc)) {
    mkdirSync(frameDir, { recursive: true })
    copyFileSync(frameEntrySrc, frameEntryPath)
  }
}

async function buildTestDist(): Promise<void> {
  for (;;) {
    if (!testDistIsStale() && !pageBuildIsStale()) return

    if (tryAcquireLock()) {
      try {
        if (testDistIsStale()) {
          execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json', '--outDir', testDistDir], {
            cwd: repoRoot,
            stdio: 'inherit',
          })
          chmodSync(cliPath, 0o755)
        }
        if (pageBuildIsStale()) {
          buildPageAndFrame()
        }
      } finally {
        rmSync(lockDir, { recursive: true, force: true })
      }
      return
    }

    if (lockIsStale()) {
      try {
        rmSync(lockDir, { recursive: true, force: true })
      } catch {
        // Another process may have already cleared it — fine, loop and try to acquire again.
      }
      continue
    }

    await sleep(LOCK_POLL_MS)
  }
}

/** Builds `.test-dist/cli.js` (if missing or stale) and links node_modules into both fixture
 * hosts. Safe to call from every test file's beforeAll — the work happens at most once per test
 * process. */
export function ensureFixtures(): Promise<void> {
  if (!ready) {
    ready = buildTestDist().then(() => {
      linkNodeModules(greenHost)
      linkNodeModules(brokenHost)
    })
  }
  return ready
}
