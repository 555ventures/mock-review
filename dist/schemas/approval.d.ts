import { z } from 'zod';
/** D1: `design/approval.json`'s `screens{}` map value — this package never writes one (spec 02
 * does), but `.strict()` since it is an object this package's own writers must not corrupt. */
export declare const ScreenApprovalSchema: z.ZodObject<{
    hash: z.ZodString;
    approvedAt: z.ZodString;
    states: z.ZodArray<z.ZodString>;
    viewports: z.ZodArray<z.ZodString>;
    schemes: z.ZodArray<z.ZodString>;
    screenshots: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type ScreenApproval = z.infer<typeof ScreenApprovalSchema>;
/** D1: `journeys{}` map value. `.passthrough()` per D1 — the plugin's `client waive` adds
 * `reason`/`at` on top of `approvedAt`/`client`. */
export declare const JourneyApprovalSchema: z.ZodObject<{
    approvedAt: z.ZodNullable<z.ZodString>;
    client: z.ZodNullable<z.ZodEnum<{
        ok: "ok";
        waived: "waived";
    }>>;
}, z.core.$loose>;
export type JourneyApproval = z.infer<typeof JourneyApprovalSchema>;
export declare const ApprovalSchema: z.ZodObject<{
    contractVersion: z.ZodLiteral<1>;
    screens: z.ZodRecord<z.ZodString, z.ZodObject<{
        hash: z.ZodString;
        approvedAt: z.ZodString;
        states: z.ZodArray<z.ZodString>;
        viewports: z.ZodArray<z.ZodString>;
        schemes: z.ZodArray<z.ZodString>;
        screenshots: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    journeys: z.ZodRecord<z.ZodString, z.ZodObject<{
        approvedAt: z.ZodNullable<z.ZodString>;
        client: z.ZodNullable<z.ZodEnum<{
            ok: "ok";
            waived: "waived";
        }>>;
    }, z.core.$loose>>;
    theme: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type Approval = z.infer<typeof ApprovalSchema>;
//# sourceMappingURL=approval.d.ts.map