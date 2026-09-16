// Reference §8.3/rules 21-25: the interactive journey guide. D4: the ring targets
// `[data-to="<label>"]` inside the mock (spec 01 D7's attribute) instead of the prototype's
// click.in/click.text lookup. Hints and click-to-advance always work; `ring` only controls which
// found controls' labels are returned for `DeviceFrames`/`Device` to draw a ring over (D1/D4: the
// hook never writes into the frame DOM — no attribute, no bookkeeping to remove on cleanup).
import { useEffect, useState, type RefObject } from 'react'
import { href } from '../router/route.js'
import { parseFrameHash, sameScreenState } from '../frame/frameRoute.js'
import { hintFor, type LocateEdge } from './locate.js'

export type GuideHint = { say: string; found: boolean; to: number }

export type GuideStep = { screen: string; state: string }

export type GuideResult = { hints: GuideHint[]; ring: string[] }

function findControl(root: HTMLElement, label: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-to="${CSS.escape(label)}"]`)
}

const EMPTY_HINTS: GuideHint[] = []
const EMPTY_RING: string[] = []

export function useJourneyGuide({
  rootsRef,
  count,
  steps,
  edges,
  idx,
  enabled,
  ring,
  frame,
  journeyId,
}: {
  rootsRef: RefObject<Partial<Record<string, HTMLElement | null>>>
  count: number
  steps: GuideStep[]
  edges: LocateEdge[]
  idx: number
  enabled: boolean
  ring: boolean
  frame: number
  journeyId: string
}): GuideResult {
  const [hints, setHints] = useState<GuideHint[]>(EMPTY_HINTS)
  const [guideRing, setGuideRing] = useState<string[]>(EMPTY_RING)

  useEffect(() => {
    // A no-op reset (already empty) must not produce a new array reference — `[]` !== `[]`, so an
    // unconditional `setHints([])` here would re-render on every dependency change even when
    // there was nothing to clear, and on a non-journey screen (`idx < 0`, this effect's common
    // case) every dependency change is exactly that: nothing to clear, over and over.
    setHints((h) => (h.length ? EMPTY_HINTS : h))
    setGuideRing((r) => (r.length ? EMPTY_RING : r))
    if (!enabled || idx < 0) return
    const listeners: { doc: Document; fn: (e: MouseEvent) => void }[] = []

    const step = steps[idx]
    if (!step) return
    const here = { kind: 'screen' as const, screen: step.screen, state: step.state }
    let cancelled = false
    let waited = 0
    let t = 0

    const onThisStep = (r: HTMLElement): boolean => {
      const win = r.ownerDocument.defaultView
      const route = win ? parseFrameHash(win.location.hash) : undefined
      return !!route && sameScreenState(route, here)
    }

    const scan = () => {
      if (cancelled) return
      const roots = Object.values(rootsRef.current ?? {}).filter((r): r is HTMLElement => !!r && onThisStep(r))
      if (roots.length < count && (waited += 50) < 2000) {
        t = window.setTimeout(scan, 50)
        return
      }
      if (roots.length === 0) return

      const outEdges = edges.filter((e) => e.from === idx)
      const perRoot = roots.map((root) => ({
        root,
        found: outEdges.map((e) => (e.label ? findControl(root, e.label) : null)),
      }))
      setHints(
        outEdges.map((e, i) => ({
          say: hintFor(e),
          found: perRoot.some((p) => !!p.found[i]),
          to: e.to,
        })),
      )
      setGuideRing(
        ring
          ? outEdges.flatMap((e, i) => (e.label && perRoot.some((p) => !!p.found[i]) ? [e.label] : []))
          : EMPTY_RING,
      )

      for (const { root, found } of perRoot) {
        const targets = found
          .map((el, i) => (el ? { el, to: outEdges[i]?.to } : null))
          .filter((x): x is { el: HTMLElement; to: number | undefined } => !!x)
        if (ring) {
          const first = targets[0]?.el
          const win = first?.ownerDocument.defaultView
          if (first && win) {
            const r = first.getBoundingClientRect()
            if (r.top < 0 || r.bottom > win.innerHeight) {
              win.scrollTo({ top: win.scrollY + r.top - win.innerHeight / 3, behavior: 'smooth' })
            }
          }
        }
        const fn = (ev: MouseEvent) => {
          const hit = targets.find((x) => x.el.contains(ev.target as Node))
          if (!hit || hit.to === undefined) return
          ev.preventDefault()
          ev.stopPropagation()
          const s = steps[hit.to]
          if (s) location.hash = href({ kind: 'screen', screen: s.screen, state: s.state, journey: journeyId, step: hit.to })
        }
        root.ownerDocument.addEventListener('click', fn, true)
        listeners.push({ doc: root.ownerDocument, fn })
      }
    }
    t = window.setTimeout(scan, 120)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      listeners.forEach(({ doc, fn }) => doc.removeEventListener('click', fn, true))
    }
  }, [rootsRef, count, steps, edges, idx, enabled, ring, frame, journeyId])

  return { hints, ring: guideRing }
}
