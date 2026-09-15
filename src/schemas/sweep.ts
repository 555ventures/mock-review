import { z } from 'zod'

/** D11: one row per component/shell from the single docgen parse. */
export const InventoryRowSchema = z
  .object({
    name: z.string(),
    kind: z.enum(['component', 'shell']),
    props: z.record(z.string(), z.string()),
    doc: z.string(),
    usedOn: z.array(z.string()),
  })
  .strict()

export type InventoryRow = z.infer<typeof InventoryRowSchema>

/** D11: one row per open journey conversation (first) or open note (second), sorted by file then
 * id within each group. */
export const QueueItemSchema = z
  .object({
    kind: z.enum(['note', 'journey']),
    id: z.string(),
    screen: z.string().nullable(),
    state: z.string().nullable(),
    file: z.string(),
    line: z.number().int(),
    last: z.string(),
    reuse: z.array(z.string()),
  })
  .strict()

export type QueueItem = z.infer<typeof QueueItemSchema>

export const SweepSchema = z
  .object({
    contractVersion: z.literal(1),
    inventory: z.array(InventoryRowSchema),
    queue: z.array(QueueItemSchema),
  })
  .strict()

export type Sweep = z.infer<typeof SweepSchema>
