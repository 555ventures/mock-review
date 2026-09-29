// Reference §3: the device frame area. Renders the mock in a same-origin iframe per visible
// viewport, scaled to fit the workspace (never upscaling), with the note overlay layer living
// inside the same scaled wrapper so boxes map 1:1 onto the frame (rule 30).
//
// Until the frame has actually drawn the screen+state the page asks for (`#root[data-shown]`, set
// by `frame/mount.tsx` after each render), a slate placeholder covers it: the previous screen is
// never visible under the new header while the next one loads.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Card } from '../components/ui/card.js'
import { Overlay, type VisibleNote } from '../notes/Overlay.js'
import { anchorBox, pickAt, type Box, type Pick, type UiNote, type Viewport } from '../notes/anchor.js'
import { areaNotesOn, sameState } from '../store/selectors.js'
import { buildFrameHash, parseFrameHash, replaceFrameHash, sameScreenState } from './frameRoute.js'
import { projectBase } from '../sync/project.js'
import { walkFrameSrc } from '../sync/walkthrough.js'

export type DeviceSpec = { key: Viewport; width: number; label: string }

export const GAP = 32
export const CAPTION = 28

/** The design's slate (docs/design/client-view.md tokens): the placeholder while a screen loads. */
export const SLATE = '#E9EDF1'

/** Shallow box-map equality (both sides come from this module's own `anchorBox` output, so a
 * reference or `null` compare per key is enough — no need for a deep numeric diff). */
function boxesEqual(a: Record<string, Box | null>, b: Record<string, Box | null>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    const av = a[key]
    const bv = b[key]
    if (av === bv) continue
    if (!av || !bv || !boxEq(av, bv)) return false
  }
  return true
}

function boxEq(a: Box, b: Box): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/** Reference-stable skip for the ring boxes array, same idea as `boxesEqual` above. */
function ringBoxesEqual(a: Box[], b: Box[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const av = a[i]
    const bv = b[i]
    if (!av || !bv || !boxEq(av, bv)) return false
  }
  return true
}

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** D5: the labels of this step's outgoing edges, resolved to frame-viewport boxes for the
 * `[data-journey-ring]` overlay — a pure read of the frame's DOM, never a write into it. */
function resolveRing(
  root: HTMLElement,
  win: Window,
  labels: string[],
  here: { screen: string; state: string },
): Box[] {
  const route = parseFrameHash(win.location.hash)
  if (!route || !sameScreenState(route, { kind: 'screen', screen: here.screen, state: here.state }))
    return []
  const viewport = { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight }
  const boxes: Box[] = []
  for (const label of labels) {
    const el = root.querySelector<HTMLElement>(`[data-to="${CSS.escape(label)}"]`)
    if (!el) continue
    if (!el.checkVisibility()) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (!rectsIntersect(r, viewport)) continue
    let clipped = false
    let ancestor: HTMLElement | null = el.parentElement
    while (ancestor) {
      const cs = win.getComputedStyle(ancestor)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        if (!rectsIntersect(r, ancestor.getBoundingClientRect())) {
          clipped = true
          break
        }
      }
      if (ancestor === root) break
      ancestor = ancestor.parentElement
    }
    if (clipped) continue
    boxes.push({ left: r.left, top: r.top, width: r.width, height: r.height })
  }
  return boxes
}

