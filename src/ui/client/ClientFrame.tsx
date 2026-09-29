// The client view's frame (docs/design/client-view.md §1–§3): the existing frame document
// (`?frame=1&fit=1`, drawn by `GrayScreen`) at the round's width, scaled to the column's width,
// and exactly as tall as its content — the page scrolls, never the frame. Until the asked-for
// screen is drawn (`#root[data-shown]`), the frame area is the slate background at the frame's
// height; the screen then cross-fades in (120 ms, none with reduced motion).
//
// Pick mode (§2): a layer over the frame finds the `[data-node]` under the pointer (2 px
// highlighter outline, 4 px halo); one tap/click picks it. On a picture it picks the point.
// Outside pick mode, pressing the control the story expects (`[data-to]`) advances.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { anchorBox, pickAt, type Box, type Pick } from '../notes/anchor.js'
import { buildFrameHash, replaceFrameHash } from '../frame/frameRoute.js'
import { projectBase } from '../sync/project.js'
import { walkFrameSrc } from '../sync/walkthrough.js'
import type { NumberedNote } from './model.js'

// ---------------------------------------------------------------- measured heights

/** Content heights (unscaled CSS px) per round+width+screen+state, measured by whichever frame drew
 * it first — the step's own frame or a hidden probe — so a step shows its placeholder at the height
 * it will have. */
const heights = new Map<string, number>()
const listeners = new Set<() => void>()

export function heightKey(round: number | null, width: number, screen: string, state: string): string {
  return `${round ?? ''}|${width}|${screen}|${state}`
}

