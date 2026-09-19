import { z } from 'zod';
import { CONTRACT_VERSION } from './version.js';
/** D4: READ-BACK SCHEMA. It validates only what this package itself reads or writes; anything
 * else passes through, and `contractVersion` is checked as "equal" to the single pinned literal
 * (spec 04 D2) — a document from any other version is reported unreadable, not silently accepted.
 * `theme` is no longer part of this document (spec 04 D4): the theme is whatever `mock.config.ts`
 * declares, read through `check.config.theme`. This rule LOWERS the frequency of a swallowed
 * read; it does NOT close it, because a missing required key is not an extra key. */
/** D1: `design/approval.json`'s `screens{}` map value — this package never writes one (spec 02
 * does), but `.strict()` since it is an object this package's own writers must not corrupt. */
export const ScreenApprovalSchema = z
    .object({
    hash: z.string(),
    approvedAt: z.string(),
    states: z.array(z.string()),
    viewports: z.array(z.string()),
    schemes: z.array(z.string()),
    screenshots: z.array(z.string()),
})
    .strict();
/** D8: `.passthrough()` and every key but `client` optional: the plugin's `client waive` writes
 * `{client:'waived', reason, at, beats}` with NO `approvedAt`, and contract v2's
 * `fields["approval.journeys{}"]` is `["client","beats","at?","reason?"]`. A required-but-nullable
 * `approvedAt` rejected that document, and a rejected document is swallowed into EMPTY_APPROVAL
 * with no error surfaced anywhere (A3). Existing v1 rows (`{approvedAt, client}`) still parse and
 * round-trip both keys untouched (A4). */
export const JourneyApprovalSchema = z
    .object({
    client: z.enum(['ok', 'waived']).nullable(),
    beats: z.string().optional(),
    at: z.string().optional(),
    reason: z.string().optional(),
    approvedAt: z.string().nullable().optional(),
})
    .passthrough();
export const ApprovalSchema = z
    .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    screens: z.record(z.string(), ScreenApprovalSchema),
    journeys: z.record(z.string(), JourneyApprovalSchema),
})
    .strict();
//# sourceMappingURL=approval.js.map