import { z } from 'zod';
/** D1/D10: `design/decisions.json`'s `decisions[]` entries, appended by `answer --decision`. */
export declare const DecisionEntrySchema: z.ZodObject<{
    screen: z.ZodNullable<z.ZodString>;
    text: z.ZodString;
    at: z.ZodString;
}, z.core.$strict>;
export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;
export declare const DecisionsSchema: z.ZodObject<{
    contractVersion: z.ZodLiteral<1>;
    decisions: z.ZodArray<z.ZodObject<{
        screen: z.ZodNullable<z.ZodString>;
        text: z.ZodString;
        at: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Decisions = z.infer<typeof DecisionsSchema>;
//# sourceMappingURL=decisions.d.ts.map