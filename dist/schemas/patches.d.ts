import { z } from 'zod';
/** D6/D23/Contracts: `POST notes` body. `add`'s `note` never carries an `id` at all (see
 * `AddNoteSchema` — the server always assigns `N`+padded sequence, AC-20260915-02-7; a
 * caller-supplied id is a validation failure, not a value the server might honor); `update`'s
 * `fields` is a partial of every Note field but `id`. */
export declare const NotesPatchSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    op: z.ZodLiteral<"add">;
    note: z.ZodObject<{
        screen: z.ZodNullable<z.ZodString>;
        component: z.ZodNullable<z.ZodString>;
        state: z.ZodNullable<z.ZodString>;
        key: z.ZodNullable<z.ZodString>;
        snippet: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<{
            open: "open";
            answered: "answered";
            approved: "approved";
        }>;
        thread: z.ZodArray<z.ZodObject<{
            by: z.ZodString;
            text: z.ZodString;
        }, z.core.$strict>>;
        project: z.ZodOptional<z.ZodLiteral<true>>;
    }, z.core.$loose>;
}, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"update">;
    id: z.ZodString;
    fields: z.ZodObject<{
        screen: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        component: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        state: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        key: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        snippet: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodOptional<z.ZodEnum<{
            open: "open";
            answered: "answered";
            approved: "approved";
        }>>;
        thread: z.ZodOptional<z.ZodArray<z.ZodObject<{
            by: z.ZodString;
            text: z.ZodString;
        }, z.core.$strict>>>;
        project: z.ZodOptional<z.ZodOptional<z.ZodLiteral<true>>>;
    }, z.core.$loose>;
}, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"remove">;
    id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"journey">;
    id: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<{
        open: "open";
        answered: "answered";
        approved: "approved";
    }>>;
    entry: z.ZodOptional<z.ZodObject<{
        by: z.ZodString;
        text: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>], "op">;
export type NotesPatch = z.infer<typeof NotesPatchSchema>;
/** D6/Contracts: `POST approval` body. */
export declare const ApprovalPatchSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    op: z.ZodLiteral<"approveScreen">;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"unapproveScreen">;
    name: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"approveJourney">;
    id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"clientOk">;
    id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"theme">;
    key: z.ZodString;
}, z.core.$strict>], "op">;
export type ApprovalPatch = z.infer<typeof ApprovalPatchSchema>;
/** D6/Contracts: `GET state`'s journeys carry the plugin-queued `persona`/step `state`/edge `say`
 * fields (spec 02 UI §1/§8.2) on top of the analysis-layer `Journey` shape. */
