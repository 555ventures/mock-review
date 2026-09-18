import { EMPTY_APPROVAL } from '../schemas/index.js';
/** D5: `N` + zero-padded (3 digits) max existing numeric id + 1. */
function nextNoteId(existing) {
    let max = 0;
    for (const n of existing) {
        const match = /^N(\d+)$/.exec(n.id);
        if (match) {
            const num = Number(match[1]);
            if (num > max)
                max = num;
        }
    }
    return `N${String(max + 1).padStart(3, '0')}`;
}
/** A plain `{ ...base, ...fields }` spread types every optional `fields` property as
 * `T[K] | undefined` (a TS quirk with `exactOptionalPropertyTypes`), which `Note`'s explicit
 * `string | null` fields reject. Only a key whose patch value is not `undefined` is applied, so
 * an explicit `null` (a real value for `screen`/`component`/etc.) still overwrites. */
function mergeDefined(base, fields) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined)
            merged[key] = value;
    }
    return merged;
}
/** D7 rule 6: a new note (or a note turning `open`) on `name` deletes `approval.screens[name]`
 * when present; a no-op otherwise (never allocates a new object needlessly). */
function unapproveScreen(approval, name) {
    if (!(name in approval.screens))
        return approval;
    const nextScreens = { ...approval.screens };
    delete nextScreens[name];
    return { ...approval, screens: nextScreens };
}
/**
 * D6/D16: `applyNotesPatch(notes, patch, approval = EMPTY_APPROVAL)` -> `{ notes, approval }`.
 * `approval` is read (never required) so rule 6 can un-approve a screen in the same call; a
 * caller with no approval document yet (e.g. a pure unit test) may omit it.
 */
