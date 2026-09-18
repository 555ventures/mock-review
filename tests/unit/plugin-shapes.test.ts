// D7: literal copies of every design-document shape the plugin's verbs write today, each with a
// comment naming its source file and the contractVersion it was copied at, asserted to parse.
// Copied, never imported (D7's rationale: no shared package, and a cross-repo import would couple
// this repo's test run to a sibling checkout). This is the test that would have caught both live
// instances before they shipped: the missing `approvedAt` (spec 02 D8) and the missing `theme`
// (A3, below) — it is where the *next* unlearned field surfaces as a red test instead of a blank
// page.
import { describe, expect, it } from 'vitest'
import { ApprovalSchema } from '../../src/schemas/approval.js'
import { NotesSchema } from '../../src/schemas/notes.js'

describe('AC-20260917-04-6: plugin-written design-document shapes parse against this package\'s read-back schemas', () => {
  it('defaultApproval (claude-plugins/tests/mocks/mock-app-fixtures.js:95-97, contractVersion 1) has no theme key and must parse with theme null; defaultNotes (:91-93, contractVersion 1) must parse unchanged', () => {
    // Copied verbatim from claude-plugins/tests/mocks/mock-app-fixtures.js:95-97:
    //   function defaultApproval(overrides = {}) {
    //     return { contractVersion: 1, screens: {}, journeys: {}, ...overrides }
    //   }
    // A3 (executed 2026-09-17): today's ApprovalSchema REJECTS this with `invalid_type` at
    // ["theme"] — a required key, so no `.passthrough()` could ever have covered it.
    const defaultApproval = { contractVersion: 1, screens: {}, journeys: {} }

    const parsedApproval = ApprovalSchema.parse(defaultApproval)
    expect(parsedApproval.theme).toBeNull()

    // Copied verbatim from claude-plugins/tests/mocks/mock-app-fixtures.js:91-93:
    //   function defaultNotes(overrides = {}) {
    //     return { contractVersion: 1, notes: [], journeys: {}, ...overrides }
    //   }
    // A3: this one already parses today (the `theme` instance is `approval`-only) — asserted here
    // too so this file holds BOTH plugin-written shapes the AC names, side by side.
    const defaultNotes = { contractVersion: 1, notes: [], journeys: {} }
    expect(NotesSchema.parse(defaultNotes)).toEqual(defaultNotes)
  })
})
