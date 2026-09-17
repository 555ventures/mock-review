import { z } from 'zod'
import { CONTRACT_VERSION } from './version.js'

/** D1/D10: `design/decisions.json`'s `decisions[]` entries, appended by `answer --decision`. */
export const DecisionEntrySchema = z
  .object({
    screen: z.string().nullable(),
    text: z.string(),
    at: z.string(),
  })
  .strict()

export type DecisionEntry = z.infer<typeof DecisionEntrySchema>

export const DecisionsSchema = z
  .object({
    contractVersion: z.union([z.literal(1), z.literal(CONTRACT_VERSION)]),
    decisions: z.array(DecisionEntrySchema),
  })
  .strict()

export type Decisions = z.infer<typeof DecisionsSchema>
