import { z } from 'zod';
/** D11: one row per component/shell from the single docgen parse. */
export declare const InventoryRowSchema: z.ZodObject<{
    name: z.ZodString;
    kind: z.ZodEnum<{
        shell: "shell";
        component: "component";
    }>;
    props: z.ZodRecord<z.ZodString, z.ZodString>;
    doc: z.ZodString;
    usedOn: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type InventoryRow = z.infer<typeof InventoryRowSchema>;
/** D11: one row per open journey conversation (first) or open note (second), sorted by file then
 * id within each group. */
export declare const QueueItemSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        note: "note";
        journey: "journey";
    }>;
    id: z.ZodString;
    screen: z.ZodNullable<z.ZodString>;
    state: z.ZodNullable<z.ZodString>;
    file: z.ZodString;
    line: z.ZodNumber;
    last: z.ZodString;
    reuse: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type QueueItem = z.infer<typeof QueueItemSchema>;
export declare const SweepSchema: z.ZodObject<{
    contractVersion: z.ZodLiteral<1>;
    inventory: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        kind: z.ZodEnum<{
            shell: "shell";
            component: "component";
        }>;
        props: z.ZodRecord<z.ZodString, z.ZodString>;
        doc: z.ZodString;
        usedOn: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    queue: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            note: "note";
            journey: "journey";
        }>;
        id: z.ZodString;
        screen: z.ZodNullable<z.ZodString>;
        state: z.ZodNullable<z.ZodString>;
        file: z.ZodString;
        line: z.ZodNumber;
        last: z.ZodString;
        reuse: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Sweep = z.infer<typeof SweepSchema>;
//# sourceMappingURL=sweep.d.ts.map