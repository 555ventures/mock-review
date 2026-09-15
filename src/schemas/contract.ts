import { z } from 'zod'

/** D1: `contract --json`'s shape. Never touches the host filesystem. */
export const ContractSchema = z
  .object({
    contractVersion: z.literal(1),
    package: z.string(),
    version: z.string(),
  })
  .strict()

export type Contract = z.infer<typeof ContractSchema>
