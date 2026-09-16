// D25: `scripts/release-check.mjs` is the release gate that stops a broken `dist/` from
// shipping. Nothing asserted any of its behaviour before this file — review pass 2, item 1.
//
// The script resolves its own `root` from `import.meta.url` (never `process.cwd()` or an
// argument), so exercising it against a fixture tree means copying the *script itself* into a
// scratch directory shaped like the release tree, never touching this repo's own `dist/` or
// running `npm run build` (forbidden by the task and by D15/D19 — dist/ is a release-only
// artifact). The script also shells out to `git` (tracked-file checks, log-based staleness), so
// the "everything present" case needs its scratch tree to be a real, isolated git repo; the two
// "missing path" cases fail at the script's very first check (plain `existsSync`), before any
// git command runs, so they need no repo at all.
import { describe, expect, it } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { registerScratchDir, repoRoot, spawnWithTimeout } from '../helpers/cli.js'

const releaseCheckSrc = path.join(repoRoot, 'scripts', 'release-check.mjs')

/** Builds a scratch tree shaped like the release layout `release-check.mjs` inspects
 * (`dist/cli.js`, `dist/index.js`, `dist/vite.js`, `dist/page/index.html` + one JS asset,
 * `dist/frame/entry.tsx` byte-equal to `src/frame/entry.tsx`) with its own copy of the script
 * under `scripts/release-check.mjs` (so the script's self-located `root` resolves to this
 * scratch dir, not the real repo). `omit` skips writing one required path, for the two
 * missing-path cases — the script fails on the first `existsSync` check, well before any git
 * command, so this deliberately does *not* init a git repo when `omit` is set (unnecessary, and
 * `git log` on a tree with no commits at all would only obscure which check actually fired).
 * `divergeFrameEntry`/`badIndexHtmlBase` write a tree that fails checks 3/5 respectively while
 * still being commit-clean (checks 1-2 must pass first for either of those to actually fire —
 * writing the divergence/bad base *before* the one commit, rather than editing after, keeps
 * `git status --porcelain -- dist` clean so check 2 doesn't mask the one under test). */
function buildReleaseTree(options: { omit?: string; divergeFrameEntry?: boolean; badIndexHtmlBase?: boolean } = {}): string {
  const { omit, divergeFrameEntry, badIndexHtmlBase } = options
  const scratch = mkdtempSync(path.join(tmpdir(), 'mock-review-release-check-'))
  registerScratchDir(scratch)

  const write = (relPath: string, content: string) => {
    if (relPath === omit) return
    const full = path.join(scratch, relPath)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }

  mkdirSync(path.join(scratch, 'scripts'), { recursive: true })
  cpSync(releaseCheckSrc, path.join(scratch, 'scripts', 'release-check.mjs'))

  const frameEntrySource = '// scratch frame entry\nexport {}\n'
  write('src/frame/entry.tsx', frameEntrySource)
  write('dist/cli.js', '#!/usr/bin/env node\n')
  write('dist/index.js', 'export {}\n')
  write('dist/vite.js', 'export {}\n')
  write(
    'dist/page/index.html',
    badIndexHtmlBase
      ? '<!doctype html><html><body><script type="module" src="/assets/index.js"></script></body></html>\n'
      : '<!doctype html><html><body><script type="module" src="/__mock-review/page/assets/index.js"></script></body></html>\n',
  )
  write('dist/page/assets/index.js', 'console.log("app")\n')
  // Byte-equal to src/frame/entry.tsx, as check 3 requires (skipped when frame/entry.tsx itself
  // is the omitted path — nothing to keep in sync with in that case).
  if (omit !== 'dist/frame/entry.tsx') {
    write('dist/frame/entry.tsx', divergeFrameEntry ? '// DIVERGED — not the same as src/frame/entry.tsx\nexport {}\n' : frameEntrySource)
  }

  return scratch
}

function git(cwd: string, args: string[]) {
  return spawnWithTimeout('git', args, { cwd })
}

