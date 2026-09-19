import { beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureFixtures, greenHost, testDistDir } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'
import { writeJsonAtomic } from '../../src/files/json.js'

/** Spawns `node <scriptPath> <args>` and resolves once it exits, capturing stdout/stderr — used
 * by AC-1/AC-2 to run two writer processes concurrently (never `spawnSync`, which would serialize
 * them and defeat the whole point of a race). */
function spawnNodeScript(scriptPath: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code, stdout, stderr }))
  })
}

/** A7: the built `.test-dist/files/json.js` module URL — AC-1/AC-2 exercise the SHIPPED code
 * (the same build the rest of this file's CLI tests already run), never `tsx`. */
const jsonModuleUrl = pathToFileURL(path.join(testDistDir, 'files', 'json.js')).href

describe('mock-review file layer (D9, built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260918-04-1 (rewrites AC-20260915-01-15: check creates): check --json creates design/notes.json and design/approval.json at contractVersion 3, with no theme key, on a scratch host with no design/ directory', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-files-')
    expect(existsSync(path.join(host, 'design', 'notes.json'))).toBe(false)

    run(host, ['check', '--json'])

    expect(JSON.parse(readFileSync(path.join(host, 'design', 'notes.json'), 'utf8'))).toEqual({
      contractVersion: 3,
      notes: [],
      journeys: {},
    })
    expect(JSON.parse(readFileSync(path.join(host, 'design', 'approval.json'), 'utf8'))).toEqual({
      contractVersion: 3,
      screens: {},
      journeys: {},
    })
  })

  it('AC-20260917-01-10 (reuses AC-20260915-01-15: an edited approval.json...): a read-only check leaves a v1 approval.json byte-identical, including its contractVersion', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-files-')
    const first = run(host, ['check', '--json'])
    expect(first.status).toBe(0)

    const approvalPath = path.join(host, 'design', 'approval.json')
    const edited = JSON.stringify({ contractVersion: 1, screens: { home: { hash: 'x' } }, journeys: {}, theme: 'nova' })
    writeFileSync(approvalPath, edited)

    const second = run(host, ['check', '--json'])
    expect(second.status).toBe(0)

    expect(readFileSync(approvalPath, 'utf8')).toBe(edited)
  })

  it('AC-20260915-01-15: writeJsonAtomic leaves no *.tmp file behind', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-files-')
    const r = run(host, ['check', '--json'])
    expect(r.status).toBe(0)

    expect(existsSync(path.join(host, 'design', 'notes.json'))).toBe(true)
    expect(existsSync(path.join(host, 'design', 'approval.json'))).toBe(true)
    const designFiles = readdirSync(path.join(host, 'design'))
    expect(designFiles.some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  // A1/A7: two real OS processes, each 250 read-modify-write cycles through the built
  // `writeJsonAtomic`, no lock. Pre-image (fixed `.tmp`): 390 write errors, a torn file. Post-image
  // (D1's unique tmp name): 0 write errors, a parseable file (lost updates are AC-2's concern, not
  // this one's).
  it('AC-20260918-01-1 (built dist/): two OS processes each performing 250 read-modify-write cycles through writeJsonAtomic leave design/notes.json parseable with zero write errors', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'mock-review-ac1-'))
    const notesPath = path.join(scratch, 'notes.json')
    writeFileSync(notesPath, JSON.stringify({ notes: [] }))

    const scriptPath = path.join(scratch, 'writer.mjs')
    writeFileSync(
      scriptPath,
      [
        `import { readFileSync } from 'node:fs'`,
        `import { writeJsonAtomic } from ${JSON.stringify(jsonModuleUrl)}`,
        `const [, , notesPath, writerId] = process.argv`,
        `let errors = 0`,
        `for (let i = 0; i < 250; i++) {`,
        `  try {`,
        `    const doc = JSON.parse(readFileSync(notesPath, 'utf8'))`,
        `    doc.notes.push({ id: writerId + '-' + i })`,
        `    writeJsonAtomic(notesPath, doc)`,
        `  } catch {`,
        `    errors++`,
        `  }`,
        `}`,
        `process.stdout.write(JSON.stringify({ errors }))`,
        '',
      ].join('\n'),
    )

    const [a, b] = await Promise.all([
      spawnNodeScript(scriptPath, [notesPath, 'A']),
      spawnNodeScript(scriptPath, [notesPath, 'B']),
    ])

    expect(a.code, `writer A stderr: ${a.stderr}`).toBe(0)
    expect(b.code, `writer B stderr: ${b.stderr}`).toBe(0)
    const errorsA = (JSON.parse(a.stdout) as { errors: number }).errors
    const errorsB = (JSON.parse(b.stdout) as { errors: number }).errors
    expect(errorsA + errorsB).toBe(0)

    expect(() => JSON.parse(readFileSync(notesPath, 'utf8'))).not.toThrow()
  }, 30_000)

  // A1/A7/D2: the same two-process race, but each writer holds `withDesignLock` around its whole
  // read-modify-write cycle. Pre-image: `withDesignLock` does not exist — import failure. Post
  // image: no writer ever observes another's half-applied state, so all 500 distinct entries
  // survive (the pre-image's unlocked equivalent kept only 272/500, A1).
  it('AC-20260918-01-2 (built dist/): two OS processes each appending 250 distinct entries under withDesignLock preserve all 500', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'mock-review-ac2-'))
    mkdirSync(path.join(scratch, 'design'), { recursive: true })
    const notesPath = path.join(scratch, 'design', 'notes.json')
    writeFileSync(notesPath, JSON.stringify({ notes: [] }))

    const scriptPath = path.join(scratch, 'writer.mjs')
    writeFileSync(
      scriptPath,
      [
        `import { readFileSync } from 'node:fs'`,
        `import { writeJsonAtomic, withDesignLock } from ${JSON.stringify(jsonModuleUrl)}`,
        `const [, , cwd, notesPath, writerId] = process.argv`,
        `async function main() {`,
        `  for (let i = 0; i < 250; i++) {`,
        `    await withDesignLock(cwd, () => {`,
        `      const doc = JSON.parse(readFileSync(notesPath, 'utf8'))`,
        `      doc.notes.push({ id: writerId + '-' + i })`,
        `      writeJsonAtomic(notesPath, doc)`,
        `    })`,
        `  }`,
        `}`,
        `main().catch((err) => { console.error(err); process.exitCode = 1 })`,
        '',
      ].join('\n'),
    )

    const [a, b] = await Promise.all([
      spawnNodeScript(scriptPath, [scratch, notesPath, 'A']),
      spawnNodeScript(scriptPath, [scratch, notesPath, 'B']),
    ])

    expect(a.code, `writer A stderr: ${a.stderr}`).toBe(0)
    expect(b.code, `writer B stderr: ${b.stderr}`).toBe(0)

    const doc = JSON.parse(readFileSync(notesPath, 'utf8')) as { notes: { id: string }[] }
    expect(doc.notes).toHaveLength(500)
  }, 30_000)

  // AC-20260918-01-6, tagged [pre-green: absence-invariant]: the pre-image never creates
  // design/.lock at all, so "no lock file left behind after a refusal" holds trivially today —
  // it's kept (not dropped) because it's the exact invariant D5's `finally` exists to preserve
  // once a lock does exist.
  it('AC-20260918-01-6 [pre-green: absence-invariant]: answer --note NOPE --text x refuses exit 2 leaving no design/.lock', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-files-')
    const result = run(host, ['answer', '--note', 'NOPE', '--text', 'x'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('mock-review: no note NOPE')
    expect(existsSync(path.join(host, 'design', '.lock'))).toBe(false)
  })
})