function setHeight(key: string, h: number): void {
  if (!(h > 0) || heights.get(key) === h) return
  heights.set(key, h)
  for (const l of listeners) l()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function useHeight(key: string): number | undefined {
  return useSyncExternalStore(
    subscribe,
    () => heights.get(key),
    () => heights.get(key),
  )
}

export function knownHeight(key: string): number | undefined {
  return heights.get(key)
}

/** The frame's own root, once its document has loaded. */
function frameRoot(frame: HTMLIFrameElement | null): { win: Window & typeof globalThis; root: HTMLElement } | null {
  const win = frame?.contentWindow as (Window & typeof globalThis) | null | undefined
  const root = win?.document.getElementById('root')
  return win && root ? { win, root } : null
}

function contentHeight(root: HTMLElement): number {
  return Math.ceil(root.getBoundingClientRect().height)
}

/** A picture that has not loaded yet has no height to measure. */
function settled(root: HTMLElement): boolean {
  const img = root.querySelector('img')
  return !img || img.complete
}

export function frameSrc(round: number | null, width: number, screen: string, state: string): string {
  return walkFrameSrc(projectBase(), { kind: 'screen', screen, state }, { round, width, fit: true })
}

// ---------------------------------------------------------------- the frame

const PIN = 26
const PIN_SMALL = 20

/** A pin in frame pixels (already scaled), plus the element's highlighter mark. */
type PinAt = { id: string; number: number; left: number; top: number; mark: Box | null }

export function ClientFrame({
  screen,
  state,
  round,
  width,
  title,
  notes,
  pickMode,
  picked,
  pulse,
  onPick,
  onPress,
  onPin,
}: {
  screen: string
  state: string
  round: number | null
  width: number
  title: string
  notes: NumberedNote[]
  pickMode: boolean
  picked: Pick | null
  pulse: { id: string; n: number } | null
  onPick: (pick: Pick) => void
  onPress: (to: string) => void
  onPin: (id: string) => void
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [outerW, setOuterW] = useState(0)
  const [load, setLoad] = useState(0)
  const [shown, setShown] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [hover, setHover] = useState<Box | null>(null)
  const [pins, setPins] = useState<PinAt[]>([])
  const expected = buildFrameHash({ kind: 'screen', screen, state })
  const drawn = shown === expected
  const key = heightKey(round, width, screen, state)
  const measured = useHeight(key)
  const lastHeight = useRef<number>(width < 600 ? 844 : 800)
  const height = measured ?? lastHeight.current
  useEffect(() => {
    if (measured) lastHeight.current = measured
  }, [measured])
  const scale = outerW > 0 ? outerW / width : 0
  // below 60% the frame is small enough that full-size pins would crowd its rows
  const small = scale > 0 && scale < 0.6
  const pin = small ? PIN_SMALL : PIN

  const pressRef = useRef(onPress)
  pressRef.current = onPress

  // The document is loaded once per round and width; a step change replaces its hash only.
  const src = useMemo(() => frameSrc(round, width, screen, state), [round, width])

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const measure = () => setOuterW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const f = frameRoot(frameRef.current)
    if (f && load) replaceFrameHash(f.win, { kind: 'screen', screen, state })
  }, [screen, state, load])

  useEffect(() => {
    const f = frameRoot(frameRef.current)
    if (!f) return
    const { win, root } = f
    setShown(root.getAttribute('data-shown'))
    const bump = () => setTick((t) => t + 1)
    const attrs = new win.MutationObserver(() => setShown(root.getAttribute('data-shown')))
    attrs.observe(root, { attributes: true, attributeFilter: ['data-shown'] })
    const ro = new win.ResizeObserver(bump)
    ro.observe(root)
    const onLoadCapture = (e: Event) => {
      if (e.target instanceof win.HTMLImageElement) bump()
    }
    win.document.addEventListener('load', onLoadCapture, true)
    // The control the story expects advances; no press ever moves anything else.
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof win.Element ? e.target.closest<HTMLElement>('[data-to]') : null
      if (!target) return
      e.preventDefault()
      e.stopPropagation()
      pressRef.current(target.dataset['to'] ?? '')
    }
    win.document.addEventListener('click', onClick, true)
    return () => {
      attrs.disconnect()
      ro.disconnect()
      win.document.removeEventListener('load', onLoadCapture, true)
      win.document.removeEventListener('click', onClick, true)
    }
  }, [load])

  // Measure the drawn screen, and place the pins on it.
  useLayoutEffect(() => {
    const f = frameRoot(frameRef.current)
    if (!f || !drawn) {
      setPins((p) => (p.length ? [] : p))
      return
    }
    if (settled(f.root)) setHeight(key, contentHeight(f.root))
    const next: PinAt[] = []
    for (const { note, number } of notes) {
      if (!note.anchor) continue
      const box = anchorBox(f.root, note.anchor)
      if (!box) continue
      // A note is a highlighter mark on the element, its numbered pin just outside the element's
      // top-left corner (so it never covers the words it is about); on a picture, the pin sits on
      // the picked point. Pins on the same spot line up side by side.
      const point = box.width === 0 && box.height === 0
      let left = point ? box.left * scale : box.left * scale - pin * 0.4
      const top = point ? box.top * scale : box.top * scale - pin * 0.3
      while (next.some((p) => Math.abs(p.left - left) < 1 && Math.abs(p.top - top) < 1)) left += pin + 2
      next.push({ id: note.id, number, left, top, mark: point ? null : { left: box.left * scale, top: box.top * scale, width: box.width * scale, height: box.height * scale } })
    }
    setPins((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [drawn, tick, notes, key, scale, pin])

  useEffect(() => {
    if (!pickMode) setHover(null)
  }, [pickMode])

  const toFrame = (e: { clientX: number; clientY: number }) => {
    const r = outerRef.current?.getBoundingClientRect()
    if (!r || !scale) return null
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }
  const pickUnder = (e: { clientX: number; clientY: number }): Pick | null => {
    const f = frameRoot(frameRef.current)
    const p = toFrame(e)
    if (!f || !p || !drawn) return null
    return pickAt(f.root, p.x, p.y)
  }
  const onPointer = (e: PointerEvent) => {
    const pick = pickUnder(e)
    const next = pick && pick.box.width > 0 ? pick.box : null
    setHover((prev) => (prev && next && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next))
  }

  const clamp = (v: number, max: number) => Math.min(Math.max(v, pin / 2 + 2), Math.max(pin / 2 + 2, max - pin / 2 - 2))
  const frameH = height * scale
  const scaled = (b: Box) => ({ left: b.left * scale, top: b.top * scale, width: b.width * scale, height: b.height * scale })

  return (
    <div ref={outerRef} className="cv-frame" style={{ height: frameH }} data-drawn={drawn}>
      <div className="cv-frame-inner" data-visible={drawn} style={{ width, height, transform: `scale(${scale})` }}>
        <iframe
          ref={frameRef}
          src={src}
          title={title}
          onLoad={() => setLoad((n) => n + 1)}
          tabIndex={pickMode ? -1 : 0}
          style={{ width, height }}
        />
      </div>

      {drawn && pins.map((p) => (p.mark ? <div key={`m${p.id}`} className="cv-mark" style={p.mark} /> : null))}
      {drawn &&
        pins.map((p) => (
          <button
            key={`${p.id}:${pulse?.id === p.id ? pulse.n : 0}`}
            type="button"
            data-pin={p.id}
            className={`cv-pin${small ? " is-small" : ""}${pulse?.id === p.id ? " is-pulsing" : ""}`}
            style={{ left: clamp(p.left, outerW), top: clamp(p.top, frameH) }}
            aria-label={`Note ${p.number}`}
            tabIndex={pickMode ? -1 : 0}
            onClick={() => onPin(p.id)}
          >
            {p.number}
          </button>
        ))}

      {drawn && picked && (picked.box.width > 0 ? <div className="cv-picked" style={scaled(picked.box)} /> : <div className="cv-picked-point" style={{ left: picked.box.left * scale, top: picked.box.top * scale }} />)}

      {pickMode && drawn && (
        <div
          className="cv-picklayer"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const pick = pickUnder(e)
            if (pick) onPick(pick)
          }}
        >
          {hover && <div className="cv-hover" style={scaled(hover)} />}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- small frames

/** How far outside the viewport a lazy small frame starts loading. */
const NEAR = '400px 0px'

/** A small, non-interactive frame: the top `width × height` of the screen, scaled to the box's
 * width (the whole story's storyboard; the stories page's strips, cropped to 4:3). Until the
 * screen is drawn the box is the slate placeholder at its final size. With `lazy`, the frame
 * document is not requested until the box comes near the viewport. */
export function Thumb({
  round,
  width,
  height,
  screen,
  state,
  lazy = false,
}: {
  round: number | null
  width: number
  height: number
  screen: string
  state: string
  lazy?: boolean
}) {
  const outer = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [w, setW] = useState(0)
  const [near, setNear] = useState(!lazy)
  const [load, setLoad] = useState(0)
  const [drawn, setDrawn] = useState(false)
  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const el = outer.current
    if (near || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: NEAR },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  useEffect(() => {
    const win = frame.current?.contentWindow as (Window & typeof globalThis) | null | undefined
    const root = win?.document.getElementById('root')
    if (!win || !root) return
    const hash = buildFrameHash({ kind: 'screen', screen, state })
    const check = () => setDrawn(root.getAttribute('data-shown') === hash)
    const mo = new win.MutationObserver(check)
    mo.observe(root, { attributes: true, attributeFilter: ['data-shown'] })
    check()
    return () => mo.disconnect()
  }, [load, screen, state])
  const scale = w / width
  return (
    <div ref={outer} className="cv-thumb" style={{ aspectRatio: `${width} / ${height}` }} data-near={near}>
      {near && (
        <iframe
          ref={frame}
          src={frameSrc(round, width, screen, state)}
          title=""
          aria-hidden
          tabIndex={-1}
          data-visible={drawn}
          onLoad={() => setLoad((n) => n + 1)}
          style={{ width, height, transform: `scale(${scale || 0})` }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- hidden probes

/** Measures, one at a time in hidden frames, the steps whose height is not known yet, so moving to
 * them shows the placeholder at the height the screen will have (no layout jump). */
export function HeightProbes({ round, width, targets }: { round: number | null; width: number; targets: { screen: string; state: string }[] }) {
  const known = useSyncExternalStore(
    subscribe,
    () => heights.size,
    () => heights.size,
  )
  void known
  const next = targets.find((t) => heights.get(heightKey(round, width, t.screen, t.state)) === undefined)
  if (!next) return null
  return <Probe key={heightKey(round, width, next.screen, next.state)} round={round} width={width} screen={next.screen} state={next.state} />
}

function Probe({ round, width, screen, state }: { round: number | null; width: number; screen: string; state: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [load, setLoad] = useState(0)
  useEffect(() => {
    const f = frameRoot(ref.current)
    if (!f) return
    const hash = buildFrameHash({ kind: 'screen', screen, state })
    const key = heightKey(round, width, screen, state)
    const check = () => {
      if (f.root.getAttribute('data-shown') !== hash || !settled(f.root)) return
      setHeight(key, contentHeight(f.root))
    }
    const mo = new f.win.MutationObserver(check)
    mo.observe(f.root, { attributes: true, childList: true, subtree: true })
    f.win.document.addEventListener('load', check, true)
    check()
    return () => {
      mo.disconnect()
      f.win.document.removeEventListener('load', check, true)
    }
  }, [load])
  return (
    <iframe
      ref={ref}
      className="cv-probe"
      src={frameSrc(round, width, screen, state)}
      title=""
      aria-hidden
      tabIndex={-1}
      style={{ width }}
      onLoad={() => setLoad((n) => n + 1)}
    />
  )
}
