// AC-20260916-02-11 (D6): source ban — no file under `src/` may contain a runtime import of
// `vite` (`import … from 'vite'` without `type`, `import('vite')`, or `require('vite')`) except
// `src/analysis/host-modules.ts` (D3's own no-vite fallback `await import('vite')`). Type-only
// imports (`import type { … } from 'vite'`, `typeof import('vite')`) are exempt by the patterns
// themselves — this is a grep-level regression guard, not a type check.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../setup.js'

const PATTERNS: readonly RegExp[] = [
  /^\s*import\s+(?!type\b)[^;]*?\bfrom\s+['"]vite['"]/m,
  /\bimport\(\s*['"]vite['"]\s*\)/,
  /\brequire\(\s*['"]vite['"]\s*\)/,
]

const ALLOWED_FILE = path.posix.join('src', 'analysis', 'host-modules.ts')

/** Every `src/**\/*.ts` file (never `.tsx` — `src/ui` is host-compiled and never imports `vite`),
 * relative to the repo root, posix-separated. */
function listSrcTsFiles(): string[] {
  const srcDir = path.join(repoRoot, 'src')
  const out: string[] = []
  for (const entry of readdirSync(srcDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.ts')) continue
    const full = path.join(entry.parentPath, entry.name)
    out.push(path.relative(repoRoot, full).split(path.sep).join('/'))
  }
  return out.sort()
}

/** Applies the three D6 patterns per line, not to the whole file at once: this repo's own
 * (semicolon-free) style means an unrelated import statement's lack of a trailing `;` lets
 * pattern 1's lazy `[^;]*?` cross a newline and falsely fuse it with the NEXT line's own
 * `import … from 'vite'` when tested against the whole source (confirmed against
 * src/server/watch.ts's `import path from 'node:path'` immediately followed by its real
 * `import type { … } from 'vite'` — a false positive since the first line names no `vite`
 * import at all). Every real import in this codebase is one line, so per-line application is the
 * only way the given regex expresses "this one import statement", not "anything before the next
 * semicolon anywhere in the file". */
function matchedPatterns(source: string): RegExp[] {
  const hit = new Set<RegExp>()
  for (const line of source.split('\n')) {
    for (const re of PATTERNS) {
      if (re.test(line)) hit.add(re)
    }
  }
  return [...hit]
}

describe('AC-20260916-02-11: no runtime vite import outside src/analysis/host-modules.ts', () => {
  it("AC-20260916-02-11: exactly one file matches, and only the import('vite') pattern", () => {
    const matches: Record<string, RegExp[]> = {}
    for (const rel of listSrcTsFiles()) {
      const source = readFileSync(path.join(repoRoot, rel), 'utf8')
      const hit = matchedPatterns(source)
      if (hit.length > 0) matches[rel] = hit
    }

    expect(Object.keys(matches)).toEqual([ALLOWED_FILE])
    expect(matches[ALLOWED_FILE]).toEqual([PATTERNS[1]])
  })
})
