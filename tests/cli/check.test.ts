import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brokenHost, ensureFixtures, greenHost } from '../setup.js'
import { copyFixtureHost, run } from '../helpers/cli.js'

type Finding = { kind: string; severity: string; file: string; message: string }
type Check = {
  ok: boolean
  findings: Finding[]
  screens: Array<{ name: string; file: string; states: string[]; shell: string | null; hash: string; lines: number }>
  shells: Array<{ name: string; file: string; examples: string[] }>
  journeys: Array<{ id: string; resolved: boolean; unresolved: Array<{ from: number; to: number; reason: string }> }>
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
      steps: [{ screen: 'home' }, { screen: 'account' }],
      edges: [{ from: 0, to: 1, label: 'Account' }],
      resolved: false,
      unresolved: [{ from: 0, to: 1, reason: 'no control with data-to="Account" on home' }],
    })
    expect(check.ok).toBe(true)
    expect(check.findings.some((f) => f.kind === 'twin' || JSON.stringify(f).includes('unresolved'))).toBe(false)
  })
})
