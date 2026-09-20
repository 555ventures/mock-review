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

  // AC-20260919-01-14 (D14): the pre-image version of this test hard-coded a date
  // (`toContain('2026-09-18')`), which breaks on every future amendment — the next spec pays for
  // this one's doc edit. Rewritten generically: parse every `### YYYY-MM-DD` entry heading after
  // `## Amendments` and require the FIRST to be the newest (the maximum), so a 2026-09-20 entry
  // added above this test would pass unedited and a 2026-09-16 entry added above would fail.
  //
  // AC-20260919-01-13 (D13): folded into the same test rather than left standalone, so this can
  // never pass vacuously before spec 01's own 2026-09-19 Amendments entry actually lands — today
  // the document's dates alone already satisfy "first is newest" (both existing entries are
  // 2026-09-18), so only the showNotes/rule-26 half below makes this genuinely fail pre-image.
  it('AC-20260919-01-13, AC-20260919-01-14: has a top-level ## Amendments section whose first entry is the newest dated entry, and no surviving assertion of the retired showNotes coupling remains', () => {
    const amendmentsMatch = /^## Amendments\b/m.exec(doc)
    expect(amendmentsMatch).not.toBeNull()
    const from = amendmentsMatch ? amendmentsMatch.index + amendmentsMatch[0].length : 0
    const afterHeading = doc.slice(from)

    const headingDates = [...afterHeading.matchAll(/^### (\d{4}-\d{2}-\d{2})\b/gm)]
      .map((m) => m[1])
      .filter((d): d is string => d !== undefined)
    expect(headingDates.length).toBeGreaterThan(0)
    const first = headingDates[0]
    if (!first) throw new Error('no dated Amendments entry found')
    const newest = headingDates.reduce((a, b) => (b > a ? b : a), first)
    expect(first).toBe(newest)

    // D13: `showNotes` is retired everywhere in the document (§2's Notes toggle passage, §5, and
    // rule 26's condition), and rule 26 now reads `pins && !journey`.
    expect(doc).not.toContain('showNotes')
    expect(doc).toContain('pins && !journey')
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
