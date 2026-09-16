// D2/D16: the one router implementation shared by the reviewer (reference §0.2's hash grammar).
// `parseRoute(hash, screens)` needs the ordered screen-name list to know whether a path is a real
// screen (-> `screen`), the components catalog (-> `components`) or unknown (-> `unknown`); an
// empty hash defaults to the first screen (discovery order). `href` inverts a `Route` exactly.
import { useEffect, useState } from 'react'
export type Route =
  | { kind: 'screen'; screen: string; state?: string | undefined; journey?: string | undefined; step?: number | undefined }
  | { kind: 'components'; c?: string | undefined; from?: string | undefined }
  | { kind: 'unknown'; path: string }

function splitHash(hash: string): { path: string; params: URLSearchParams } {
  const withoutHash = hash.replace(/^#\/?/, '')
  const qIndex = withoutHash.indexOf('?')
  const path = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex)
  const query = qIndex === -1 ? '' : withoutHash.slice(qIndex + 1)
  return { path, params: new URLSearchParams(query) }
}

export function parseRoute(hash: string, screens: readonly string[]): Route {
  const { path, params } = splitHash(hash)

  if (path === '' || path === undefined) {
    const first = screens[0]
    return first ? { kind: 'screen', screen: first } : { kind: 'unknown', path: '' }
  }

  if (path === 'components') {
    const c = params.get('c')
    const from = params.get('from')
    return {
      kind: 'components',
      ...(c !== null ? { c } : {}),
      ...(from !== null ? { from } : {}),
    }
  }

  if (!screens.includes(path)) {
    return { kind: 'unknown', path }
  }

  const state = params.get('state')
  const journey = params.get('j')
  const stepParam = params.get('step')
  const step = stepParam === null ? undefined : Number(stepParam)

  return {
    kind: 'screen',
    screen: path,
    ...(state !== null ? { state } : {}),
    ...(journey !== null ? { journey } : {}),
    ...(step !== undefined && !Number.isNaN(step) ? { step } : {}),
  }
}

export function componentsHref(c?: string | null, from?: string | null): string {
  return href({
    kind: 'components',
    ...(c ? { c } : {}),
    ...(from ? { from } : {}),
  })
}

export function href(route: Route): string {
  if (route.kind === 'unknown') return `#/${route.path}`

  if (route.kind === 'components') {
    const sp = new URLSearchParams()
    if (route.c !== undefined) sp.set('c', route.c)
    if (route.from !== undefined) sp.set('from', route.from)
    const q = sp.toString()
    return `#/components${q ? `?${q}` : ''}`
  }

  const sp = new URLSearchParams()
  if (route.state !== undefined) sp.set('state', route.state)
  if (route.journey !== undefined) sp.set('j', route.journey)
  if (route.step !== undefined) sp.set('step', String(route.step))
  const q = sp.toString()
  return `#/${route.screen}${q ? `?${q}` : ''}`
}

/** A `hashchange`-driven reactive route, reparsed against the current screen list on every
 * change (reference §0.2: routing is a hashchange listener). */
export function useRoute(screens: readonly string[]): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash, screens))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash, screens))
    onChange()
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [screens.join(',')])
  return route
}
