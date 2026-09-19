// D14: the exit criterion for this spec — the plugin's own mocks-driver.js, run against a copy
// of the fixture host with the built binary, no stub anywhere (Rationale: "nothing here may be
// judged green through a stand-in"). SPEC_PLUGIN_ROOT defaults to ~/projects/claude-plugins.
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { contractSkew, copyHostInto, linkInstalledBin, registerScratchDir, run, spawnWithTimeout, DESIGN_STATE_FILES } from '../helpers/cli.js'
import { CONTRACT_VERSION } from '../../src/schemas/version.js'

const pluginRoot = process.env.SPEC_PLUGIN_ROOT || path.join(homedir(), 'projects', 'claude-plugins')
const driverScript = path.join(pluginRoot, 'spec', 'scripts', 'mocks-driver.js')
// D6/D10: contractSkew is the pure falsifiable surface behind the driver-running test's own skip
// (AC-20260917-01-9/AC-20260917-02-19, its own unit suite) — it is consulted here rather than
// assumed, so this file never hardcodes whether the installed plugin checkout's own template is
// currently in or out of skew with this package's contract.
const pluginContractTemplate = path.join(pluginRoot, 'spec', 'templates', 'mock', 'contract.json')
const hasPlugin = existsSync(driverScript)
const describeIfPlugin = hasPlugin ? describe : describe.skip

// D20: mocks-driver.js shells out to the built CLI internally (contractOrDie/checkJson); a hang
// in that inner spawn would otherwise hang this outer one too, so it carries the same guard.
function runDriver(scratchRoot: string, args: string[]) {
  return spawnWithTimeout(process.execPath, [driverScript, '--root', scratchRoot, ...args])
}

function statusJson(scratchRoot: string): {
  marks: { seedDone: string | null; shellDrawn: string | null; themePicked: string | null; approved: string | null }
  journeys: Record<string, { drawn: string | null; approved: string | null }>
} {
  return JSON.parse(readFileSync(path.join(scratchRoot, 'design', 'mocks', 'status.json'), 'utf8'))
}

