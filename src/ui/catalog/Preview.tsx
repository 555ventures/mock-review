// Reference §10 preview mechanics: an iframe at `/?frame=1#/__component?name=&example=`. A shell
// gets a fixed device box (1440x900) scaled to the pane width; a normal component gets the pane
// width and auto-height tracked from the frame's `#root`.
import { useEffect, useRef, useState } from 'react'
import { frameSrc } from '../frame/frameRoute.js'

const SHELL_W = 1440
const SHELL_H = 900

export function Preview({ name, example, shell, theme }: { name: string; example: string; shell: boolean; theme: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [paneW, setPaneW] = useState(0)
  const [h, setH] = useState(120)
  const [load, setLoad] = useState(0)

  // Both observers below only call `setState` when the rounded value actually changed (the same
  // fix as `frame/useMeasure.ts`) — an unconditional `setState` on every ResizeObserver callback
  // reproduces a measure -> render -> resize -> measure cycle that trips React's "Maximum update
  // depth exceeded" guard under load.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setPaneW((prev) => (prev === w ? prev : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const win = frameRef.current?.contentWindow as (Window & typeof globalThis) | null | undefined
    const root = win?.document.getElementById('root')
    if (!win || !root || shell || !load) return
    const ro = new win.ResizeObserver(() => {
      const next = Math.ceil(root.getBoundingClientRect().height)
      setH((prev) => (prev === next ? prev : next))
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [load, shell])

  const src = frameSrc({ kind: 'component', name, example }, theme)
  const scale = shell && paneW ? Math.min(1, paneW / SHELL_W) : 1

  return (
    <div ref={boxRef} className="w-full overflow-hidden">
      {shell ? (
        <div className="relative overflow-hidden" style={{ width: SHELL_W * scale, height: SHELL_H * scale }}>
          <iframe
            ref={frameRef}
            key={src}
            src={src}
            title={`${name} preview`}
            onLoad={() => setLoad((n) => n + 1)}
            className="absolute top-0 left-0 block border-0"
            style={{ width: SHELL_W, height: SHELL_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
        </div>
      ) : (
        <iframe
          ref={frameRef}
          key={src}
          src={src}
          title={`${name} preview`}
          onLoad={() => setLoad((n) => n + 1)}
          className="block border-0"
          style={{ width: paneW || '100%', height: h }}
        />
      )}
    </div>
  )
}
