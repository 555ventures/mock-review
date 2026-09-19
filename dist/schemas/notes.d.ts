import { z } from 'zod';
/** D4: READ-BACK SCHEMA. It validates only what this package itself reads or writes; anything
 * else passes through, and `contractVersion` is checked as "equal" to the single pinned literal
 * (spec 04 D2) — a document from any other version is reported unreadable, not silently accepted.
 * This rule LOWERS the frequency of a swallowed read; it does NOT close it, because a missing
 * required key is not an extra key. */
/** D1: one reply in a note's or journey's thread. `by` is a free-form attribution string
 * (`"session"` for `answer`, `"client"` for the page's client role — spec 02). */
export declare const ThreadEntrySchema: z.ZodObject<{
    by: z.ZodString;
    text: z.ZodString;
}, z.core.$strict>;
export type ThreadEntry = z.infer<typeof ThreadEntrySchema>;
/** D1: `design/notes.json`'s `notes[]` entries. `.passthrough()` because the plugin's `client
 * waive` verb adds `reason`/`at`, and `project` is an optional marker this package never writes
 * but must round-trip. */
export declare const NoteSchema: z.ZodObject<{
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
        deferred: "deferred";
    }>;
    thread: z.ZodArray<z.ZodObject<{
        by: z.ZodString;
        text: z.ZodString;
    }, z.core.$strict>>;
    project: z.ZodOptional<z.ZodLiteral<true>>;
}, z.core.$loose>;
export type Note = z.infer<typeof NoteSchema>;
/** D1: a journey's conversation entry inside `notes.journeys`. */
export declare const JourneyConversationSchema: z.ZodObject<{
    status: z.ZodEnum<{
        open: "open";
        answered: "answered";
        approved: "approved";
        deferred: "deferred";
    }>;
    thread: z.ZodArray<z.ZodObject<{
        by: z.ZodString;
        text: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type JourneyConversation = z.infer<typeof JourneyConversationSchema>;
export declare const NotesSchema: z.ZodObject<{
    contractVersion: z.ZodLiteral<3>;
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
            deferred: "deferred";
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
            deferred: "deferred";
        }>;
        thread: z.ZodArray<z.ZodObject<{
            by: z.ZodString;
            text: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Notes = z.infer<typeof NotesSchema>;
//# sourceMappingURL=notes.d.ts.map