export type ApproveFlags = {
    screen?: string | undefined;
};
/** D2: refusals are checked in this order — a failing `check` FIRST (naming its first error
 * finding), because a check that fails before discovery lists no screens and would otherwise
 * report every real screen name as unknown; then an unknown screen name; then any `open` note
 * anchored to that screen. The third check reads `design/notes.json`, so it runs INSIDE the
 * design lock together with the approval read and write — checking it outside would let a client
 * add a note between the check and the write and produce exactly the record this refusal exists
 * to prevent. Nothing is written on any refusal. */
export declare function approveVerb(cwd: string, flags: ApproveFlags): Promise<string>;
//# sourceMappingURL=approve.d.ts.map