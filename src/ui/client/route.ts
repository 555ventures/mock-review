// The client view's own hash routes: `#/` (the journey list, or straight to step 1 when there is
// one journey), `#/j/<journey>/step/<n>` (n from 1), `#/j/<journey>/story` (the whole story).
// Every move is a real hash change, so back/forward and a reload land on the same page.
import { useEffect, useState } from 'react'

export type ClientRoute = { kind: 'home' } | { kind: 'step'; journey: string; step: number } | { kind: 'story'; journey: string }

export function parseClientHash(hash: string): ClientRoute {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  if (parts[0] === 'j' && parts[1]) {
    if (parts[2] === 'story' && parts.length === 3) return { kind: 'story', journey: parts[1] }
    if (parts[2] === 'step' && parts[3] && /^\d+$/.test(parts[3]) && parts.length === 4) {
      return { kind: 'step', journey: parts[1], step: Number(parts[3]) }
    }
  }
  return { kind: 'home' }
}

export function clientHref(route: ClientRoute): string {
  if (route.kind === 'home') return '#/'
  const j = encodeURIComponent(route.journey)
  return route.kind === 'story' ? `#/j/${j}/story` : `#/j/${j}/step/${route.step}`
}

export function go(route: ClientRoute, replace = false): void {
  const target = clientHref(route)
  if (replace) location.replace(`${location.pathname}${location.search}${target}`)
  else location.hash = target
}

export function useClientRoute(): ClientRoute {
  const [route, setRoute] = useState<ClientRoute>(() => parseClientHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseClientHash(location.hash))
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}
