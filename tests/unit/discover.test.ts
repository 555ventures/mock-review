// AC-20260916-03-5 (D1 of specs/20260916/03-state-keys-and-scaffold-components.md):
// `discoverHost` filters `src/components/theme-provider.tsx` out of its `components` listing —
// the file the `shadcn` vite scaffold itself writes there, not the mock author — the same way it
// already skips `src/components/ui/**`. Red on the pre-image: today's `discoverHost` has no
// `SCAFFOLD_OWNED_COMPONENTS` filter, so `theme-provider` still shows up in `components`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverHost } from '../../src/analysis/discover.js'

let scratch: string | undefined

afterEach(() => {
  if (scratch) {
    rmSync(scratch, { recursive: true, force: true })
    scratch = undefined
  }
})

describe('AC-20260916-03-5: discoverHost excludes the scaffold-owned theme-provider.tsx', () => {
  it('components excludes theme-provider.tsx and src/components/ui/**, but keeps a real component', () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'mock-review-discover-'))
    const componentsDir = path.join(scratch, 'src', 'components')
    const uiDir = path.join(componentsDir, 'ui')
    mkdirSync(uiDir, { recursive: true })

    writeFileSync(
      path.join(componentsDir, 'theme-provider.tsx'),
      'import * as React from "react"\nexport function ThemeProvider({ children }: { children: React.ReactNode }) {\n  return <>{children}</>\n}\n',
    )
    writeFileSync(path.join(componentsDir, 'Badge.tsx'), 'export function Badge() { return null }\n')
    writeFileSync(path.join(uiDir, 'button.tsx'), 'export function Button() { return null }\n')

    const result = discoverHost(scratch)

    expect(result.components).toEqual([{ name: 'Badge', file: 'src/components/Badge.tsx' }])
  })
})
