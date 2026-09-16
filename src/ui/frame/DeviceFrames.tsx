// Reference §3: the device frame area. Renders the mock in a same-origin iframe per visible
// viewport, scaled to fit the workspace (never upscaling), with the note overlay layer living
// inside the same scaled wrapper so rectangles map 1:1 onto the frame (rule 30).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Card } from '../components/ui/card.js'
import { Overlay, type VisibleNote } from '../notes/Overlay.js'
import { anchorFor, resolveBox, resolveGhost, rectOf, type Box, type UiNote, type Viewport } from '../notes/anchor.js'
import { sameState } from '../store/selectors.js'
import { frameSrc, replaceFrameHash } from './frameHref.js'

export type DeviceSpec = { key: Viewport; width: number; label: string }

export const GAP = 32
export const CAPTION = 28

export type DraftBox = { viewport: Viewport; box: Box; whole?: boolean }

function ownDevice(n: UiNote, v: Viewport): boolean {
  return !n.viewport || n.viewport === v
}

/** Shallow box-map equality (both sides come from this module's own `resolveBox`/`resolveGhost`
 * output, so a reference or `null` compare per key is enough — no need for a deep numeric diff). */
function boxesEqual(a: Record<string, Box | null>, b: Record<string, Box | null>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    const av = a[key]
    const bv = b[key]
    if (av === bv) continue
    if (!av || !bv) return false
    if (av.left !== bv.left || av.top !== bv.top || av.width !== bv.width || av.height !== bv.height) return false
  }
  return true
}

