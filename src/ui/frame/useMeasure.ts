// Reference §3/rule 17: measures the workspace's content-box width and the window height so
// devices can be scaled to fit, re-measuring on resize and content resize.
import { useEffect, useRef, useState, type RefObject } from 'react'

export type Avail = { w: number; h: number }

export function useMeasure(): { ref: RefObject<HTMLDivElement | null>; avail: Avail } {
  const ref = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState<Avail>({ w: 1440, h: 900 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const top = Math.max(0, el.getBoundingClientRect().top + scrollY)
      // Rounded so sub-pixel layout jitter (fractional `clientWidth`/`getBoundingClientRect`
      // values that differ by less than a pixel between two otherwise-identical layout passes)
      // never reads as "changed". The scaled device content below never grows `el` itself (it
      // fits to `avail`, D9), but a ResizeObserver firing on every fractional wobble and setting
      // a brand-new `{w,h}` object each time — even when nothing visibly moved — reproduces a
      // measure -> render -> resize -> measure cycle that trips React's "Maximum update depth
      // exceeded" guard under CPU load (confirmed by direct reproduction: six concurrent pages,
      // zero interaction, tripped it on every run before this fix). Returning the *same* `avail`
      // reference when nothing changed makes `setState` a no-op (React bails out on `Object.is`
      // equality), which breaks the cycle at its root instead of just slowing it down.
      const w = Math.round(el.clientWidth - padX)
      const h = Math.round(innerHeight - top - padY)
      setAvail((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    addEventListener('resize', measure)
    measure()
    return () => {
      ro.disconnect()
      removeEventListener('resize', measure)
    }
  }, [])

  return { ref, avail }
}
