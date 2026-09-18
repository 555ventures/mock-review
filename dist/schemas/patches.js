import { z } from 'zod';
import { ConfigSchema, NullConfigSchema } from './config.js';
import { NoteSchema, ThreadEntrySchema, NotesSchema } from './notes.js';
import { ApprovalSchema } from './approval.js';
import { ScreenSchema, ShellSchema, JourneySchema } from './check.js';
import { InventoryRowSchema } from './sweep.js';
/** D5/D23: `add`'s `note` shape — `NoteSchema.omit({id:true})` plus a `superRefine` that rejects
 * a caller-supplied `id` outright. Plain `.omit({id:true})` alone is not enough: `NoteSchema` is
 * `.passthrough()` (D5's page-owned extras — `rect`/`viewport`/`whole` — round-trip through it),
 * so an `id` the caller sends would otherwise still survive as an ordinary passthrough key; a
 * blanket `.strict()` would fix that but also reject those same legitimate extras. The refine
 * targets `id` specifically, so `rect`/`viewport`/`whole` keep passing through untouched. */
/** D6: a note is either product-wide (`project: true`, no screen) or anchored to a screen.
 * Returns the violated rule's message, or null when the pair is legal. Exported so the route
 * layer (`src/server/plugin.ts`) can apply the same rule to a MERGED note on `op:'update'` — the
 * read-back shapes in `src/schemas/notes.ts` are deliberately untouched (see Decisions D6). */
export function scopeViolation(note) {
    const isProject = note.project === true;
    if (isProject && note.screen !== null)
        return 'a project note carries no screen';
    if (!isProject && note.screen === null)
        return 'a note with no screen must be project:true';
    return null;
}
const AddNoteSchema = NoteSchema.omit({ id: true })
    .superRefine((note, ctx) => {
    if (Object.prototype.hasOwnProperty.call(note, 'id')) {
        ctx.addIssue({ code: 'custom', message: 'add may not specify id', path: ['id'] });
    }
})
    .superRefine((note, ctx) => {
    const msg = scopeViolation(note);
    if (msg)
        ctx.addIssue({ code: 'custom', message: msg, path: [note.project === true ? 'screen' : 'project'] });
});
/** D6/D23/Contracts: `POST notes` body. `add`'s `note` never carries an `id` at all (see
 * `AddNoteSchema` — the server always assigns `N`+padded sequence, AC-20260915-02-7; a
 * caller-supplied id is a validation failure, not a value the server might honor); `update`'s
 * `fields` is a partial of every Note field but `id`. */
export const NotesPatchSchema = z.discriminatedUnion('op', [
    z
        .object({
        op: z.literal('add'),
        note: AddNoteSchema,
    })
        .strict(),
    z
        .object({
        op: z.literal('update'),
        id: z.string(),
        fields: NoteSchema.omit({ id: true }).partial(),
    })
        .strict(),
    z
        .object({
        op: z.literal('remove'),
        id: z.string(),
    })
        .strict(),
    z
        .object({
        op: z.literal('journey'),
        id: z.string(),
        status: z.enum(['open', 'answered', 'approved', 'deferred']).optional(),
        entry: ThreadEntrySchema.optional(),
    })
        .strict(),
    z
        .object({
        op: z.literal('close'),
        id: z.string(),
        status: z.enum(['approved', 'deferred']),
    })
        .strict(),
]);
/** D6/Contracts: `POST approval` body. */
export const ApprovalPatchSchema = z.discriminatedUnion('op', [
    z
        .object({
        op: z.literal('approveScreen'),
        name: z.string(),
    })
        .strict(),
    z
        .object({
        op: z.literal('unapproveScreen'),
        name: z.string(),
    })
        .strict(),
    z
        .object({
        op: z.literal('clientOk'),
        id: z.string(),
        beats: z.string(),
    })
        .strict(),
    z
        .object({
        op: z.literal('theme'),
        key: z.string(),
    })
        .strict(),
]);
/** D6: the base `JourneySchema` now carries `persona`/step `state`/edge `say` itself (D1); this
 * server-only wrapper adds only what `GET state` adds on top — the story hash, `null` when the
 * journey has no confirmable story (D4/D5). */
export const ServerJourneySchema = JourneySchema.extend({
    beats: z.string().nullable(),
});
/** D18(b): `GET state`'s inventory rows gain the component/shell module's own `examples` keys
 * (the Components page's example picker, reference §10) — `['Default']` when the module can't be
 * read. Declared here rather than on `InventoryRowSchema` itself since `sweep --json`'s contract
 * shape (spec 01) does not gain this field. */
export const ServerInventoryRowSchema = InventoryRowSchema.extend({
    examples: z.array(z.string()),
});
/** D21: `GET state`'s screen rows gain the screen module's own `examples` keys
 * (`Object.keys(examples)`, `[]` when the module cannot be imported) — the page's state list is
 * `statesOf` (D16) over this field, never the raw `meta.states`. Declared here rather than on
 * `ScreenSchema` itself since `check --json`'s contract shape (spec 01) does not gain this field. */
export const ServerScreenSchema = ScreenSchema.extend({
    examples: z.array(z.string()),
});
/** D2: whether a design document could be read. `ok: false` means the file EXISTS and could not
 * be used — never that it is absent (`ensureDesignFiles` creates both when missing). */
export const DocOutcomeSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true) }).strict(),
    z.object({ ok: z.literal(false), error: z.string() }).strict(),
]);
/** D6: `GET state`'s full response shape. */
export const ServerStateSchema = z
    .object({
    screens: z.array(ServerScreenSchema),
    shells: z.array(ShellSchema),
    journeys: z.array(ServerJourneySchema),
    themes: z.array(z.string()),
    config: z.union([ConfigSchema, NullConfigSchema]),
    inventory: z.array(ServerInventoryRowSchema),
    violations: z.array(z.string()),
    notes: NotesSchema,
    approval: ApprovalSchema,
    role: z.enum(['owner', 'client']),
    documents: z.object({ notes: DocOutcomeSchema, approval: DocOutcomeSchema }).strict(),
})
    .strict();
//# sourceMappingURL=patches.js.map