// D1/D2: the `approve --screen <name>` verb — the one writer left for `approval.screens` now
// that the page's own Approve-screen control is gone (spec 03, D4). It runs `ensureDesignFiles`,
// then `runCheck(cwd)`, then applies `{op:'approveScreen', name}` through the existing
// `applyApprovalPatch` (src/server/patches.ts) under spec 01's `withDesignLock`, so the entry it
// writes is byte-for-byte what the page button used to write. Not a JSON verb: one line on
// stdout, `approved <name> <hash>`.
import { runCheck } from '../analysis/check.js'
import { screenshotsFor } from '../files/screenshots.js'
import { ensureDesignFiles, readDesignDoc, withDesignLock, writeJsonAtomic } from '../files/json.js'
import path from 'node:path'
import { CONTRACT_VERSION } from '../schemas/index.js'
import type { Approval, Notes } from '../schemas/index.js'
import { applyApprovalPatch, type ApprovalPatchCtx } from '../server/patches.js'
import { fail } from './io.js'

export type ApproveFlags = {
  screen?: string | undefined
}

/** D2: refusals are checked in this order — a failing `check` FIRST (naming its first error
 * finding), because a check that fails before discovery lists no screens and would otherwise
 * report every real screen name as unknown; then an unknown screen name; then any `open` note
 * anchored to that screen. The third check reads `design/notes.json`, so it runs INSIDE the
 * design lock together with the approval read and write — checking it outside would let a client
 * add a note between the check and the write and produce exactly the record this refusal exists
 * to prevent. Nothing is written on any refusal. */
export async function approveVerb(cwd: string, flags: ApproveFlags): Promise<string> {
  const { screen } = flags
  if (screen === undefined) fail('usage: approve --screen <name>')

  ensureDesignFiles(cwd)

  const check = await runCheck(cwd)
  if (!check.ok) {
    const firstError = check.findings.find((f) => f.severity === 'error')
    fail(firstError?.message ?? 'check failed')
  }

  const found = check.screens.find((s) => s.name === screen)
  if (!found) fail(`unknown screen ${screen}`)

  return withDesignLock(cwd, () => {
    const notesRead = readDesignDoc(cwd, 'notes')
    if (!notesRead.ok) fail(notesRead.error)
    // `readDesignDoc`'s return type is keyed on the runtime `kind` argument, not narrowed by it —
    // the cast is safe because `kind: 'notes'` above guarantees `doc` is a `Notes`.
    const notes: Notes = notesRead.doc as Notes

    const openCount = notes.notes.filter((n) => n.screen === screen && n.status === 'open').length
    if (openCount > 0) {
      fail(`${screen} has ${openCount} open note(s) — answer or close them first`)
    }

    const approvalRead = readDesignDoc(cwd, 'approval')
    if (!approvalRead.ok) fail(approvalRead.error)
    // Same narrowing as above, for `kind: 'approval'`.
    const approval: Approval = approvalRead.doc as Approval

    // A3: `applyApprovalPatch`'s `approveScreen` case needs only `hash`, `config`, `statesOf` and
    // `screenshotsFor` from its context — `beatsHash` is used by `clientOk` alone — so the verb
    // supplies a stub that is never called on this path.
    const ctx: ApprovalPatchCtx = {
      hash: (name) => check.screens.find((s) => s.name === name)?.hash ?? '',
      config: check.config,
      statesOf: (name) => check.screens.find((s) => s.name === name)?.states ?? [],
      screenshotsFor: (name) => screenshotsFor(cwd, name),
      beatsHash: () => null,
    }

    const nextApproval = applyApprovalPatch(approval, { op: 'approveScreen', name: screen }, ctx)
    const approvalPath = path.join(cwd, 'design', 'approval.json')
    writeJsonAtomic(approvalPath, { ...nextApproval, contractVersion: CONTRACT_VERSION })

    return `approved ${screen} ${ctx.hash(screen)}`
  })
}
