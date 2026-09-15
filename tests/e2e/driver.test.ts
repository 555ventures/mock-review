// D14: the exit criterion for this spec — the plugin's own mocks-driver.js, run against a copy
// of the fixture host with the built binary, no stub anywhere (Rationale: "nothing here may be
// judged green through a stand-in"). SPEC_PLUGIN_ROOT defaults to ~/projects/claude-plugins.
import { beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { ensureFixtures, greenHost } from '../setup.js'
import { copyHostInto, linkInstalledBin, run, DESIGN_STATE_FILES } from '../helpers/cli.js'

const pluginRoot = process.env.SPEC_PLUGIN_ROOT || path.join(homedir(), 'projects', 'claude-plugins')
const driverScript = path.join(pluginRoot, 'spec', 'scripts', 'mocks-driver.js')
const hasPlugin = existsSync(driverScript)
const describeIfPlugin = hasPlugin ? describe : describe.skip

function runDriver(scratchRoot: string, args: string[]) {
  return spawnSync(process.execPath, [driverScript, '--root', scratchRoot, ...args], { encoding: 'utf8' })
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
    appDir = path.join(scratchRoot, 'app')
    copyHostInto(greenHost, appDir)
    linkInstalledBin(appDir)
    mkdirSync(path.join(scratchRoot, 'design', 'mocks'), { recursive: true })
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
        'A new customer opens the app, checks their wallet, and goes to their account.',
        '```surfaces',
        'Home',
        'Home -> Account',
        '```',
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

  it('AC-20260915-01-23: seed-done, shell-drawn and journey-drawn each exit 0 and record their mark in status.json', () => {
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
})