/** Turns a fresh `buildReleaseTree()` into a one-commit git repo with every required path
 * tracked and `dist/` clean — the shape check 2 (git-tracked, no uncommitted `dist/` changes)
 * and check 4 (no commit after the `dist/` commit touched a watched path) both require. A scoped
 * `-c user.*`/`-c commit.gpgsign=false` avoids depending on this machine's global git identity or
 * signing config for a throwaway fixture repo that is never pushed or inspected by a human. */
function commitReleaseTree(scratch: string): void {
  const gitc = (args: string[]) => git(scratch, ['-c', 'user.email=test@example.com', '-c', 'user.name=Release Check Test', '-c', 'commit.gpgsign=false', ...args])
  expect(git(scratch, ['init', '-q']).status).toBe(0)
  expect(gitc(['add', '-A']).status).toBe(0)
  const commit = gitc(['commit', '-q', '-m', 'release tree'])
  expect(commit.status).toBe(0)
}

describe('scripts/release-check.mjs (D25)', () => {
  it('exits 0 on a tree with every required dist/ path present, committed and in sync', () => {
    const scratch = buildReleaseTree()
    commitReleaseTree(scratch)
    const r = spawnWithTimeout(process.execPath, [path.join(scratch, 'scripts', 'release-check.mjs')], { cwd: scratch })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })

  it('exits non-zero and names the path when dist/page/index.html is missing', () => {
    const scratch = buildReleaseTree({ omit: 'dist/page/index.html' })
    const r = spawnWithTimeout(process.execPath, [path.join(scratch, 'scripts', 'release-check.mjs')], { cwd: scratch })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('dist/page/index.html')
  })

  it('exits non-zero and names the path when dist/frame/entry.tsx is missing', () => {
    const scratch = buildReleaseTree({ omit: 'dist/frame/entry.tsx' })
    const r = spawnWithTimeout(process.execPath, [path.join(scratch, 'scripts', 'release-check.mjs')], { cwd: scratch })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('dist/frame/entry.tsx')
  })

  it('exits non-zero when dist/frame/entry.tsx has diverged from src/frame/entry.tsx (check 3, byte-equality)', () => {
    const scratch = buildReleaseTree({ divergeFrameEntry: true })
    commitReleaseTree(scratch)
    const r = spawnWithTimeout(process.execPath, [path.join(scratch, 'scripts', 'release-check.mjs')], { cwd: scratch })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('not byte-equal')
    expect(r.stderr).toContain('dist/frame/entry.tsx')
  })

  it('exits non-zero when dist/page/index.html does not reference the /__mock-review/page/assets/ base (check 5)', () => {
    const scratch = buildReleaseTree({ badIndexHtmlBase: true })
    commitReleaseTree(scratch)
    const r = spawnWithTimeout(process.execPath, [path.join(scratch, 'scripts', 'release-check.mjs')], { cwd: scratch })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('/__mock-review/page/assets/')
  })

  it('exits non-zero when a commit after the last dist/ commit touched src/ (check 4, staleness)', () => {
    const scratch = buildReleaseTree()
    commitReleaseTree(scratch)

    // A second commit that touches src/ but never re-touches dist/frame/entry.tsx — checks 1-3
    // must keep passing (dist/ itself is still clean and still byte-equal to the src file it was
    // committed against) so this test isolates check 4 specifically, not a byte-equality failure.
    const gitc = (args: string[]) => git(scratch, ['-c', 'user.email=test@example.com', '-c', 'user.name=Release Check Test', '-c', 'commit.gpgsign=false', ...args])
    writeFileSync(path.join(scratch, 'src', 'extra.ts'), 'export const later = true\n')
    expect(gitc(['add', '-A']).status).toBe(0)
    expect(gitc(['commit', '-q', '-m', 'a src/ change after the dist/ commit']).status).toBe(0)

    const r = spawnWithTimeout(process.execPath, [path.join(scratch, 'scripts', 'release-check.mjs')], { cwd: scratch })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('after the last dist/ commit')
  })
})