export function applyNotesPatch(notes, patch, approval = EMPTY_APPROVAL) {
    switch (patch.op) {
        case 'add': {
            // D23: `op:'add'` never accepts a caller-supplied id — `NotesPatchSchema`'s `add.note` is
            // `NoteSchema.omit({id:true})`, so `patch.note` carries no `id` field at all; the server
            // always assigns the next sequential one.
            const id = nextNoteId(notes.notes);
            const note = { ...patch.note, id };
            const nextNotes = { ...notes, notes: [...notes.notes, note] };
            const nextApproval = note.screen !== null ? unapproveScreen(approval, note.screen) : approval;
            return { notes: nextNotes, approval: nextApproval };
        }
        case 'update': {
            // D23: an unknown id is a no-op here (the route layer answers 404 and never calls this
            // function for an id it hasn't already confirmed exists — see plugin.ts's `handlePostNotes`
            // — this fallback just keeps the function total for a direct/test caller).
            const idx = notes.notes.findIndex((n) => n.id === patch.id);
            if (idx === -1)
                return { notes, approval };
            const existing = notes.notes[idx];
            if (!existing)
                return { notes, approval };
            const updated = mergeDefined(existing, patch.fields);
            const nextArr = notes.notes.slice();
            nextArr[idx] = updated;
            const nextNotes = { ...notes, notes: nextArr };
            // D7 rule 6: a note turning `open` un-approves its (resulting) screen.
            const turnedOpen = patch.fields.status === 'open';
            let nextApproval = turnedOpen && updated.screen !== null ? unapproveScreen(approval, updated.screen) : approval;
            // D23: an update that also moves the note to another screen un-approves *both* the old and
            // the new screen, when the result is `open` (whether it was already open or just turned
            // open by this same patch) — the note's presence on either screen is now stale otherwise.
            const screenMoved = patch.fields.screen !== undefined && patch.fields.screen !== existing.screen;
            if (screenMoved && updated.status === 'open') {
                if (existing.screen !== null)
                    nextApproval = unapproveScreen(nextApproval, existing.screen);
                if (updated.screen !== null)
                    nextApproval = unapproveScreen(nextApproval, updated.screen);
            }
            return { notes: nextNotes, approval: nextApproval };
        }
        case 'remove': {
            // D23: an unknown id is a no-op here too — see the `update` case's note above.
            const nextNotes = { ...notes, notes: notes.notes.filter((n) => n.id !== patch.id) };
            return { notes: nextNotes, approval };
        }
        case 'journey': {
            const existing = notes.journeys[patch.id] ?? { status: 'open', thread: [] };
            let status = patch.status ?? existing.status;
            let thread = existing.thread;
            // D7 rule 7: any reply (an `entry`) reopens the journey's conversation regardless of any
            // `status` the caller also passed.
            if (patch.entry) {
                thread = [...thread, patch.entry];
                status = 'open';
            }
            const nextNotes = { ...notes, journeys: { ...notes.journeys, [patch.id]: { status, thread } } };
            return { notes: nextNotes, approval };
        }
        case 'close': {
            // D10/D11: `close` targets either a note (`notes.notes`) or a journey conversation
            // (`notes.journeys`), tried in that order; a no-op on an id known to neither (the 404
            // pre-check lives at the route layer, plugin.ts — this keeps the function total for a
            // direct/test caller, mirroring `update`/`remove` above). `close` never touches
            // `approval.screens` — rule 6 fires only on a note turning `open`, which `close` cannot
            // produce — so the input `approval` is returned by identity, which is what lets
            // `plugin.ts`'s `result.approval !== approval` write-suppression hold. Allowed from any
            // current status.
            const idx = notes.notes.findIndex((n) => n.id === patch.id);
            if (idx !== -1) {
                const existing = notes.notes[idx];
                if (!existing)
                    return { notes, approval };
                const updated = { ...existing, status: patch.status };
                const nextArr = notes.notes.slice();
                nextArr[idx] = updated;
                return { notes: { ...notes, notes: nextArr }, approval };
            }
            const existingJourney = notes.journeys[patch.id];
            if (existingJourney) {
                const nextJourneys = { ...notes.journeys, [patch.id]: { ...existingJourney, status: patch.status } };
                return { notes: { ...notes, journeys: nextJourneys }, approval };
            }
            return { notes, approval };
        }
    }
}
/** D6/D7/D16: `applyApprovalPatch(approval, patch, ctx)` -> the new `Approval` document. */
export function applyApprovalPatch(approval, patch, ctx) {
    switch (patch.op) {
        case 'approveScreen': {
            const targets = ctx.config.targets;
            const entry = {
                hash: ctx.hash(patch.name),
                approvedAt: new Date().toISOString(),
                states: ctx.statesOf(patch.name),
                viewports: targets ? targets.viewports : [],
                schemes: targets ? targets.schemes : [],
                screenshots: ctx.screenshotsFor(patch.name),
            };
            return { ...approval, screens: { ...approval.screens, [patch.name]: entry } };
        }
        case 'unapproveScreen': {
            if (!(patch.name in approval.screens))
                return approval;
            const nextScreens = { ...approval.screens };
            delete nextScreens[patch.name];
            return { ...approval, screens: nextScreens };
        }
        case 'clientOk': {
            // D8: the client confirm is a fresh stamp, not a merge onto whatever the entry held before
            // (a prior v1 `{approvedAt, client}` row's `approvedAt` is intentionally dropped here —
            // nothing writes it any more) — `{client:'ok', beats, at}` only. Verification that
            // `patch.beats` matches the served hash happens in the endpoint (`handlePostApproval`,
            // D7); this reducer trusts the caller already checked.
            const existing = approval.journeys[patch.id];
            return {
                ...approval,
                journeys: {
                    ...approval.journeys,
                    [patch.id]: { ...existing, client: 'ok', beats: ctx.beatsHash(patch.id) ?? undefined, at: new Date().toISOString() },
                },
            };
        }
        case 'theme': {
            return { ...approval, theme: patch.key };
        }
    }
}
//# sourceMappingURL=patches.js.map