function Device({
  spec,
  scale,
  h,
  screen,
  state,
  theme,
  title,
  notes,
  showNotes,
  marking,
  draft,
  isolated,
  onFrameLoad,
  onRoot,
  onBoxes,
  onSelect,
  onDraw,
  onOpenDraft,
  onPaletteKey,
}: {
  spec: DeviceSpec
  scale: number
  h: number
  screen: string
  state: string
  theme: string | null
  title: string
  notes: UiNote[]
  showNotes: boolean
  marking: boolean
  draft: Box | null
  isolated: boolean
  onFrameLoad: () => void
  onRoot: (v: Viewport, root: HTMLElement | null) => void
  onBoxes: (v: Viewport, boxes: Record<string, Box | null>) => void
  onSelect: (id: string) => void
  onDraw: (v: Viewport, box: Box) => void
  onOpenDraft: () => void
  onPaletteKey: () => void
}) {
  const { key: viewport, width: w, label } = spec
  const frameRef = useRef<HTMLIFrameElement>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // D10: `theme` is a dependency (not just `screen`) so picking a theme changes `src` and forces
  // a real iframe reload — the frame entry reads `approval.theme` once, at script load.
  const src = useMemo(() => frameSrc(screen, state, theme), [screen, theme])
  const [frameLoad, setFrameLoad] = useState(0)
  const [tick, setTick] = useState(0)
  const [boxes, setBoxes] = useState<Record<string, Box | null>>({})
  const boxesRef = useRef<Record<string, Box | null>>({})
  const [drag, setDrag] = useState<{ x0: number; y0: number; box: Box } | null>(null)

  useEffect(() => {
    const win = frameRef.current?.contentWindow
    if (win && frameLoad) replaceFrameHash(win, screen, state)
  }, [screen, state, frameLoad])

  useEffect(() => {
    const win = frameRef.current?.contentWindow as (Window & typeof globalThis) | null | undefined
    const root = win?.document.getElementById('root')
    if (!win || !root) return
    rootRef.current = root
    onRoot(viewport, root)
    let raf = 0
    const bump = () => {
      if (raf) return
      raf = win.requestAnimationFrame(() =>
        win.requestAnimationFrame(() => {
          raf = 0
          setTick((t) => t + 1)
        }),
      )
    }
    const onScroll = bump
    const ro = new win.ResizeObserver(bump)
    ro.observe(root)
    const mo = new win.MutationObserver(bump)
    mo.observe(root, { childList: true, subtree: true })
    win.addEventListener('scroll', onScroll, true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onPaletteKey()
      }
    }
    win.addEventListener('keydown', onKey)
    bump()
    return () => {
      ro.disconnect()
      mo.disconnect()
      win.removeEventListener('scroll', onScroll, true)
      win.removeEventListener('keydown', onKey)
      if (raf) win.cancelAnimationFrame(raf)
      rootRef.current = null
      onRoot(viewport, null)
    }
  }, [frameLoad, viewport])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const next: Record<string, Box | null> = {}
    for (const n of notes) {
      if (n.screen !== screen || !sameState(n.state, state)) continue
      next[n.id] = ownDevice(n, viewport)
        ? resolveBox(root, n.component, n.key, n.snippet, rectOf(n))
        : resolveGhost(root, n.component, n.key, n.snippet)
    }
    // Skip both setters when nothing actually moved. `onBoxes` fans out into ScreenPage's
    // `setBoxesBy` (a fresh `{...prev, [v]: next}` object every call), so an unconditional call
    // here is two nested synchronous commits on every `tick`/notes/SSE-driven store update, most
    // of which resolve to geometrically identical boxes (nothing in the mock actually moved).
    if (boxesEqual(boxesRef.current, next)) return
    boxesRef.current = next
    setBoxes(next)
    onBoxes(viewport, next)
  }, [notes, state, tick, scale, h])

  const local = (e: ReactPointerEvent) => {
    const c = wrapRef.current?.getBoundingClientRect()
    if (!c) return { x: 0, y: 0 }
    return { x: (e.clientX - c.left) / scale, y: (e.clientY - c.top) / scale }
  }
  const onDown = (e: ReactPointerEvent) => {
    const p = local(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ x0: p.x, y0: p.y, box: { left: p.x, top: p.y, width: 0, height: 0 } })
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const p = local(e)
    setDrag({
      ...drag,
      box: {
        left: Math.min(p.x, drag.x0),
        top: Math.min(p.y, drag.y0),
        width: Math.abs(p.x - drag.x0),
        height: Math.abs(p.y - drag.y0),
      },
    })
  }
  const onUp = () => {
    if (!drag) return
    const b = drag.box
    setDrag(null)
    if (b.width < 8 || b.height < 8) return
    onDraw(viewport, b)
  }

  const visible: VisibleNote[] = notes
    .filter((n) => n.screen === screen && sameState(n.state, state))
    .map((n) => ({ note: n, box: boxes[n.id] ?? null, ownDevice: ownDevice(n, viewport) }))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">
        {label} {w}
      </span>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="relative overflow-hidden" style={{ width: w * scale, height: h * scale }}>
          <div
            ref={wrapRef}
            className="absolute top-0 left-0 overflow-hidden"
            style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <iframe
              ref={frameRef}
              src={src}
              title={`${title} mock (${label})`}
              onLoad={() => {
                setFrameLoad((n) => n + 1)
                onFrameLoad()
              }}
              inert={isolated}
              className="block border-0"
              style={{ width: w, height: h }}
            />
            {showNotes && (
              <Overlay
                viewport={viewport}
                visible={visible}
                marking={marking}
                drag={drag?.box ?? null}
                draft={draft}
                onSelect={onSelect}
                onOpenDraft={onOpenDraft}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onWheel={(e) => frameRef.current?.contentWindow?.scrollBy(e.deltaX, e.deltaY)}
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

export function DeviceFrames({
  devices,
  scale,
  h,
  screen,
  state,
  theme,
  title,
  notes,
  showNotes,
  marking,
  draftByViewport,
  isolated,
  onFrameLoad,
  onRoot,
  onBoxes,
  onSelect,
  onDraw,
  onOpenDraft,
  onPaletteKey,
}: {
  devices: DeviceSpec[]
  scale: number
  h: number
  screen: string
  state: string
  theme: string | null
  title: string
  notes: UiNote[]
  showNotes: boolean
  marking: boolean
  draftByViewport: (v: Viewport) => Box | null
  isolated: boolean
  onFrameLoad: () => void
  onRoot: (v: Viewport, root: HTMLElement | null) => void
  onBoxes: (v: Viewport, boxes: Record<string, Box | null>) => void
  onSelect: (id: string) => void
  onDraw: (v: Viewport, box: Box) => void
  onOpenDraft: () => void
  onPaletteKey: () => void
}) {
  return (
    <div className="flex items-start" style={{ gap: GAP }}>
      {devices.map((spec) => (
        <Device
          key={spec.key}
          spec={spec}
          scale={scale}
          h={h}
          screen={screen}
          state={state}
          theme={theme}
          title={title}
          notes={notes}
          showNotes={showNotes}
          marking={marking}
          draft={draftByViewport(spec.key)}
          isolated={isolated}
          onFrameLoad={onFrameLoad}
          onRoot={onRoot}
          onBoxes={onBoxes}
          onSelect={onSelect}
          onDraw={onDraw}
          onOpenDraft={onOpenDraft}
          onPaletteKey={onPaletteKey}
        />
      ))}
    </div>
  )
}

export function anchorForDraw(root: HTMLElement, box: Box) {
  return anchorFor(root, box)
}
