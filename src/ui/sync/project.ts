// U8: the page lives at `/p/<project>/` — every fetch, the SSE stream and the frame URL go to that
// project's endpoints. Outside a `/p/<project>/` path (the old single-host serve) the base is `/`,
// so the paths come out exactly as they were.
export function projectBase(pathname: string = location.pathname): string {
  const m = /^\/p\/([^/]+)\//.exec(pathname)
  return m ? `/p/${m[1]}/` : '/'
}

/** `?round=<n>` on the reviewer's own URL pins an older round; absent = the latest. */
export function roundOverride(search: string = location.search): string | null {
  const r = new URLSearchParams(search).get('round')
  return r && /^\d+$/.test(r) ? r : null
}
