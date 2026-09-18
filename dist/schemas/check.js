import { z } from 'zod';
import { ConfigSchema, NullConfigSchema } from './config.js';
import { CONTRACT_VERSION } from './version.js';
/** D5: the five error-severity finding kinds and the three warn-severity kinds (`twin` is stubbed
 * per D5 and never emitted in this spec, but the shape stays discriminable for a future waive).
 * D3: `beats` is a new warn kind — one per journey whose steps are not all beat-bearing. */
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
        kind: z.enum(['size', 'twin', 'states', 'beats']),
        severity: z.literal('warn'),
        file: z.string(),
        message: z.string(),
    })
        .strict(),
]);
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
    .strict();
/** D6: one row per discovered shell. */
export const ShellSchema = z
    .object({
    name: z.string(),
    file: z.string(),
    examples: z.array(z.string()),
})
    .strict();
/** D7/D1: a step names a screen and, when the host has written one, carries the client's own
 * sentence (`beat`) and the raw state spelling (`state`); an edge is an index pair with an
 * optional label and, when written, the client's own words for taking it (`say`). Absent fields
 * are omitted from parse output, never emitted as `undefined` (A4). */
export const StepSchema = z
    .object({
    screen: z.string(),
    beat: z.string().optional(),
    state: z.string().optional(),
})
    .strict();
export const EdgeSchema = z
    .object({
    from: z.number().int(),
    to: z.number().int(),
    label: z.string().optional(),
    say: z.string().optional(),
})
    .strict();
/** D7: resolved journeys carry an empty `unresolved`; each unresolved entry names one of the
 * three verbatim reasons. */
export const UnresolvedEdgeSchema = z
    .object({
    from: z.number().int(),
    to: z.number().int(),
    reason: z.string(),
})
    .strict();
/** D1: `persona` is the client's own description of who is walking this journey — optional,
 * omitted when the host has not written one (A4). */
export const JourneySchema = z
    .object({
    id: z.string(),
    title: z.string(),
    persona: z.string().optional(),
    steps: z.array(StepSchema),
    edges: z.array(EdgeSchema),
    resolved: z.boolean(),
    unresolved: z.array(UnresolvedEdgeSchema),
})
    .strict();
/** D8: `check.serve` — the liveness-probed URL, or `null` when nothing answers the ping. */
export const ServeStatusSchema = z
    .object({
    url: z.string().nullable(),
})
    .strict();
/** D1/D5-D8: the full `check --json` shape. `config` is either the validated host config or the
 * all-null placeholder (D6). */
export const CheckSchema = z
    .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    ok: z.boolean(),
    findings: z.array(FindingSchema),
    screens: z.array(ScreenSchema),
    shells: z.array(ShellSchema),
    journeys: z.array(JourneySchema),
    themes: z.array(z.string()),
    config: z.union([ConfigSchema, NullConfigSchema]),
    serve: ServeStatusSchema,
})
    .strict();
//# sourceMappingURL=check.js.map