// AC-20260917-03-13 (D7): `docs/design/design-reference.md` is the frozen source workers re-derive
// from — a passage this spec supersedes must be rewritten IN PLACE and cited from a dated
// `## Amendments` entry, never silently edited as if it had always said this (rationale: a silent
// edit lets a later session re-assert the captured behaviour as authority). This file proves both
// halves: the amendment section exists and is dated first, and every superseded string is gone.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const designReferencePath = path.join(repoRoot, 'docs', 'design', 'design-reference.md')

describe('AC-20260917-03-13: docs/design/design-reference.md carries a dated Amendments entry and drops the retired passages', () => {
  const doc = readFileSync(designReferencePath, 'utf8')

  // D10 (spec 02, 2026-09-18): a new Amendments entry lands on top of the 2026-09-17 one — the
  // fourth pin tone, the client's Approve/Defer controls, the owner's new Defer, and the
  // already-landed `Notice` banner. "Newest first" (D7) means the FIRST entry after the heading
  // must now carry today's date, not 2026-09-17's.
  it('has a top-level ## Amendments section whose first entry is dated 2026-09-18', () => {
    const amendmentsMatch = /^## Amendments\b/m.exec(doc)
    expect(amendmentsMatch).not.toBeNull()
    const from = amendmentsMatch ? amendmentsMatch.index : 0
    const afterHeading = doc.slice(from + (amendmentsMatch?.[0].length ?? 0))
    // "Newest first" (D7) — the first entry after the heading must carry today's date.
    const firstEntry = afterHeading.trimStart()
    expect(firstEntry.slice(0, 200)).toContain('2026-09-18')
  })

  it('no longer contains D1\'s retired PROJECT-group membership rule', () => {
    expect(doc).not.toContain('every note whose `screen` is *not* the current screen')
  })

  it('no longer contains D8\'s retired PROJECT empty-group copy', () => {
    expect(doc).not.toContain('No other notes.')
  })

  it('no longer contains D3\'s retired claim that Approve screen is the only thing that turns a clean screen blue', () => {
    expect(doc).not.toContain('the only thing that turns a clean screen blue')
  })
})
