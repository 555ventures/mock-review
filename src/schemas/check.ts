import { z } from 'zod'
import { ConfigSchema, NullConfigSchema } from './config.js'

/** D5: the five error-severity finding kinds and the two warn-severity kinds (`twin` is stubbed
 * per D5 and never emitted in this spec, but the shape stays discriminable for a future waive). */
export const FindingSchema = z.discriminatedUnion('severity', [
  z
    .object({
      kind: z.enum(['type', 'layer', 'doc', 'render', 'config']),
      severity: z.literal('error'),
      file: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(['size', 'twin', 'states']),
      severity: z.literal('warn'),
      file: z.string(),
      message: z.string(),
    })
    .strict(),
])

export type Finding = z.infer<typeof FindingSchema>

/** D6: one row per discovered screen. */
export const ScreenSchema = z
  .object({
    name: z.string(),
    file: z.string(),
    states: z.array(z.string()),
    shell: z.string().nullable(),
    hash: z.string(),
    lines: z.number().int(),
  })
  .strict()

export type Screen = z.infer<typeof ScreenSchema>

/** D6: one row per discovered shell. */
export const ShellSchema = z
  .object({
    name: z.string(),
    file: z.string(),
    examples: z.array(z.string()),
  })
  .strict()

export type Shell = z.infer<typeof ShellSchema>

/** D7: a step names a screen; an edge is an index pair with an optional label. */
export const StepSchema = z.object({ screen: z.string() }).strict()
export type Step = z.infer<typeof StepSchema>

export const EdgeSchema = z
  .object({
    from: z.number().int(),
    to: z.number().int(),
    label: z.string().optional(),
  })
  .strict()
export type Edge = z.infer<typeof EdgeSchema>

/** D7: resolved journeys carry an empty `unresolved`; each unresolved entry names one of the
 * three verbatim reasons. */
export const UnresolvedEdgeSchema = z
  .object({
    from: z.number().int(),
    to: z.number().int(),
    reason: z.string(),
  })
  .strict()
export type UnresolvedEdge = z.infer<typeof UnresolvedEdgeSchema>

export const JourneySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    steps: z.array(StepSchema),
    edges: z.array(EdgeSchema),
    resolved: z.boolean(),
    unresolved: z.array(UnresolvedEdgeSchema),
  })
  .strict()

export type Journey = z.infer<typeof JourneySchema>

/** D8: `check.serve` — the liveness-probed URL, or `null` when nothing answers the ping. */
export const ServeStatusSchema = z
  .object({
    url: z.string().nullable(),
  })
  .strict()

export type ServeStatus = z.infer<typeof ServeStatusSchema>

/** D1/D5-D8: the full `check --json` shape. `config` is either the validated host config or the
 * all-null placeholder (D6). */
export const CheckSchema = z
  .object({
    contractVersion: z.literal(1),
    ok: z.boolean(),
    findings: z.array(FindingSchema),
    screens: z.array(ScreenSchema),
    shells: z.array(ShellSchema),
    journeys: z.array(JourneySchema),
    themes: z.array(z.string()),
    config: z.union([ConfigSchema, NullConfigSchema]),
    serve: ServeStatusSchema,
  })
  .strict()

export type Check = z.infer<typeof CheckSchema>
