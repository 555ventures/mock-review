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

/** Every write refusal carries a sentence the server wrote for a human ("story changed since it
 * was shown — reload", "journey X has no beats…"). Before this type those sentences were thrown
 * away with the status code and the page showed nothing at all, which is what made a refused
 * control look like a dead one. `RefusedError` keeps the sentence so `useNoteActions` can put it
 * on screen. 403 stays `ForbiddenError` — that one replaces the whole page, not a notice. */
export class RefusedError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'RefusedError'
    this.status = status
  }
}

/** The server's refusal bodies are `{ error: string }` (`plugin.ts` `sendJson`). A body that is
 * missing, truncated or not JSON still has to produce a sentence, so fall back to the status. */
async function refusalOf(res: Response, url: string): Promise<RefusedError> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return new RefusedError(res.status, body.error)
  } catch {
    // not JSON, or the stream ended early — fall through to the generic sentence.
  }
  return new RefusedError(res.status, `${url} -> ${res.status}`)
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 403) throw new ForbiddenError(url)
  if (!res.ok) throw await refusalOf(res, url)
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
