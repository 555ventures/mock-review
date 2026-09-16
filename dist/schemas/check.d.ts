import { z } from 'zod';
/** D5: the five error-severity finding kinds and the two warn-severity kinds (`twin` is stubbed
 * per D5 and never emitted in this spec, but the shape stays discriminable for a future waive). */
export declare const FindingSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodEnum<{
        type: "type";
        layer: "layer";
        doc: "doc";
        render: "render";
        config: "config";
    }>;
    severity: z.ZodLiteral<"error">;
    file: z.ZodString;
    message: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodEnum<{
        size: "size";
        twin: "twin";
        states: "states";
    }>;
    severity: z.ZodLiteral<"warn">;
    file: z.ZodString;
    message: z.ZodString;
}, z.core.$strict>], "severity">;
export type Finding = z.infer<typeof FindingSchema>;
/** D6: one row per discovered screen. */
export declare const ScreenSchema: z.ZodObject<{
    name: z.ZodString;
    file: z.ZodString;
    states: z.ZodArray<z.ZodString>;
    shell: z.ZodNullable<z.ZodString>;
    hash: z.ZodString;
    lines: z.ZodNumber;
}, z.core.$strict>;
export type Screen = z.infer<typeof ScreenSchema>;
/** D6: one row per discovered shell. */
export declare const ShellSchema: z.ZodObject<{
    name: z.ZodString;
    file: z.ZodString;
    examples: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type Shell = z.infer<typeof ShellSchema>;
/** D7: a step names a screen; an edge is an index pair with an optional label. */
export declare const StepSchema: z.ZodObject<{
    screen: z.ZodString;
}, z.core.$strict>;
export type Step = z.infer<typeof StepSchema>;
export declare const EdgeSchema: z.ZodObject<{
    from: z.ZodNumber;
    to: z.ZodNumber;
    label: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type Edge = z.infer<typeof EdgeSchema>;
/** D7: resolved journeys carry an empty `unresolved`; each unresolved entry names one of the
 * three verbatim reasons. */
export declare const UnresolvedEdgeSchema: z.ZodObject<{
    from: z.ZodNumber;
    to: z.ZodNumber;
    reason: z.ZodString;
}, z.core.$strict>;
export type UnresolvedEdge = z.infer<typeof UnresolvedEdgeSchema>;
export declare const JourneySchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        screen: z.ZodString;
    }, z.core.$strict>>;
    edges: z.ZodArray<z.ZodObject<{
        from: z.ZodNumber;
        to: z.ZodNumber;
        label: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    resolved: z.ZodBoolean;
    unresolved: z.ZodArray<z.ZodObject<{
        from: z.ZodNumber;
        to: z.ZodNumber;
        reason: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Journey = z.infer<typeof JourneySchema>;
/** D8: `check.serve` — the liveness-probed URL, or `null` when nothing answers the ping. */
export declare const ServeStatusSchema: z.ZodObject<{
    url: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type ServeStatus = z.infer<typeof ServeStatusSchema>;
/** D1/D5-D8: the full `check --json` shape. `config` is either the validated host config or the
 * all-null placeholder (D6). */
export declare const CheckSchema: z.ZodObject<{
    contractVersion: z.ZodLiteral<1>;
    ok: z.ZodBoolean;
    findings: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodEnum<{
            type: "type";
            layer: "layer";
            doc: "doc";
            render: "render";
            config: "config";
        }>;
        severity: z.ZodLiteral<"error">;
        file: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodEnum<{
            size: "size";
            twin: "twin";
            states: "states";
        }>;
        severity: z.ZodLiteral<"warn">;
        file: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>], "severity">>;
    screens: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        file: z.ZodString;
        states: z.ZodArray<z.ZodString>;
        shell: z.ZodNullable<z.ZodString>;
        hash: z.ZodString;
        lines: z.ZodNumber;
    }, z.core.$strict>>;
    shells: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        file: z.ZodString;
        examples: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    journeys: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            screen: z.ZodString;
        }, z.core.$strict>>;
        edges: z.ZodArray<z.ZodObject<{
            from: z.ZodNumber;
            to: z.ZodNumber;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        resolved: z.ZodBoolean;
        unresolved: z.ZodArray<z.ZodObject<{
            from: z.ZodNumber;
            to: z.ZodNumber;
            reason: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    themes: z.ZodArray<z.ZodString>;
    config: z.ZodUnion<readonly [z.ZodObject<{
        name: z.ZodString;
        port: z.ZodNumber;
        targets: z.ZodObject<{
            viewports: z.ZodArray<z.ZodString>;
            schemes: z.ZodArray<z.ZodString>;
        }, z.core.$strict>;
        theme: z.ZodNullable<z.ZodString>;
        client: z.ZodObject<{
            token: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        name: z.ZodNull;
        port: z.ZodNull;
        targets: z.ZodNull;
        theme: z.ZodNull;
        client: z.ZodNull;
    }, z.core.$strict>]>;
    serve: z.ZodObject<{
        url: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type Check = z.infer<typeof CheckSchema>;
//# sourceMappingURL=check.d.ts.map