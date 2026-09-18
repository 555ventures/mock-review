import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brokenHost, ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'
import { startServe, stopServe, type Serve } from '../helpers/serve.js'

type Finding = { kind: string; severity: string; file: string; message: string }
type Check = {
  contractVersion: number
  ok: boolean
  findings: Finding[]
  screens: Array<{ name: string; file: string; states: string[]; shell: string | null; hash: string; lines: number }>
  shells: Array<{ name: string; file: string; examples: string[] }>
  journeys: Array<{
    id: string
    title?: string
    persona?: string
    steps?: Array<{ screen: string; beat?: string; state?: string }>
    edges?: Array<{ from: number; to: number; label?: string; say?: string }>
    resolved: boolean
    unresolved: Array<{ from: number; to: number; reason: string }>
  }>
  themes: string[]
  config: Record<string, unknown>
}

function runCheck(host: string): Check {
  const r = run(host, ['check', '--json'])
  return JSON.parse(r.stdout) as Check
}

describe('mock-review check --json (built dist/)', () => {
  beforeAll(async () => {
    await ensureFixtures()
  }, 180_000)

  it('AC-20260917-01-2 (rewrites AC-20260915-01-5): reports contractVersion: 2 on the green fixture host, with screens/shells/themes content otherwise unchanged', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-')
    const check = runCheck(host)

    expect(check.contractVersion).toBe(2)
    expect(check.screens.map((s) => s.name).sort()).toEqual(['account', 'home'])
    expect(check.shells.map((s) => s.name)).toEqual(['ConsoleShell'])
    expect(check.themes).toEqual(['nova'])
  })

  it('AC-20260915-01-5: reports screens/shells/themes for the green fixture host, excluding design/examples and components/ui', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-')
    const check = runCheck(host)

    expect(check.screens.map((s) => s.name).sort()).toEqual(['account', 'home'])
    expect(check.shells.map((s) => s.name)).toEqual(['ConsoleShell'])
    expect(check.themes).toEqual(['nova'])

    const badFile = (f: string) => f.startsWith('design/examples/') || f.startsWith('src/components/ui/')
    expect(check.screens.some((s) => badFile(s.file))).toBe(false)
    expect(check.findings.some((f) => badFile(f.file))).toBe(false)
  })

  // D5/AC-20260917-04-11 (rewrites AC-20260915-01-5): a plain `check --json` never reads
  // design/approval.json at all (only `check --look`'s theme capture does, via `themeFor`), so a
  // truncated approval.json cannot perturb its screens/shells/themes report either way — asserted
  // here as the "SHALL CONTINUE TO" pin the AC names. `check --look`'s own theme capture (the
  // mechanism D5 actually renames — `themeFor` now derives from `readDesignDoc` rather than its
  // own `try/catch`, keeping the exact same silent-`undefined` policy) is exercised in the same
  // test since it is the only current call site that reads approval.json from src/cli/check.ts.
  it('AC-20260917-04-11: check --json continues to report screens/shells/themes unaffected by a truncated design/approval.json, and check --look continues to capture screenshots (theme capture never fails on an unreadable approval document)', async () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-badapproval-')
    writeFileSync(path.join(host, 'design', 'approval.json'), '{"contractVersion":')

    const check = runCheck(host)
    expect(check.screens.map((s) => s.name).sort()).toEqual(['account', 'home'])
    expect(check.shells.map((s) => s.name)).toEqual(['ConsoleShell'])
    expect(check.themes).toEqual(['nova'])

    let serve: Serve | undefined
    try {
      serve = await startServe(greenHost, 'mock-review-check-look-badapproval-')
      writeFileSync(path.join(serve.host, 'design', 'approval.json'), '{"contractVersion":')

      const r = run(serve.host, ['check', '--look', 'home', '--state', 'Default'])
      expect(r.status).toBe(0)
      const printed = r.stdout.trim().split('\n')
      expect(printed).toContain('design/screenshots/home-Default-1280x800-light.png')
      expect(existsSync(path.join(serve.host, 'design', 'screenshots', 'home-Default-1280x800-light.png'))).toBe(true)
    } finally {
      await stopServe(serve)
    }
  }, 60_000)

  it('AC-20260915-01-6: reports config loaded from mock.config.ts through the Vite runner', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-')
    const check = runCheck(host)

    expect(check.config).toEqual({
      name: 'app',
      port: 5180,
      targets: { viewports: ['360x800', '1280x800'], schemes: ['light', 'dark'] },
      theme: null,
      client: { token: 'replace-me' },
    })
  })

  it('AC-20260915-01-7: reports ok:false with layer, doc and type findings on the broken fixture host', () => {
    const host = copyFixtureHost(brokenHost, 'mock-review-check-broken-')
    const check = runCheck(host)

    expect(check.ok).toBe(false)
    expect(check.findings).toContainEqual({
      kind: 'layer',
      severity: 'error',
      file: 'src/screens/home.tsx',
      message: 'imports @/lib/utils',
    })
    expect(check.findings).toContainEqual({
      kind: 'doc',
      severity: 'error',
      file: 'src/components/Badge.tsx',
      message: 'missing doc line',
    })
    const typeFinding = check.findings.find((f) => f.kind === 'type' && f.file === 'src/screens/account.tsx')
    expect(typeFinding).toBeDefined()
    expect(typeFinding?.severity).toBe('error')
    expect(typeFinding?.message.startsWith('TS2322:')).toBe(true)
  })

  it('AC-20260915-01-8: reports a render finding for the throwing state and none for the others, on the broken fixture host', () => {
    const host = copyFixtureHost(brokenHost, 'mock-review-check-broken-')
    const check = runCheck(host)

    expect(check.findings).toContainEqual({
      kind: 'render',
      severity: 'error',
      file: 'src/screens/account.tsx',
      message: 'Broken: boom',
    })
    const renderFindings = check.findings.filter((f) => f.kind === 'render' && f.file === 'src/screens/account.tsx')
    expect(renderFindings).toHaveLength(1)
  })

  it('AC-20260915-01-8: a screen module that throws at import time yields exactly one render finding, "module failed to load: <msg>", and no meta: missing finding (D17/D19)', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-loadfail-')
    const accountFile = path.join(host, 'src', 'screens', 'account.tsx')
    writeFileSync(accountFile, `throw new Error('boom-load')\n` + readFileSync(accountFile, 'utf8'))

    const check = runCheck(host)

    const findingsForFile = check.findings.filter((f) => f.file === 'src/screens/account.tsx')
    const renderFindings = findingsForFile.filter((f) => f.kind === 'render')
    expect(renderFindings).toEqual([
      {
        kind: 'render',
        severity: 'error',
        file: 'src/screens/account.tsx',
        message: 'module failed to load: boom-load',
      },
    ])
    expect(findingsForFile.some((f) => f.message === 'meta: missing')).toBe(false)
  })

  it('AC-20260915-01-9: reports a config finding and a null config on the broken fixture host (mock.config.ts lacks client)', () => {
    const host = copyFixtureHost(brokenHost, 'mock-review-check-broken-')
    const check = runCheck(host)

    const configFinding = check.findings.find((f) => f.kind === 'config')
    expect(configFinding).toBeDefined()
    expect(configFinding).toMatchObject({ kind: 'config', severity: 'error', file: 'mock.config.ts' })
    expect(typeof configFinding?.message).toBe('string')
    expect(configFinding?.message.length).toBeGreaterThan(0)

    expect(check.config).toEqual({ name: null, port: null, targets: null, theme: null, client: null })
  })

  it('AC-20260915-01-10: reports size and states warnings (no twin finding) after padding home.tsx and adding an unexampled state, in a scratch copy', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-size-')
    const homeFile = path.join(host, 'src', 'screens', 'home.tsx')
    appendFileSync(homeFile, '\n'.repeat(140))
    const source = readFileSync(homeFile, 'utf8')
    writeFileSync(homeFile, source.replace(`states: ['default', 'empty']`, `states: ['default', 'empty', 'ghost']`))

    const check = runCheck(host)

    expect(check.ok).toBe(true)
    const sizeFinding = check.findings.find((f) => f.kind === 'size' && f.file === 'src/screens/home.tsx')
    expect(sizeFinding).toBeDefined()
    expect(sizeFinding?.severity).toBe('warn')
    const n = Number(sizeFinding?.message.match(/^(\d+) lines$/)?.[1])
    expect(n).toBeGreaterThan(150)

    expect(check.findings).toContainEqual({
      kind: 'states',
      severity: 'warn',
      file: 'src/screens/home.tsx',
      message: 'state ghost has no example',
    })
    expect(check.findings.some((f) => f.kind === 'twin')).toBe(false)
  })

  it('AC-20260915-01-11: reports home screen metadata (states, shell, hash, lines) and ConsoleShell examples on the green fixture host', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-')
    const check = runCheck(host)

    const home = check.screens.find((s) => s.name === 'home')
    expect(home).toBeDefined()
    expect(home?.states).toEqual(['default', 'empty'])
    expect(home?.shell).toBe('ConsoleShell')
    const bytes = readFileSync(path.join(host, 'src', 'screens', 'home.tsx'))
    expect(home?.hash).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(home?.lines).toBe(bytes.toString('utf8').split('\n').length)

    const shell = check.shells.find((s) => s.name === 'ConsoleShell')
    expect(shell?.examples).toEqual(['Default'])
  })

  it('AC-20260915-01-11: the hash changes after a one-character edit to home.tsx, in a scratch copy', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-hash-')
    const before = runCheck(host).screens.find((s) => s.name === 'home')?.hash

    const homeFile = path.join(host, 'src', 'screens', 'home.tsx')
    writeFileSync(homeFile, readFileSync(homeFile, 'utf8').replace('Account</Button>', 'account</Button>'))

    const after = runCheck(host).screens.find((s) => s.name === 'home')?.hash
    expect(after).not.toBe(before)
  })

  it('AC-20260915-01-12: resolves the first-visit journey on the green fixture host', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-')
    const check = runCheck(host)

    expect(check.journeys).toHaveLength(1)
    expect(check.journeys[0]).toMatchObject({ id: 'first-visit', resolved: true, unresolved: [] })
  })

  it('AC-20260915-01-12: an edge with no matching control is unresolved (and produces no finding), in a scratch copy', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-unresolved-')
    const homeFile = path.join(host, 'src', 'screens', 'home.tsx')
    writeFileSync(homeFile, readFileSync(homeFile, 'utf8').replace(' data-to="Account"', ''))

    const check = runCheck(host)

    expect(check.journeys[0]).toEqual({
      id: 'first-visit',
      title: 'First visit',
      persona: 'a new customer',
      steps: [
        { screen: 'home', beat: 'I open the app' },
        { screen: 'account', beat: 'I land on my account', state: 'default' },
      ],
      edges: [{ from: 0, to: 1, label: 'Account', say: 'I tap Account' }],
      resolved: false,
      unresolved: [{ from: 0, to: 1, reason: 'no control with data-to="Account" on home' }],
    })
    expect(check.ok).toBe(true)
    expect(check.findings.some((f) => f.kind === 'twin' || JSON.stringify(f).includes('unresolved'))).toBe(false)
  })

  // AC-20260917-02-1 (D1): every one of beat/state/say/persona is echoed verbatim from
  // `check --json`'s own steps/edges/journey — and a step written with ONLY `screen` emits
  // exactly `{"screen":"home"}`, never `{"screen":"home","beat":undefined}` (zod 4.6.5 omits
  // absent optional keys from parse output, A4). Rewrites the pre-02 shape of
  // AC-20260915-01-12's own case above.
  it('AC-20260917-02-1: check --json echoes step.beat/state, edge.say and journey.persona verbatim, and omits beat entirely for a beat-less step', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-beats-')
    const check = runCheck(host)

    const journey = check.journeys[0]
    expect(journey?.steps?.[0]).toEqual({ screen: 'home', beat: 'I open the app' })
    expect(journey?.steps?.[1]).toEqual({ screen: 'account', beat: 'I land on my account', state: 'default' })
    expect(journey?.edges?.[0]).toEqual({ from: 0, to: 1, label: 'Account', say: 'I tap Account' })

    // A beat-less step (only `screen`) must be echoed as exactly `{"screen":"home"}` — 'beat' in
    // step is false, never `"beat":undefined` on the wire. The shared fixture's own `Step.beat`
    // stays required (D13 pins it to the plugin template, verbatim) — a host that genuinely never
    // had beats never had a required-`beat` type checking against it either, so this scratch
    // copy's own `Step` type is relaxed alongside the literal, local to this copy only, so the
    // mutated host stays internally consistent instead of failing its own typecheck.
    const journeysFile = path.join(host, 'src', 'journeys.ts')
    const journeysSrc = readFileSync(journeysFile, 'utf8')
    const beatless = journeysSrc
      .replace('  beat: string\n', '  beat?: string\n')
      .replace(
        "{ screen: 'account', beat: 'I land on my account', state: 'default' }",
        "{ screen: 'account' }",
      )
    expect(beatless).not.toBe(journeysSrc)
    expect(beatless).toContain('beat?: string')
    writeFileSync(journeysFile, beatless)

    const beatlessCheck = runCheck(host)
    const raw = JSON.stringify(beatlessCheck.journeys[0]?.steps?.[1])
    expect(raw).toBe('{"screen":"account"}')
    expect('beat' in (beatlessCheck.journeys[0]?.steps?.[1] ?? {})).toBe(false)
  })

  // AC-20260917-02-2 (D1/D2): `persona` is reported when declared, and omitted entirely
  // (`'persona' in journeys[0]` is false) when the journey declares none.
  it('AC-20260917-02-2: journey.persona is reported when declared, and omitted when the journey declares none', () => {
    const withPersonaHost = copyFixtureHost(greenHost, 'mock-review-check-persona-')
    const withPersonaCheck = runCheck(withPersonaHost)
    expect(withPersonaCheck.journeys[0]?.persona).toBe('a new customer')

    const noPersonaHost = copyFixtureHost(greenHost, 'mock-review-check-nopersona-')
    const journeysFile = path.join(noPersonaHost, 'src', 'journeys.ts')
    const journeysSrc = readFileSync(journeysFile, 'utf8')
    const noPersona = journeysSrc.replace("    persona: 'a new customer',\n", '')
    expect(noPersona).not.toBe(journeysSrc)
    writeFileSync(journeysFile, noPersona)

    const noPersonaCheck = runCheck(noPersonaHost)
    expect('persona' in (noPersonaCheck.journeys[0] ?? {})).toBe(false)
  })

  // AC-20260917-02-3 (D3): a step with no beat is a warn-severity `beats` finding naming the
  // journey and the 1-based step index — never a refusal, and `check.ok` stays true.
  it('AC-20260917-02-3: a beat-less step yields exactly one warn "beats" finding naming the journey and step index, and check.ok stays true', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-beatswarn-')
    const journeysFile = path.join(host, 'src', 'journeys.ts')
    const journeysSrc = readFileSync(journeysFile, 'utf8')
    // The shared fixture's own `Step.beat` stays required (D13 pins it to the plugin template
    // verbatim); this scratch copy's `Step` type is relaxed alongside the literal so the mutated
    // host still typechecks against itself — otherwise `typeFindings` correctly reports a real
    // TS2741 `error`, which flips `check.ok` false for a reason unrelated to this AC's own `warn`
    // finding.
    const beatless = journeysSrc
      .replace('  beat: string\n', '  beat?: string\n')
      .replace(
        "{ screen: 'account', beat: 'I land on my account', state: 'default' }",
        "{ screen: 'account' }",
      )
    expect(beatless).not.toBe(journeysSrc)
    expect(beatless).toContain('beat?: string')
    writeFileSync(journeysFile, beatless)

    const check = runCheck(host)
    expect(check.ok).toBe(true)
    const beatsFindings = check.findings.filter((f) => f.kind === 'beats')
    expect(beatsFindings).toHaveLength(1)
    expect(beatsFindings[0]).toEqual({
      kind: 'beats',
      severity: 'warn',
      file: 'src/journeys.ts',
      message: 'journey first-visit step 2 has no beat — `--mark journey-drawn` will refuse this step',
    })
  })

  it('AC-20260917-02-3: a journey whose every step carries a beat emits no beats finding', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-nobeatswarn-')
    const check = runCheck(host)
    expect(check.findings.some((f) => f.kind === 'beats')).toBe(false)
  })

  it('AC-20260916-03-6: a scaffold-owned src/components/theme-provider.tsx is invisible to check (D1) — ok:true, no doc findings for it', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-scaffold-')
    writeFileSync(
      path.join(host, 'src', 'components', 'theme-provider.tsx'),
      'import * as React from "react"\nexport function ThemeProvider({ children }: { children: React.ReactNode }) {\n  return <>{children}</>\n}\n',
    )

    const check = runCheck(host)

    expect(check.ok).toBe(true)
    expect(check.findings.some((f) => f.file === 'src/components/theme-provider.tsx')).toBe(false)
  })

  it('AC-20260916-03-7: a state spelled differently than its example key resolves cleanly (D4/D6) — no states finding, states unchanged', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-nophone-')
    const accountFile = path.join(host, 'src', 'screens', 'account.tsx')
    const source = readFileSync(accountFile, 'utf8')
    writeFileSync(
      accountFile,
      source
        .replace(`states: ['default'],`, `states: ['default', 'no-phone'],`)
        .replace('export const examples = {\n  Default: <Account />,\n}', 'export const examples = {\n  Default: <Account />,\n  NoPhone: <Account />,\n}'),
    )

    const check = runCheck(host)

    expect(check.ok).toBe(true)
    expect(check.findings.some((f) => f.file === 'src/screens/account.tsx')).toBe(false)
    const account = check.screens.find((s) => s.name === 'account')
    expect(account?.states).toEqual(['default', 'no-phone'])
  })

  it('AC-20260916-03-8: two normalised-only candidates for one state yields exactly one "matches several examples" warn, ok:true', () => {
    const host = copyFixtureHost(greenHost, 'mock-review-check-ambiguous-')
    const accountFile = path.join(host, 'src', 'screens', 'account.tsx')
    const source = readFileSync(accountFile, 'utf8')
    writeFileSync(
      accountFile,
      source
        .replace(`states: ['default'],`, `states: ['default', 'no-phone'],`)
        .replace(
          'export const examples = {\n  Default: <Account />,\n}',
          'export const examples = {\n  Default: <Account />,\n  NoPhone: <Account />,\n  no_phone: <Account />,\n}',
        ),
    )

    const check = runCheck(host)

    const findingsForFile = check.findings.filter((f) => f.file === 'src/screens/account.tsx')
    expect(findingsForFile).toEqual([
      {
        kind: 'states',
        severity: 'warn',
        file: 'src/screens/account.tsx',
        message: 'state no-phone matches several examples: NoPhone, no_phone',
      },
    ])
    expect(check.ok).toBe(true)
  })
})
