import type { Approval, Config, NullConfig, Notes } from '../schemas/index.js';
import type { AppliedNotesPatch, ApprovalPatch } from '../schemas/patches.js';
/**
 * D6/D16: `applyNotesPatch(notes, patch, approval = EMPTY_APPROVAL)` -> `{ notes, approval }`.
 * `approval` is read (never required) so rule 6 can un-approve a screen in the same call; a
 * caller with no approval document yet (e.g. a pure unit test) may omit it.
 *
 * D2/Contracts: `patch` is `AppliedNotesPatch`, not the wire `NotesPatch` — the HTTP boundary
 * (`plugin.ts`) rewrites a client's `reply.entry.by` to `'client'`, a value the wire enum does
 * not admit, before calling this reducer. Only the route layer parses the narrow wire type.
 */
export declare function applyNotesPatch(notes: Notes, patch: AppliedNotesPatch, approval?: Approval): {
    notes: Notes;
    approval: Approval;
};
/** D16: the context `applyApprovalPatch` needs beyond the patch itself — the current screen
 * hash/states/screenshots come from the caller (the server's live `ServerState`, or a test's
 * stub) rather than being recomputed here, so this stays a pure function. */
export type ApprovalPatchCtx = {
    hash: (name: string) => string;
    config: Config | NullConfig;
    statesOf: (name: string) => string[];
    screenshotsFor: (name: string) => string[];
    /** D7: the served journey's story hash (`ServerJourney.beats`), or `null` for an unknown
     * journey or one with no confirmable story — derivation lives here, verification stays in the
     * endpoint (`plugin.ts`'s `handlePostApproval`), mirroring `hash`/`approveScreen`. */
    beatsHash: (journeyId: string) => string | null;
};
/** D6/D7/D16: `applyApprovalPatch(approval, patch, ctx)` -> the new `Approval` document. */
export declare function applyApprovalPatch(approval: Approval, patch: ApprovalPatch, ctx: ApprovalPatchCtx): Approval;
//# sourceMappingURL=patches.d.ts.map