describeIfPlugin('mocks-driver.js against the built binary (built .test-dist/, D19) [env: SPEC_PLUGIN_ROOT]', () => {
  let scratchRoot: string
  let appDir: string

  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  function setupScratch() {
    scratchRoot = mkdtempSync(path.join(tmpdir(), 'mock-review-e2e-'))
    // Item 3: this file creates its own scratch root directly, so it registers it itself for the
    // shared exit-time cleanup (tests/helpers/cli.ts) rather than leaking it.
    registerScratchDir(scratchRoot)
    appDir = path.join(scratchRoot, 'app')
    copyHostInto(greenHost, appDir)
    linkInstalledBin(appDir)
    mkdirSync(path.join(scratchRoot, 'design', 'mocks'), { recursive: true })
    // D13: the seed's own beats (the client's numbered sentences, `N. "sentence" -> screen[@state]`)
    // must copy `src/journeys.ts`'s beats verbatim — `--mark journey-drawn` compares them
    // beat-for-beat against `check --json`'s steps (mocks-driver.js `findBeatsMismatch`). This
    // grammar replaces the retired ```surfaces``` block (A8/A9).
    writeFileSync(
      path.join(scratchRoot, 'design', 'mocks', 'seed.md'),
      [
        '# Seed — Mock Review Fixture',
        '',
        '## Product',
        '',
        'A tiny wallet app used to prove the mock-review CLI end to end.',
        'It has a home screen and an account screen.',
        'The reviewer package validates it.',
        '',
        '## Records',
        '',
        '- customers',
        '',
        '## Journeys',
        '',
        '### first-visit',
        'a new customer',
        '1. "I open the app" -> home',
        '2. "I land on my account" -> account@default',
        '',
      ].join('\n'),
    )
  }

  it('AC-20260915-01-22: after tests/setup.ts, tests/fixtures/host/node_modules resolves react/vite/@ so check --json on the fixture reports ok: true', () => {
    // This runs `check` in place on the committed fixture (not a scratch copy — this AC is
    // specifically about that fixture's own node_modules resolving; see deviations sidecar).
    // Per D9, `check` may write design-state files into the fixture's design/ directory. Any
    // such file this run creates must not survive the test — the fixture is checked-in and other
    // tests' copyFixtureHost() calls must see it exactly as committed. Never delete a file that
    // already existed before this run.
    const designDir = path.join(greenHost, 'design')
    const preexisting = new Set(DESIGN_STATE_FILES.filter((f) => existsSync(path.join(designDir, f))))
    try {
      const r = run(greenHost, ['check', '--json'])
      expect(r.status).toBe(0)
      const check = JSON.parse(r.stdout) as { ok: boolean }
      expect(check.ok).toBe(true)
    } finally {
      for (const f of DESIGN_STATE_FILES) {
        const filePath = path.join(designDir, f)
        if (!preexisting.has(f) && existsSync(filePath)) rmSync(filePath)
      }
    }
  })

  // AC-20260918-04-9 (rewrites AC-20260915-01-23): once the sibling plugin spec (D9) has landed,
  // both repos report contract 3 and contractSkew returns null — the driver completes with no
  // contract-skew refusal at all. Until then this stays RED via ctx.skip's own skew reason, which
  // is the expected state D9 describes for anyone with a plugin checkout between the two landings.
  it('AC-20260918-04-9: seed-done, shell-drawn and journey-drawn each exit 0 and record their mark in status.json', (ctx) => {
    const skewReason = contractSkew(pluginContractTemplate, CONTRACT_VERSION)
    if (skewReason) ctx.skip(skewReason)
    setupScratch()

    const seedDone = runDriver(scratchRoot, ['--mark', 'seed-done'])
    expect(seedDone.status).toBe(0)
    expect(statusJson(scratchRoot).marks.seedDone).toBeTruthy()

    const shellDrawn = runDriver(scratchRoot, ['--mark', 'shell-drawn'])
    expect(shellDrawn.status).toBe(0)
    expect(statusJson(scratchRoot).marks.shellDrawn).toBeTruthy()

    const journeyDrawn = runDriver(scratchRoot, ['--mark', 'journey-drawn', '--journey', 'first-visit'])
    expect(journeyDrawn.status).toBe(0)
    expect(statusJson(scratchRoot).journeys['first-visit']?.drawn).toBeTruthy()
  }, 60_000)

  // AC-20260918-04-10/D6: the driver's `client waive` path now shells out to the package's own
  // `mock-review waive` verb instead of hand-writing design/approval.json itself — the observable
  // is the BYTES, not who wrote them. The package's own `writeJsonAtomic` emits compact
  // `JSON.stringify` with no `\n  ` indentation, unlike the driver's old `JSON.stringify(obj, null,
  // 2) + '\n'`; the written document must also parse under ApprovalSchema and carry
  // contractVersion 3.
  it('AC-20260918-04-10: client waive leaves a compact (non-indented) design/approval.json parsing under ApprovalSchema at contractVersion 3', async (ctx) => {
    const skewReason = contractSkew(pluginContractTemplate, CONTRACT_VERSION)
    if (skewReason) ctx.skip(skewReason)
    setupScratch()

    const seedDone = runDriver(scratchRoot, ['--mark', 'seed-done'])
    expect(seedDone.status).toBe(0)
    const shellDrawn = runDriver(scratchRoot, ['--mark', 'shell-drawn'])
    expect(shellDrawn.status).toBe(0)
    const journeyDrawn = runDriver(scratchRoot, ['--mark', 'journey-drawn', '--journey', 'first-visit'])
    expect(journeyDrawn.status).toBe(0)

    const waiveRes = runDriver(scratchRoot, ['client', 'waive', '--journey', 'first-visit', '--reason', 'client unreachable'])
    expect(waiveRes.status).toBe(0)

    const approvalPath = path.join(appDir, 'design', 'approval.json')
    const raw = readFileSync(approvalPath, 'utf8')
    // The package's writeJsonAtomic never indents; the driver's retired hand-write did
    // (`JSON.stringify(obj, null, 2) + '\n'`) — a compact document is the fingerprint of who wrote
    // the bytes, not an inference from any header or comment.
    expect(raw).not.toMatch(/\n {2}/)

    const { ApprovalSchema } = await import('../../src/schemas/approval.js')
    const parsed = ApprovalSchema.parse(JSON.parse(raw))
    expect(parsed.contractVersion).toBe(3)
    expect(parsed.journeys['first-visit']?.client).toBe('waived')
  }, 60_000)
})