// AC-3/AC-5 exercise `writeJsonAtomic`/`withDesignLock` directly against `src/files/json.ts` (no
// built dist required — single-process, synchronous-enough behavior, not a multi-OS-process race).
describe('mock-review file layer (D1/D2, source)', () => {
  it('AC-20260918-01-3: writeJsonAtomic unlinks its own temp file before rethrowing when rename fails', () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'mock-review-ac3-'))
    const targetPath = path.join(scratch, 'notes.json')
    // Pre-creating the TARGET path as a directory makes `renameSync(tmp, targetPath)` throw
    // EISDIR — the write itself (to the tmp file) still succeeds, only the publish step fails.
    mkdirSync(targetPath)

    expect(() => writeJsonAtomic(targetPath, { a: 1 })).toThrow()

    const leftoverTmp = readdirSync(scratch).filter((f) => f.startsWith('notes.json') && f.endsWith('.tmp'))
    expect(leftoverTmp).toEqual([])
  })

  it('AC-20260918-01-5: withDesignLock breaks a lock naming a dead pid and completes the write, leaving no lock file behind', async () => {
    const { withDesignLock } = (await import('../../src/files/json.js')) as {
      withDesignLock?: <T>(cwd: string, fn: () => T | Promise<T>) => Promise<T>
    }
    expect(withDesignLock, 'withDesignLock is not yet exported from src/files/json.ts').toBeDefined()

    const cwd = mkdtempSync(path.join(tmpdir(), 'mock-review-ac5-'))
    const designDir = path.join(cwd, 'design')
    mkdirSync(designDir, { recursive: true })
    const lockPath = path.join(designDir, '.lock')
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, at: new Date().toISOString() }))

    const result = await withDesignLock?.(cwd, () => 'ok')

    expect(result).toBe('ok')
    expect(existsSync(lockPath)).toBe(false)
  })
})
