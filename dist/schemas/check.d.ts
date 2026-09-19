import { z } from 'zod';
/** D5: the five error-severity finding kinds and the three warn-severity kinds (`twin` is stubbed
 * per D5 and never emitted in this spec, but the shape stays discriminable for a future waive).
 * D3: `beats` is a new warn kind — one per journey whose steps are not all beat-bearing. */
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
        states: "states";
        beats: "beats";
        size: "size";
        twin: "twin";
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
/** D7/D1: a step names a screen and, when the host has written one, carries the client's own
 * sentence (`beat`) and the raw state spelling (`state`); an edge is an index pair with an
 * optional label and, when written, the client's own words for taking it (`say`). Absent fields
 * are omitted from parse output, never emitted as `undefined` (A4). */
export declare const StepSchema: z.ZodObject<{
    screen: z.ZodString;
    beat: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type Step = z.infer<typeof StepSchema>;
export declare const EdgeSchema: z.ZodObject<{
    from: z.ZodNumber;
    to: z.ZodNumber;
    label: z.ZodOptional<z.ZodString>;
    say: z.ZodOptional<z.ZodString>;
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
/** D1: `persona` is the client's own description of who is walking this journey — optional,
 * omitted when the host has not written one (A4). */
export declare const JourneySchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    persona: z.ZodOptional<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        screen: z.ZodString;
        beat: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    edges: z.ZodArray<z.ZodObject<{
        from: z.ZodNumber;
        to: z.ZodNumber;
        label: z.ZodOptional<z.ZodString>;
        say: z.ZodOptional<z.ZodString>;
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
    contractVersion: z.ZodLiteral<3>;
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
            states: "states";
            beats: "beats";
            size: "size";
            twin: "twin";
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
        persona: z.ZodOptional<z.ZodString>;
        steps: z.ZodArray<z.ZodObject<{
            screen: z.ZodString;
            beat: z.ZodOptional<z.ZodString>;
            state: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        edges: z.ZodArray<z.ZodObject<{
            from: z.ZodNumber;
            to: z.ZodNumber;
            label: z.ZodOptional<z.ZodString>;
            say: z.ZodOptional<z.ZodString>;
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