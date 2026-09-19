// D1/D2/D7: the one predicate (`readDesignDoc`/`readDesignDocOrThrow`/`UnparseableDesignFileError`
// in src/files/json.ts) and the `documents` outcome it feeds. AC-20260917-04-1 exercises
// `readDesignDoc` directly over a scratch cwd; AC-20260917-04-2 is a structural scan proving no
// other file under src/server/, src/cli/ or src/ui/ still writes its own `readJson(...,
// NotesSchema|ApprovalSchema)` try/catch (the Contracts section: "Callers never write their own
// `try { readJson(...) } catch`"); AC-20260917-04-8 fuzzes design/approval.json mutants against
// the live server, using ApprovalSchema.safeParse as the oracle (no field named in the test).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readDesignDoc, readDesignDocOrThrow, UnparseableDesignFileError } from '../../src/files/json.js'
import { ApprovalSchema } from '../../src/schemas/approval.js'
import { repoRoot, ensureFixtures, greenHost } from '../setup.js'
import { startServe, stopServe, type Serve } from '../helpers/serve.js'

function tmpCwd(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'design-docs-'))
  mkdirSync(path.join(dir, 'design'), { recursive: true })
  return dir
}

const REFUSAL = (rel: string) => `${rel} exists but does not parse — refusing to write until it's fixed by hand`

describe('AC-20260917-04-1: readDesignDoc(cwd, kind) — the one verdict', () => {
  it('returns {ok:true, doc} deep-equal to a well-formed design/approval.json', () => {
    const cwd = tmpCwd()
    const doc = { contractVersion: 2, screens: {}, journeys: {}, theme: null }
    writeFileSync(path.join(cwd, 'design', 'approval.json'), JSON.stringify(doc))

    expect(readDesignDoc(cwd, 'approval')).toEqual({ ok: true, doc })
  })

  it('returns {ok:false, error} naming the file, for truncated JSON', () => {
    const cwd = tmpCwd()
    writeFileSync(path.join(cwd, 'design', 'approval.json'), '{"contractVersion":')

    expect(readDesignDoc(cwd, 'approval')).toEqual({
      ok: false,
      error: REFUSAL('design/approval.json'),
    })
  })

  it('returns {ok:false, error} naming the file, for an unknown contractVersion (3)', () => {
    const cwd = tmpCwd()
    writeFileSync(
      path.join(cwd, 'design', 'approval.json'),
      JSON.stringify({ contractVersion: 3, screens: {}, journeys: {}, theme: null }),
    )

    expect(readDesignDoc(cwd, 'approval')).toEqual({
      ok: false,
      error: REFUSAL('design/approval.json'),
    })
  })
})

