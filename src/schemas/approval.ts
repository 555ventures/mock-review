import { z } from 'zod'
import { CONTRACT_VERSION } from './version.js'

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
  .strict()

export type ScreenApproval = z.infer<typeof ScreenApprovalSchema>

/** D1: `journeys{}` map value. `.passthrough()` per D1 — the plugin's `client waive` adds
 * `reason`/`at` on top of `approvedAt`/`client`. */
export const JourneyApprovalSchema = z
  .object({
    approvedAt: z.string().nullable(),
    client: z.enum(['ok', 'waived']).nullable(),
  })
  .passthrough()

export type JourneyApproval = z.infer<typeof JourneyApprovalSchema>

export const ApprovalSchema = z
  .object({
    contractVersion: z.union([z.literal(1), z.literal(CONTRACT_VERSION)]),
    screens: z.record(z.string(), ScreenApprovalSchema),
    journeys: z.record(z.string(), JourneyApprovalSchema),
    theme: z.string().nullable(),
  })
  .strict()

export type Approval = z.infer<typeof ApprovalSchema>
