import { z } from 'zod'
import { CONTRACT_VERSION } from './version.js'

/** D1: `contract --json`'s shape. Never touches the host filesystem. */
export const ContractSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    package: z.string(),
    version: z.string(),
  })
  .strict()

export type Contract = z.infer<typeof ContractSchema>