describe('AC-20260917-04-2: readDesignDoc/readJson call sites — one home, one catch', () => {
  function readAllSource(relDir: string): { file: string; content: string }[] {
    const abs = path.join(repoRoot, relDir)
    const entries = readdirSync(abs, { recursive: true }) as string[]
    return entries
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      .map((f) => ({
        file: path.posix.join(relDir, f.split(path.sep).join('/')),
        content: readFileSync(path.join(abs, f), 'utf8'),
      }))
  }

  // Matches a `readJson(<path-expr>, NotesSchema|ApprovalSchema)` call, whether written on one
  // line or split across several — the character class (unlike `.`) matches newlines too, so this
  // catches the multi-line form several call sites in this repo already use.
  const READ_JSON_SCHEMA_RE = /readJson\(\s*[^,]+,\s*(NotesSchema|ApprovalSchema)\s*[,)]/

  it('no file under src/server/, src/cli/ or src/ui/ calls readJson with NotesSchema or ApprovalSchema', () => {
    const files = [...readAllSource('src/server'), ...readAllSource('src/cli'), ...readAllSource('src/ui')]
    const offenders = files.filter((f) => READ_JSON_SCHEMA_RE.test(f.content)).map((f) => f.file)
    expect(offenders).toEqual([])
  })

  it('src/files/json.ts is the only file in src/ that reads a design document by its schema, and exports the one predicate', () => {
    const jsonTs = readFileSync(path.join(repoRoot, 'src', 'files', 'json.ts'), 'utf8')
    expect(jsonTs).toMatch(/export function readDesignDoc\(/)
    expect(jsonTs).toMatch(/export function readDesignDocOrThrow\(/)
    expect(jsonTs).toMatch(/export class UnparseableDesignFileError/)

    const allSrc = readAllSource('src')
    const outsideJsonTs = allSrc
      .filter((f) => f.file !== 'src/files/json.ts')
      .filter((f) => READ_JSON_SCHEMA_RE.test(f.content))
      .map((f) => f.file)
    expect(outsideJsonTs).toEqual([])
  })
})

describe('AC-20260917-04-8: design/approval.json mutants — the live schema is the oracle', () => {
  let serve: Serve | undefined

  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  afterEach(async () => {
    await stopServe(serve)
    serve = undefined
  })

  const VALID: Record<string, unknown> = {
    contractVersion: 2,
    screens: {
      home: {
        hash: 'abc123',
        approvedAt: '2026-01-01T00:00:00.000Z',
        states: ['default'],
        viewports: ['360x800'],
        schemes: ['light'],
        screenshots: [],
      },
    },
    journeys: {
      'first-visit': { client: 'ok', beats: 'deadbeef0000', at: '2026-01-01T00:00:00.000Z' },
    },
    theme: 'nova',
  }

  type Mutant = { label: string; raw: string; value: unknown }

  function mutants(): Mutant[] {
    const list: Mutant[] = [
      { label: 'truncated JSON', raw: '{"contractVersion":', value: undefined },
      { label: 'contractVersion: 3', raw: '', value: { ...VALID, contractVersion: 3 } },
    ]
    for (const key of Object.keys(VALID)) {
      const clone = { ...VALID }
      delete clone[key]
      list.push({ label: `missing key ${key}`, raw: '', value: clone })
    }
    list.push({ label: 'theme wrong-typed', raw: '', value: { ...VALID, theme: 42 } })
    list.push({ label: 'screens wrong-typed', raw: '', value: { ...VALID, screens: 'nope' } })
    list.push({ label: 'journeys.first-visit.beats wrong-typed', raw: '', value: { ...VALID, journeys: { 'first-visit': { ...(VALID.journeys as Record<string, unknown>)['first-visit'] as object, beats: 7 } } } })
    return list.map((m) => (m.raw ? m : { ...m, raw: JSON.stringify(m.value) }))
  }

  it.each(mutants().map((m): [string, Mutant] => [m.label, m]))(
    'mutant: %s — documents.approval.ok matches ApprovalSchema.safeParse, and a POST is 409 or the mutant is served intact',
    async (_label, mutant) => {
      serve = await startServe(greenHost, 'mock-review-approval-mutant-')
      const approvalPath = path.join(serve.host, 'design', 'approval.json')
      writeFileSync(approvalPath, mutant.raw)

      const oracle = mutant.label === 'truncated JSON' ? false : ApprovalSchema.safeParse(mutant.value).success

      const stateRes = await fetch(`${serve.url}/__mock-review/state`)
      expect(stateRes.status).toBe(200)
      const state = (await stateRes.json()) as {
        documents: { approval: { ok: boolean } }
        approval: unknown
      }
      expect(state.documents.approval.ok).toBe(oracle)

      if (oracle) {
        // D8/AC-20260917-04-8 (amended): schema normalisation is part of the read verdict, not
        // drift from it — the served document is compared against what the live schema itself
        // normalises the mutant to (e.g. a deleted `theme` key parses back with `theme: null`
        // under D4's `.default(null)`), never a hand-written expectation naming that field.
        expect(state.approval).toEqual(ApprovalSchema.parse(mutant.value))
      } else {
        // D5: `op:'theme'` is retired from the wire — a surviving op (`approveScreen`) is what
        // exercises this mutant probe now; the corrupted document refuses at the read, before the
        // reducer ever sees which op it was asked to apply.
        const postRes = await fetch(`${serve.url}/__mock-review/approval`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'approveScreen', name: 'home' }),
        })
        expect(postRes.status).toBe(409)
        const body = (await postRes.json()) as { error: string }
        expect(body.error).toContain('design/approval.json')
      }
    },
    30_000,
  )
})

// The read and write paths are one verdict, not two that happen to agree. `readDesignDocOrThrow`
// delegates to the same private judge as `readDesignDoc`, so there is a single catch site and no
// input can be readable to one path and unreadable to the other. This is the guarantee D1 asked
// for ("a thin wrapper ... so the two paths cannot drift") stated as a test rather than as a
// comment: the two readers are checked against each other over the same bytes, including the
// absent case, where the shared verdict says "does not exist" rather than naming damage that is
// not there.
describe('the read and write paths derive from one verdict', () => {
  const CASES: { label: string; write?: string | undefined }[] = [
    { label: 'well-formed', write: JSON.stringify({ contractVersion: 2, screens: {}, journeys: {}, theme: null }) },
    { label: 'truncated JSON', write: '{"contractVersion":' },
    { label: 'unknown contractVersion', write: JSON.stringify({ contractVersion: 3, screens: {}, journeys: {}, theme: null }) },
    { label: 'not an object', write: '[]' },
    { label: 'absent', write: undefined },
  ]

  it.each(CASES)('$label: both readers reach the same verdict, with the same sentence', ({ write }) => {
    const cwd = tmpCwd()
    const rel = 'design/approval.json'
    if (write !== undefined) writeFileSync(path.join(cwd, rel), write)

    const result = readDesignDoc(cwd, 'approval')

    if (result.ok) {
      // Readable to one path ⇒ readable to the other, and the very same document.
      expect(readDesignDocOrThrow(cwd, 'approval')).toEqual(result.doc)
      return
    }

    // Unreadable to one path ⇒ the other throws, carrying the identical sentence.
    let thrown: unknown
    try {
      readDesignDocOrThrow(cwd, 'approval')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(UnparseableDesignFileError)
    expect((thrown as UnparseableDesignFileError).message).toBe(result.error)
    expect((thrown as UnparseableDesignFileError).relPath).toBe(rel)
  })

  it('an absent document is reported as absent, not as damaged', () => {
    const cwd = tmpCwd()
    const result = readDesignDoc(cwd, 'approval')

    expect(result).toEqual({ ok: false, error: 'design/approval.json does not exist — run a host verb to create it' })
    expect(result.ok ? '' : result.error).not.toContain('does not parse')
  })

  it('a present but unreadable document keeps the by-hand refusal sentence', () => {
    const cwd = tmpCwd()
    writeFileSync(path.join(cwd, 'design', 'approval.json'), '{"contractVersion":')

    expect(readDesignDoc(cwd, 'approval')).toEqual({ ok: false, error: REFUSAL('design/approval.json') })
  })
})
