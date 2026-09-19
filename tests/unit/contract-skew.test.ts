// AC-20260917-01-9 (D6/D10), AC-20260917-02-19: contractSkew is the pure falsifiable surface
// behind both e2e driver tests' skip — it never spawns anything and never touches the filesystem
// beyond one read of `templatePath`, so this suite proves its outcomes directly instead of
// through a driver run.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { contractSkew } from '../helpers/cli.js'
import { CONTRACT_VERSION } from '../../src/schemas/version.js'

const pluginRoot =
  process.env.SPEC_PLUGIN_ROOT || path.join(homedir(), 'projects', 'claude-plugins')
const pluginContractTemplate = path.join(pluginRoot, 'spec', 'templates', 'mock', 'contract.json')
const hasPlugin = existsSync(pluginContractTemplate)
const thisDir = path.dirname(fileURLToPath(import.meta.url))

function writeTemplate(contractVersion: number, fields?: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mock-review-skew-'))
  const file = path.join(dir, 'contract.json')
  writeFileSync(file, JSON.stringify(fields ? { contractVersion, fields } : { contractVersion }))
  return file
}

describe('contractSkew (D6)', () => {
  it('AC-20260918-04-1: returns the exact reason string when the template reports 2 and the package reports 3', () => {
    const templatePath = writeTemplate(2)
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBe(
        `plugin template contract 2 ≠ package contract ${CONTRACT_VERSION} — build claude-plugins specs/20260918/01-mock-contract-v3.md first`,
      )
    } finally {
      rmSync(path.dirname(templatePath), { recursive: true, force: true })
    }
  })

  it('AC-20260917-01-9: returns null when the template reports the same contractVersion as the package', () => {
    const templatePath = writeTemplate(CONTRACT_VERSION)
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBeNull()
    } finally {
      rmSync(path.dirname(templatePath), { recursive: true, force: true })
    }
  })

  it('AC-20260917-01-9: returns null when the template path does not exist (a host without the plugin installed is not skew)', () => {
    const missing = path.join(tmpdir(), 'mock-review-skew-does-not-exist', 'contract.json')
    expect(contractSkew(missing, CONTRACT_VERSION)).toBeNull()
  })

  // AC-20260917-02-19: D1 puts `beat` on the base `StepSchema` (optional), so a template
  // declaring it is no longer skew — this inverts the pre-spec-02 refusal above.
  it("AC-20260917-02-19 (D1, inverts the pre-02 refusal): returns null when the template declares a journey step field (beat) this package's journey schema now accepts", () => {
    const templatePath = writeTemplate(CONTRACT_VERSION, { 'check.journeys[].steps[]': ['beat'] })
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBeNull()
    } finally {
      rmSync(path.dirname(templatePath), { recursive: true, force: true })
    }
  })

  it('AC-20260917-02-19 (D10): returns the exact reason string when the template declares a journey field this package still refuses', () => {
    const templatePath = writeTemplate(CONTRACT_VERSION, { 'check.journeys[]': ['nonesuch'] })
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBe(
        "plugin template declares journey field nonesuch this package's contract does not accept — build mock-review specs/20260917/02-the-story-travels first",
      )
    } finally {
      rmSync(path.dirname(templatePath), { recursive: true, force: true })
    }
  })

  it("AC-20260917-02-19 (D10): returns null when every declared journey/step/edge field — the full v2 field set — parses against this package's journey schema", () => {
    const templatePath = writeTemplate(CONTRACT_VERSION, {
      'check.journeys[]': ['id', 'title', 'persona?', 'steps', 'edges', 'resolved', 'unresolved'],
      'check.journeys[].steps[]': ['screen', 'beat', 'state?'],
      'check.journeys[].edges[]': ['from', 'to', 'label?', 'say?'],
    })
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBeNull()
    } finally {
      rmSync(path.dirname(templatePath), { recursive: true, force: true })
    }
  })

  it.skipIf(!hasPlugin)(
    "AC-20260917-02-19 [env: SPEC_PLUGIN_ROOT]: contractSkew(<the plugin's live template>, CONTRACT_VERSION) returns null",
    () => {
      expect(contractSkew(pluginContractTemplate, CONTRACT_VERSION)).toBeNull()
    },
  )

  it.skipIf(!hasPlugin)(
    "AC-20260917-02-19 [env: SPEC_PLUGIN_ROOT]: tests/fixtures/contract.json is byte-equal to the plugin's spec/templates/mock/contract.json",
    () => {
      const fixturePath = path.resolve(thisDir, '..', 'fixtures', 'contract.json')
      expect(readFileSync(fixturePath, 'utf8')).toBe(readFileSync(pluginContractTemplate, 'utf8'))
    },
  )
})
