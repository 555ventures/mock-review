import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it, beforeAll } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'dist', 'cli.js')

beforeAll(() => {
  if (!existsSync(cli)) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
}, 120_000)

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' })
}

describe('mock-review cli', () => {
  it('contract --json prints the contract envelope on stdout and exits 0', () => {
    const r = run(['contract', '--json'])
    expect(r.status).toBe(0)
    expect(r.stderr).toBe('')
    expect(JSON.parse(r.stdout)).toEqual({
      contractVersion: 1,
      package: '@555/mock-review',
      version: '1.0.0',
    })
  })

  it('an unimplemented verb goes to stderr and exits 2', () => {
    const r = run(['check', '--json'])
    expect(r.status).toBe(2)
    expect(r.stdout).toBe('')
    expect(r.stderr.trim()).toBe('mock-review: check not implemented')
  })

  it('ships an executable bin with an env shebang', async () => {
    const { readFileSync, statSync } = await import('node:fs')
    expect(readFileSync(cli, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node')
    expect(statSync(cli).mode & 0o111).toBeGreaterThan(0)
  })
})