export declare const ServerJourneySchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    resolved: z.ZodBoolean;
    unresolved: z.ZodArray<z.ZodObject<{
        from: z.ZodNumber;
        to: z.ZodNumber;
        reason: z.ZodString;
    }, z.core.$strict>>;
    persona: z.ZodOptional<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        screen: z.ZodString;
        state: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    edges: z.ZodArray<z.ZodObject<{
        from: z.ZodNumber;
        to: z.ZodNumber;
        label: z.ZodOptional<z.ZodString>;
        say: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ServerJourney = z.infer<typeof ServerJourneySchema>;
/** D18(b): `GET state`'s inventory rows gain the component/shell module's own `examples` keys
 * (the Components page's example picker, reference §10) — `['Default']` when the module can't be
 * read. Declared here rather than on `InventoryRowSchema` itself since `sweep --json`'s contract
 * shape (spec 01) does not gain this field. */
export declare const ServerInventoryRowSchema: z.ZodObject<{
    name: z.ZodString;
    kind: z.ZodEnum<{
        shell: "shell";
        component: "component";
    }>;
    props: z.ZodRecord<z.ZodString, z.ZodString>;
    doc: z.ZodString;
    usedOn: z.ZodArray<z.ZodString>;
    examples: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type ServerInventoryRow = z.infer<typeof ServerInventoryRowSchema>;
/** D21: `GET state`'s screen rows gain the screen module's own `examples` keys
 * (`Object.keys(examples)`, `[]` when the module cannot be imported) — the page's state list is
 * `statesOf` (D16) over this field, never the raw `meta.states`. Declared here rather than on
 * `ScreenSchema` itself since `check --json`'s contract shape (spec 01) does not gain this field. */
export declare const ServerScreenSchema: z.ZodObject<{
    name: z.ZodString;
    file: z.ZodString;
    states: z.ZodArray<z.ZodString>;
    shell: z.ZodNullable<z.ZodString>;
    hash: z.ZodString;
    lines: z.ZodNumber;
    examples: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type ServerScreen = z.infer<typeof ServerScreenSchema>;
/** D6: `GET state`'s full response shape. */
export declare const ServerStateSchema: z.ZodObject<{
    screens: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        file: z.ZodString;
        states: z.ZodArray<z.ZodString>;
        shell: z.ZodNullable<z.ZodString>;
        hash: z.ZodString;
        lines: z.ZodNumber;
        examples: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    shells: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        file: z.ZodString;
        examples: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    journeys: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        resolved: z.ZodBoolean;
        unresolved: z.ZodArray<z.ZodObject<{
            from: z.ZodNumber;
            to: z.ZodNumber;
            reason: z.ZodString;
        }, z.core.$strict>>;
        persona: z.ZodOptional<z.ZodString>;
        steps: z.ZodArray<z.ZodObject<{
            screen: z.ZodString;
            state: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        edges: z.ZodArray<z.ZodObject<{
            from: z.ZodNumber;
            to: z.ZodNumber;
            label: z.ZodOptional<z.ZodString>;
            say: z.ZodOptional<z.ZodString>;
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
    inventory: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        kind: z.ZodEnum<{
            shell: "shell";
            component: "component";
        }>;
        props: z.ZodRecord<z.ZodString, z.ZodString>;
        doc: z.ZodString;
        usedOn: z.ZodArray<z.ZodString>;
        examples: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    violations: z.ZodArray<z.ZodString>;
    notes: z.ZodObject<{
        contractVersion: z.ZodLiteral<1>;
        notes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            screen: z.ZodNullable<z.ZodString>;
            state: z.ZodNullable<z.ZodString>;
            component: z.ZodNullable<z.ZodString>;
            key: z.ZodNullable<z.ZodString>;
            snippet: z.ZodNullable<z.ZodString>;
            status: z.ZodEnum<{
                open: "open";
                answered: "answered";
                approved: "approved";
            }>;
            thread: z.ZodArray<z.ZodObject<{
                by: z.ZodString;
                text: z.ZodString;
            }, z.core.$strict>>;
            project: z.ZodOptional<z.ZodLiteral<true>>;
        }, z.core.$loose>>;
        journeys: z.ZodRecord<z.ZodString, z.ZodObject<{
            status: z.ZodEnum<{
                open: "open";
                answered: "answered";
                approved: "approved";
            }>;
            thread: z.ZodArray<z.ZodObject<{
                by: z.ZodString;
                text: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    approval: z.ZodObject<{
        contractVersion: z.ZodLiteral<1>;
        screens: z.ZodRecord<z.ZodString, z.ZodObject<{
            hash: z.ZodString;
            approvedAt: z.ZodString;
            states: z.ZodArray<z.ZodString>;
            viewports: z.ZodArray<z.ZodString>;
            schemes: z.ZodArray<z.ZodString>;
            screenshots: z.ZodArray<z.ZodString>;
        }, z.core.$strict>>;
        journeys: z.ZodRecord<z.ZodString, z.ZodObject<{
            approvedAt: z.ZodNullable<z.ZodString>;
            client: z.ZodNullable<z.ZodEnum<{
                ok: "ok";
                waived: "waived";
            }>>;
        }, z.core.$loose>>;
        theme: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    role: z.ZodEnum<{
        client: "client";
        owner: "owner";
    }>;
}, z.core.$strict>;
export type ServerState = z.infer<typeof ServerStateSchema>;
//# sourceMappingURL=patches.d.ts.map