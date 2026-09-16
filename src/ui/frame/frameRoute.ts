// src/ui/frame/frameRoute.ts — DOM-free; the only module that knows the frame's hash grammar
// (reference §0.2; spec 02 D8 as amended by spec 03 D1/D2; rule 16). Ships as source under
// `src/ui` (package.json `files`) AND compiles into `dist/ui/frame/frameRoute.js` because
// `src/analysis/look.ts` imports it (tsconfig `exclude` never blocks an imported file — S2).
export type FrameRoute =
  | { kind: 'screen'; screen: string; state?: string | undefined; scheme?: string | undefined }
  | { kind: 'component'; name?: string | undefined; example?: string | undefined; scheme?: string | undefined }

function splitFrameHash(hash: string): { path: string; params: URLSearchParams } {
  const withoutHash = hash.replace(/^#\/?/, '')
  const qIndex = withoutHash.indexOf('?')
  const path = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex)
  const query = qIndex === -1 ? '' : withoutHash.slice(qIndex + 1)
  return { path, params: new URLSearchParams(query) }
}

/** `''` and `'#/'` → undefined. Unknown params ignored. Never throws. */
export function parseFrameHash(hash: string): FrameRoute | undefined {
  const { path, params } = splitFrameHash(hash)
  if (!path) return undefined
  const scheme = params.get('scheme')
  const schemeField = scheme !== null ? { scheme } : {}
  if (path === '__component') {
    const name = params.get('name')
    const example = params.get('example')
    return { kind: 'component', ...(name !== null ? { name } : {}), ...(example !== null ? { example } : {}), ...schemeField }
  }
  const state = params.get('state')
  return { kind: 'screen', screen: path, ...(state !== null ? { state } : {}), ...schemeField }
}

/** Inverse of parseFrameHash. Byte-identical to the retired builders: `encodeURIComponent` per
 * value (space → %20, never +), params in the order state | name, example, then scheme. */
export function buildFrameHash(route: FrameRoute): string {
  const sp = new URLSearchParams()
  if (route.kind === 'component') {
    if (route.name !== undefined) sp.set('name', route.name)
    if (route.example !== undefined) sp.set('example', route.example)
  } else if (route.state !== undefined) sp.set('state', route.state)
  if (route.scheme !== undefined) sp.set('scheme', route.scheme)
  const parts: string[] = []
  for (const [key, value] of sp) parts.push(`${key}=${encodeURIComponent(value)}`)
  const query = parts.join('&')
  const path = route.kind === 'component' ? '__component' : route.screen
  return `#/${path}${query ? `?${query}` : ''}`
}

/** Identity only: screen+state or name+example. Ignores scheme and everything else. */
export function sameScreenState(a: FrameRoute, b: FrameRoute): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'component' && b.kind === 'component')
    return (a.name ?? '') === (b.name ?? '') && (a.example ?? '') === (b.example ?? '')
  if (a.kind === 'screen' && b.kind === 'screen') return a.screen === b.screen && (a.state ?? '') === (b.state ?? '')
  return false
}

/** `/?frame=1[&_theme=<key>]<hash>` — `_theme` stays in the real search string (spec 02 D18e). */
export function frameSrc(route: FrameRoute, theme?: string | null): string {
  const themeParam = theme ? `&_theme=${encodeURIComponent(theme)}` : ''
  return `/?frame=1${themeParam}${buildFrameHash(route)}`
}

/** Rule 16: replace with the FULL url (a bare `#…` would load the reviewer inside the frame);
 * no-op when the hash already matches. The old `scheme?: 'dark'` argument is gone. */
export function replaceFrameHash(win: Window, route: FrameRoute): void {
  const hash = buildFrameHash(route)
  if (win.location.hash === hash) return
  win.location.replace(win.location.pathname + win.location.search + hash)
}
