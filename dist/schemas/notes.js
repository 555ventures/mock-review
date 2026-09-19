import { z } from 'zod';
import { CONTRACT_VERSION } from './version.js';
/** D4: READ-BACK SCHEMA. It validates only what this package itself reads or writes; anything
 * else passes through, and `contractVersion` is checked as "equal" to the single pinned literal
 * (spec 04 D2) — a document from any other version is reported unreadable, not silently accepted.
 * This rule LOWERS the frequency of a swallowed read; it does NOT close it, because a missing
 * required key is not an extra key. */
/** D1: one reply in a note's or journey's thread. `by` is a free-form attribution string
 * (`"session"` for `answer`, `"client"` for the page's client role — spec 02). */
export const ThreadEntrySchema = z
    .object({
    by: z.string(),
    text: z.string(),
})
    .strict();
/** D1: `design/notes.json`'s `notes[]` entries. `.passthrough()` because the plugin's `client
 * waive` verb adds `reason`/`at`, and `project` is an optional marker this package never writes
 * but must round-trip. */
export const NoteSchema = z
    .object({
    id: z.string(),
    screen: z.string().nullable(),
    state: z.string().nullable(),
    component: z.string().nullable(),
    key: z.string().nullable(),
    snippet: z.string().nullable(),
    status: z.enum(['open', 'answered', 'approved', 'deferred']),
    thread: z.array(ThreadEntrySchema),
    project: z.literal(true).optional(),
})
    .passthrough();
/** D1: a journey's conversation entry inside `notes.journeys`. */
export const JourneyConversationSchema = z
    .object({
    status: z.enum(['open', 'answered', 'approved', 'deferred']),
    thread: z.array(ThreadEntrySchema),
})
    .strict();
export const NotesSchema = z
    .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    notes: z.array(NoteSchema),
    journeys: z.record(z.string(), JourneyConversationSchema),
})
    .strict();
//# sourceMappingURL=notes.js.map