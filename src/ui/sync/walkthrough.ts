// The walkthrough additions to the seam (PROTOTYPE-PLAN.md seam B): the round the page shows, the
// frame endpoint's two answers, and the frame document's URL. DOM-free apart from `location`
// defaults, so the frame entry can import it without pulling in the reviewer.
import type { Spec } from '@json-render/core'
import { buildFrameHash, type FrameRoute } from '../frame/frameRoute.js'

export type RoundKind = 'wireframe' | 'screenshots'
export type RoundInfo = { n: number; kind: RoundKind; status: string }

/** `GET state`'s new top-level `round` — read without widening the frozen `ServerState` schema. */
export function roundOf(data: object | null | undefined): RoundInfo | null {
  if (!data || !('round' in data)) return null
  const r: unknown = data.round
  if (!r || typeof r !== 'object' || !('n' in r) || !('kind' in r)) return null
  const n = Number(r.n)
  const kind = r.kind === 'screenshots' ? 'screenshots' : 'wireframe'
  const status = 'status' in r && typeof r.status === 'string' ? r.status : 'open'
  return Number.isFinite(n) ? { n, kind, status } : null
}

/** `GET /p/<project>/__walkthrough/frame?screen=&state=&round=` */
export type FrameAnswer =
  | { kind: 'wireframe'; spec: Spec }
  | { kind: 'screenshots'; images: { width: number; url: string }[] }

/** The frame document for one device: `<base>?frame=1&round=<n>&w=<width>#/<screen>?state=<s>`.
 * `round` and `w` sit in the real search string (not the hash) so rule 16's hash-only state switch
 * keeps them; a new round or width changes `src` and reloads the frame. */
export function walkFrameSrc(base: string, route: FrameRoute, opts: { round: number | null; width: number }): string {
  const round = opts.round !== null ? `&round=${opts.round}` : ''
  return `${base}?frame=1${round}&w=${opts.width}${buildFrameHash(route)}`
}