function Device({
  spec,
  scale,
  h,
  screen,
  state,
  round,
  title,
  notes,
  pins,
  marking,
  picked,
  ring,
  isolated,
  onFrameLoad,
  onRoot,
  onBoxes,
  onSelect,
  onPick,
  onOpenDraft,
  onPaletteKey,
}: {
  spec: DeviceSpec
  scale: number
  h: number
  screen: string
  state: string
  round: number | null
  title: string
  notes: UiNote[]
  pins: boolean
  marking: boolean
  picked: Box | null
  ring: string[]
  isolated: boolean
  onFrameLoad: () => void
  onRoot: (v: Viewport, root: HTMLElement | null) => void
  onBoxes: (v: Viewport, boxes: Record<string, Box | null>) => void
  onSelect: (id: string) => void
  onPick: (v: Viewport, pick: Pick) => void
  onOpenDraft: () => void
  onPaletteKey: () => void
}) {
  const { key: viewport, width: w, label } = spec
  const frameRef = useRef<HTMLIFrameElement>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // U2/U8: the project's own frame document; `round` and the device width are real search params,
  // so a new round or width reloads the frame while a state switch stays a hash replace (rule 16).
  const src = useMemo(
    () => walkFrameSrc(projectBase(), { kind: 'screen', screen, state }, { round, width: w }),
    [screen, round, w],
  )
  const [frameLoad, setFrameLoad] = useState(0)
  const [tick, setTick] = useState(0)
  const [boxes, setBoxes] = useState<Record<string, Box | null>>({})
  const boxesRef = useRef<Record<string, Box | null>>({})
  const [ringBoxes, setRingBoxes] = useState<Box[]>([])
  const ringBoxesRef = useRef<Box[]>([])
  const [hover, setHover] = useState<Box | null>(null)
  // The hash whose content the frame has actually drawn (`#root[data-shown]`).
  const [shown, setShown] = useState<string | null>(null)
  const expected = buildFrameHash({ kind: 'screen', screen, state })
  const drawn = shown === expected

  useEffect(() => {
    const win = frameRef.current?.contentWindow
    if (win && frameLoad) replaceFrameHash(win, { kind: 'screen', screen, state })
  }, [screen, state, frameLoad])

  useEffect(() => {
    if (!marking) setHover(null)
  }, [marking])

  useEffect(() => {
    const win = frameRef.current?.contentWindow as (Window & typeof globalThis) | null | undefined
    const root = win?.document.getElementById('root')
    if (!win || !root) return
    rootRef.current = root
    onRoot(viewport, root)
    setShown(root.getAttribute('data-shown'))
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
    const shownObserver = new win.MutationObserver(() => setShown(root.getAttribute('data-shown')))
    shownObserver.observe(root, { attributes: true, attributeFilter: ['data-shown'] })
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
      shownObserver.disconnect()
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
    if (drawn) {
      for (const n of notes) {
        if (n.screen !== screen || !sameState(n.state, state)) continue
        const r = root.getBoundingClientRect()
        next[n.id] = n.anchor ? anchorBox(root, n.anchor) : { left: r.left, top: r.top, width: r.width, height: r.height }
      }
    }
    // Skip both setters when nothing actually moved. `onBoxes` fans out into ScreenPage's
    // `setBoxesBy` (a fresh `{...prev, [v]: next}` object every call), so an unconditional call
    // here is two nested synchronous commits on every `tick`/notes/SSE-driven store update.
    if (boxesEqual(boxesRef.current, next)) return
    boxesRef.current = next
    setBoxes(next)
    onBoxes(viewport, next)
  }, [notes, state, tick, scale, h, drawn])

  useLayoutEffect(() => {
    const root = rootRef.current
    const win = frameRef.current?.contentWindow as (Window & typeof globalThis) | null | undefined
    const next = root && win && drawn ? resolveRing(root, win, ring, { screen, state }) : []
    if (ringBoxesEqual(ringBoxesRef.current, next)) return
    ringBoxesRef.current = next
    setRingBoxes(next)
  }, [ring, tick, scale, h, drawn])

  const local = (e: { clientX: number; clientY: number }) => {
    const c = wrapRef.current?.getBoundingClientRect()
    if (!c) return { x: 0, y: 0 }
    return { x: (e.clientX - c.left) / scale, y: (e.clientY - c.top) / scale }
  }
  const pickUnder = (e: { clientX: number; clientY: number }): Pick | null => {
    const root = rootRef.current
    if (!root || !drawn) return null
    const p = local(e)
    return pickAt(root, p.x, p.y)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const pick = pickUnder(e)
    const next = pick ? (pick.box.width === 0 ? null : pick.box) : null
    setHover((prev) => (prev && next && boxEq(prev, next) ? prev : next))
  }
  const onClick = (e: ReactMouseEvent) => {
    const pick = pickUnder(e)
    if (pick) onPick(viewport, pick)
  }

  // Rule 39: `pins` gates the note pins only — the picked element and the pick layer (`marking`)
  // are independent of it. `areaNotesOn` (D5) owns the whole-note exclusion; measurement above
  // still sees every note (D6) so `isOutdatedNote` keeps reading a box map that includes
  // whole-screen notes.
  const visible: VisibleNote[] = pins ? areaNotesOn(screen, state, notes).map((n) => ({ note: n, box: boxes[n.id] ?? null })) : []

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
            style={{
              width: w,
              height: h,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
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
            {!drawn && <div data-frame-placeholder aria-hidden className="absolute inset-0 z-40" style={{ background: SLATE }} />}
            {ringBoxes.map((box, i) => (
              <div
                key={i}
                data-journey-ring
                className="pointer-events-none absolute z-5"
                style={box}
              />
            ))}
            <Overlay
              visible={visible}
              marking={marking}
              hover={hover}
              picked={picked}
              onSelect={onSelect}
              onOpenDraft={onOpenDraft}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
              onClick={onClick}
              onWheel={(e) => frameRef.current?.contentWindow?.scrollBy(e.deltaX, e.deltaY)}
            />
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
  round,
  title,
  notes,
  pins,
  marking,
  pickedByViewport,
  ring,
  isolated,
  onFrameLoad,
  onRoot,
  onBoxes,
  onSelect,
  onPick,
  onOpenDraft,
  onPaletteKey,
}: {
  devices: DeviceSpec[]
  scale: number
  h: number
  screen: string
  state: string
  round: number | null
  title: string
  notes: UiNote[]
  pins: boolean
  marking: boolean
  pickedByViewport: (v: Viewport) => Box | null
  ring: string[]
  isolated: boolean
  onFrameLoad: () => void
  onRoot: (v: Viewport, root: HTMLElement | null) => void
  onBoxes: (v: Viewport, boxes: Record<string, Box | null>) => void
  onSelect: (id: string) => void
  onPick: (v: Viewport, pick: Pick) => void
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
          round={round}
          title={title}
          notes={notes}
          pins={pins}
          marking={marking}
          picked={pickedByViewport(spec.key)}
          ring={ring}
          isolated={isolated}
          onFrameLoad={onFrameLoad}
          onRoot={onRoot}
          onBoxes={onBoxes}
          onSelect={onSelect}
          onPick={onPick}
          onOpenDraft={onOpenDraft}
          onPaletteKey={onPaletteKey}
        />
      ))}
    </div>
  )
}
