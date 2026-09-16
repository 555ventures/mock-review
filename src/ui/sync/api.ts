// D2/D6: the only module that calls the server. Sends per-note/approval patches and returns the
// new document (the server is the sole writer of `design/notes.json` and `design/approval.json`
// while `serve` runs).
import type { ApprovalPatch, NotesPatch, ServerState } from '../../schemas/patches.js'
import type { Approval, Notes } from '../../schemas/index.js'

const BASE = '/__mock-review'

/** D24: the server 403s a request it cannot place as `client` or a loopback `owner` — most often
 * because the owner changed `config.client.token` while a client tab was still open. A typed
 * error lets the store tell that case apart from a transient network failure and render the
 * one-line notice D24 requires instead of an empty or broken page. */
export class ForbiddenError extends Error {
  constructor(url: string) {
    super(`${url} -> 403`)
    this.name = 'ForbiddenError'
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 403) throw new ForbiddenError(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return (await res.json()) as T
}

// D26: `useNoteActions`'s action -> patch -> refresh path and `main.tsx`'s SSE -> refetch path are
// two independent producers of `fetchState()` calls that can resolve in either order (a refetch
// queued by an earlier event can take longer than a refresh issued after it, especially under
// load). `seq` is assigned when the request is *issued* (before the `await`), not when it
// resolves, so it reflects issue order regardless of resolve order; `store.ts`'s `setData` uses it
// to drop a response older than the newest one already applied instead of letting whichever
// promise happens to resolve last silently win.
let requestSeq = 0

export type StateFetch = { seq: number; state: ServerState }

export async function fetchState(): Promise<StateFetch> {
  const seq = ++requestSeq
  const res = await fetch(`${BASE}/state`)
  if (res.status === 403) throw new ForbiddenError(`${BASE}/state`)
  if (!res.ok) throw new Error(`${BASE}/state -> ${res.status}`)
  return { seq, state: (await res.json()) as ServerState }
}

export async function patchNotes(patch: NotesPatch): Promise<Notes> {
  return postJson<Notes>(`${BASE}/notes`, patch)
}

export async function patchApproval(patch: ApprovalPatch): Promise<Approval> {
  return postJson<Approval>(`${BASE}/approval`, patch)
}
