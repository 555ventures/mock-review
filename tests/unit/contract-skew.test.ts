// AC-20260917-01-9 (D6/D10): contractSkew is the pure falsifiable surface behind both e2e driver
// tests' skip — it never spawns anything and never touches the filesystem beyond one read of
// `templatePath`, so this suite proves its outcomes directly instead of through a driver run.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { contractSkew } from '../helpers/cli.js'
import { CONTRACT_VERSION } from '../../src/schemas/version.js'

function writeTemplate(contractVersion: number, fields?: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mock-review-skew-'))
  const file = path.join(dir, 'contract.json')
  writeFileSync(file, JSON.stringify(fields ? { contractVersion, fields } : { contractVersion }))
  return file
}

describe('contractSkew (D6)', () => {
  it('AC-20260917-01-9: returns the exact reason string when the template reports 1 and the package reports 2', () => {
    const templatePath = writeTemplate(1)
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBe(
        'plugin template contract 1 ≠ package contract 2 — build claude-plugins specs/20260917/01 first',
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

  it('AC-20260917-01-9 (D10): returns the exact reason string when the template declares a journey step field (beat) this package\'s journey schema refuses', () => {
    const templatePath = writeTemplate(CONTRACT_VERSION, { 'check.journeys[].steps[]': ['beat'] })
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBe(
        "plugin template declares journey field beat this package's contract does not accept — build mock-review specs/20260917/02-the-story-travels first",
      )
    } finally {
      rmSync(path.dirname(templatePath), { recursive: true, force: true })
    }
  })

  it('AC-20260917-01-9 (D10): returns null when every declared journey/step/edge field parses against this package\'s journey schema', () => {
    const templatePath = writeTemplate(CONTRACT_VERSION, {
      'check.journeys[]': ['id', 'title', 'steps', 'edges', 'resolved', 'unresolved'],
      'check.journeys[].steps[]': ['screen'],
      'check.journeys[].edges[]': ['from', 'to', 'label?'],
    })
    try {
      expect(contractSkew(templatePath, CONTRACT_VERSION)).toBeNull()
    } finally {
      rmSync(path.dirname(templatePath), { recursive: true, force: true })
    }
  })
})
