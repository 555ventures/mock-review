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

describe('AC-20260918-04-8 (rewrites AC-20260917-04-6: defaultApproval): plugin-written design-document shapes parse against this package\'s read-back schemas', () => {
  it('defaultApproval (claude-plugins/tests/mocks/mock-app-fixtures.js, contractVersion 3, D9) has no theme key and parses as-is; defaultNotes (contractVersion 3) must parse unchanged', () => {
    // Copied verbatim from claude-plugins/tests/mocks/mock-app-fixtures.js, once the sibling
    // plugin spec (D9) has landed:
    //   function defaultApproval(overrides = {}) {
    //     return { contractVersion: 3, screens: {}, journeys: {}, ...overrides }
    //   }
    // D4: `theme` no longer exists on ApprovalSchema at all — this fixture never carried it, and
    // it stays out.
    const defaultApproval = { contractVersion: 3, screens: {}, journeys: {} }

    const parsedApproval = ApprovalSchema.parse(defaultApproval)
    expect(parsedApproval).toEqual(defaultApproval)

    // Copied verbatim from claude-plugins/tests/mocks/mock-app-fixtures.js, once D9 has landed:
    //   function defaultNotes(overrides = {}) {
    //     return { contractVersion: 3, notes: [], journeys: {}, ...overrides }
    //   }
    const defaultNotes = { contractVersion: 3, notes: [], journeys: {} }
    expect(NotesSchema.parse(defaultNotes)).toEqual(defaultNotes)
  })
})
