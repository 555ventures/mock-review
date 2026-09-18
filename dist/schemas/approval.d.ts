import { z } from 'zod';
/** D4: READ-BACK SCHEMA. It validates only what this package itself reads or writes; anything
 * else passes through, and `contractVersion` is checked as "known", not "equal". `theme` defaults
 * to `null` on read because the plugin's own `defaultApproval` omits the key entirely (A3) — the
 * inferred type stays `string | null`, so no consumer changes. This rule LOWERS the frequency of
 * a swallowed read; it does NOT close it, because a missing required key is not an extra key. */
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
/** D8: `.passthrough()` and every key but `client` optional: the plugin's `client waive` writes
 * `{client:'waived', reason, at, beats}` with NO `approvedAt`, and contract v2's
 * `fields["approval.journeys{}"]` is `["client","beats","at?","reason?"]`. A required-but-nullable
 * `approvedAt` rejected that document, and a rejected document is swallowed into EMPTY_APPROVAL
 * with no error surfaced anywhere (A3). Existing v1 rows (`{approvedAt, client}`) still parse and
 * round-trip both keys untouched (A4). */
export declare const JourneyApprovalSchema: z.ZodObject<{
    client: z.ZodNullable<z.ZodEnum<{
        ok: "ok";
        waived: "waived";
    }>>;
    beats: z.ZodOptional<z.ZodString>;
    at: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
    approvedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$loose>;
export type JourneyApproval = z.infer<typeof JourneyApprovalSchema>;
export declare const ApprovalSchema: z.ZodObject<{
    contractVersion: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
    screens: z.ZodRecord<z.ZodString, z.ZodObject<{
        hash: z.ZodString;
        approvedAt: z.ZodString;
        states: z.ZodArray<z.ZodString>;
        viewports: z.ZodArray<z.ZodString>;
        schemes: z.ZodArray<z.ZodString>;
        screenshots: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    journeys: z.ZodRecord<z.ZodString, z.ZodObject<{
        client: z.ZodNullable<z.ZodEnum<{
            ok: "ok";
            waived: "waived";
        }>>;
        beats: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodString>;
        approvedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$loose>>;
    theme: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type Approval = z.infer<typeof ApprovalSchema>;
//# sourceMappingURL=approval.d.ts.map