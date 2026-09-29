/// <reference types="vite/client" />
// U2 (PROTOTYPE-PLAN.md): the frame entry — the `?frame` branch of the one entry document
// (`src/ui/main.tsx` imports this module when the URL carries `frame`). It loads no host files:
// the screen comes from `GET /p/<project>/__walkthrough/frame?screen=&state=&round=`, and is drawn
// either as a json-render wireframe with the gray registry (one `JSONUIProvider` per screen+state)
// or, for a screenshots round, as the one picture whose width matches this device (`w`).
//
// URL: `/p/<project>/?frame=1&round=<n>&w=<width>#/<screen>?state=<s>`. The reviewer switches
// state by replacing the hash only (rule 16), so this module re-fetches on `hashchange`. It also
// re-fetches on the server's `files` event (a new round was pushed) and on the old
// `mock-review:frame-reload` HMR event.
//
// `#root[data-shown]` records the hash whose content is actually on screen, so the journey guide
// never scans the previous state's controls while the next one is still loading.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GrayScreen } from '../../catalog/gray-registry.js'
import '../../catalog/gray.css'
import { parseFrameHash } from './frameRoute.js'
import { projectBase } from '../sync/project.js'
import { subscribe } from '../sync/events.js'
import type { FrameAnswer } from '../sync/walkthrough.js'
import { PICTURE_ANCHOR } from '../notes/anchor.js'

type Loaded = { hash: string; screen: string; state: string; answer: FrameAnswer } | { hash: string; error: string }

function param(name: string): string | null {
  const fromSearch = new URLSearchParams(location.search).get(name)
  if (fromSearch !== null) return fromSearch
  // The plan's URL shape carries `w` in the hash (`#/<screen>?state=&w=`); accept it there too.
  const hash = location.hash
  const q = hash.indexOf('?')
  return q === -1 ? null : new URLSearchParams(hash.slice(q + 1)).get(name)
}

async function load(): Promise<Loaded> {
  const hash = location.hash
  const route = parseFrameHash(hash)
  if (route?.kind !== 'screen') return { hash, error: 'No screen in this address.' }
  const state = route.state ?? ''
  const q = new URLSearchParams({ screen: route.screen, state })
  const round = param('round')
  if (round) q.set('round', round)
  try {
    const res = await fetch(`${projectBase()}__walkthrough/frame?${q.toString()}`)
    if (!res.ok) return { hash, error: `This screen could not be loaded (${res.status}).` }
    const answer = (await res.json()) as FrameAnswer
    return { hash, screen: route.screen, state, answer }
  } catch {
    return { hash, error: 'This screen could not be loaded.' }
  }
}

function pickImage(images: { width: number; url: string }[], width: number): { width: number; url: string } | undefined {
  const exact = images.find((i) => i.width === width)
  if (exact) return exact
  return [...images].sort((a, b) => Math.abs(a.width - width) - Math.abs(b.width - width))[0]
}

/** `&fit=1` (the client view): the page is as tall as its content (the host sizes the frame to
 * it), and a navigate press never moves the host — the client view decides what a press means. */
const FIT = param('fit') === '1'

/** A navigate press outside a journey step moves the reviewer to that screen (inside a journey
 * step the guide intercepts the click first, in the capture phase, and advances the journey). */
function navigateParent(to: string): void {
  if (FIT) return
  try {
    if (window.parent !== window) window.parent.location.hash = `#/${to}`
  } catch {
    // cross-origin parent: nothing to do
  }
}

function Frame() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener('hashchange', bump)
    const unsubscribe = subscribe((e) => {
      if (e === 'files') bump()
    })
    if (import.meta.hot) import.meta.hot.on('mock-review:frame-reload', bump)
    return () => {
      window.removeEventListener('hashchange', bump)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void load().then((l) => {
      if (!cancelled) setLoaded(l)
    })
    return () => {
      cancelled = true
    }
  }, [tick])

  useEffect(() => {
    const root = document.getElementById('root')
    if (root && loaded) root.setAttribute('data-shown', loaded.hash)
  }, [loaded])

  if (!loaded) return null
  if ('error' in loaded) {
    return <p style={{ font: '13px system-ui, sans-serif', color: '#8a8a8a', padding: 16, margin: 0 }}>{loaded.error}</p>
  }
  const { answer, screen, state } = loaded
  if (answer.kind === 'screenshots') {
    const width = Number(param('w')) || window.innerWidth
    const img = pickImage(answer.images, width)
    if (!img) return <p style={{ font: '13px system-ui, sans-serif', color: '#8a8a8a', padding: 16, margin: 0 }}>No picture for this width.</p>
    return (
      <img
        data-component={PICTURE_ANCHOR}
        src={img.url}
        alt={`${screen} ${state}`}
        draggable={false}
        style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }}
      />
    )
  }
  return <GrayScreen key={`${screen}|${state}`} spec={answer.spec} onNavigate={navigateParent} fill={!FIT} />
}

const container = document.getElementById('root')
if (container) {
  // Nothing is drawn yet: an empty (not absent) `data-shown` tells the guide to keep waiting.
  container.setAttribute('data-shown', '')
  createRoot(container).render(<Frame />)
}
