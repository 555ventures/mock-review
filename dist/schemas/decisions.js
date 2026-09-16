import { z } from 'zod';
/** D1/D10: `design/decisions.json`'s `decisions[]` entries, appended by `answer --decision`. */
export const DecisionEntrySchema = z
    .object({
    screen: z.string().nullable(),
    text: z.string(),
    at: z.string(),
})
    .strict();
export const DecisionsSchema = z
    .object({
    contractVersion: z.literal(1),
    decisions: z.array(DecisionEntrySchema),
})
    .strict();
//# sourceMappingURL=decisions.js.map