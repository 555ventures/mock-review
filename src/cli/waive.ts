// D6 (04-contract-v3): the `waive --journey <id> --reason <text> --beats <hash>` verb — the last
// direct plugin write (`client waive`) moves into a package verb, so the package is the only
// program that writes a design document. It runs `ensureDesignFiles`, reads `design/approval.json`
// via the shared `readDesignDoc` (unreadable → refuse with the shared sentence), applies
// `{op:'waive', id, reason, beats}` through the existing `applyApprovalPatch`
// (src/server/patches.ts) under the design lock, and writes the result — mirroring `clientOk`'s
// fresh stamp: `{ ...existing, client: 'waived', reason, beats, at }`, never `approvedAt`. Per D6,
// deliberately no journey-existence or beats-freshness guard here — the verb is the intended
// caller and re-derives nothing; that HTTP-only guarding lives at `clientOk`'s endpoint, not here.
import path from 'node:path'
import { ensureDesignFiles, readDesignDoc, withDesignLock, writeJsonAtomic } from '../files/json.js'
import { CONTRACT_VERSION } from '../schemas/index.js'
import type { Approval } from '../schemas/index.js'
import { applyApprovalPatch, type ApprovalPatchCtx } from '../server/patches.js'
import { fail } from './io.js'

export type WaiveFlags = {
  journey?: string | undefined
  reason?: string | undefined
  beats?: string | undefined
}

// A3 (mirrors approve.ts): `applyApprovalPatch`'s `waive` case reads nothing from `ctx` — the
// context type is still required by the reducer's signature, so the verb supplies stubs that are
// never called on this path.
const unusedCtx: ApprovalPatchCtx = {
  hash: () => '',
  config: { name: null, port: null, targets: null, theme: null, client: null },
  statesOf: () => [],
  screenshotsFor: () => [],
  beatsHash: () => null,
}

export async function waiveVerb(cwd: string, flags: WaiveFlags): Promise<string> {
  const { journey, reason, beats } = flags
  if (journey === undefined || reason === undefined || beats === undefined) {
    fail('usage: waive --journey <id> --reason <text> --beats <hash>')
  }

  ensureDesignFiles(cwd)

  return withDesignLock(cwd, () => {
    const approvalRead = readDesignDoc(cwd, 'approval')
    if (!approvalRead.ok) fail(approvalRead.error)
    // `readDesignDoc`'s return type is keyed on the runtime `kind` argument, not narrowed by it —
    // the cast is safe because `kind: 'approval'` above guarantees `doc` is an `Approval`.
    const approval: Approval = approvalRead.doc as Approval

    const nextApproval = applyApprovalPatch(approval, { op: 'waive', id: journey, reason, beats }, unusedCtx)
    const approvalPath = path.join(cwd, 'design', 'approval.json')
    writeJsonAtomic(approvalPath, { ...nextApproval, contractVersion: CONTRACT_VERSION })

    return `waived ${journey}`
  })
}
