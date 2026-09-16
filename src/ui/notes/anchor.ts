// Reference rule 11-12: anchoring a drawn box to the smallest `[data-component]` element that
// fully contains it (6px tolerance), falling back to the component under its centre, then the
// screen anchor. D5: the note's `key` is that component's nth-index among same-named components
// (as a string), and `rect` is a fraction of the anchor element's box, stored as a passthrough
// extra (never read by the plugin).
import type { Note } from '../../schemas/index.js'

export const SCREEN_ANCHOR = '__screen'

export type Box = { left: number; top: number; width: number; height: number }
export type Rect = { x: number; y: number; w: number; h: number }
export type Viewport = 'desktop' | 'mobile'

/** D5: `Note` plus the passthrough extras the page owns (`rect`, `viewport`, `whole`) — never
 * redeclares the schema, just types the extras `.passthrough()` allows through at runtime. */
export type UiNote = Note & { rect?: Rect; viewport?: Viewport; whole?: boolean }

export function rectOf(note: UiNote): Rect {
  return note.rect ?? { x: 0, y: 0, w: 1, h: 1 }
}

export type Anchor = {
  component: string
  key: string
  rect: Rect
  snippet: string
}

/** The smallest `[data-component]` element fully containing `box` (6px tolerance); failing that,
 * the component under the box's centre; failing that, the screen anchor. */
export function anchorFor(root: HTMLElement, box: Box): Anchor {
  const abs = { l: box.left, t: box.top, r: box.left + box.width, b: box.top + box.height }
  const tol = 6
  let best: HTMLElement = root
  let bestArea = Infinity
  root.querySelectorAll<HTMLElement>('[data-component]').forEach((el) => {
    const r = el.getBoundingClientRect()
    const contains = r.left - tol <= abs.l && r.top - tol <= abs.t && r.right + tol >= abs.r && r.bottom + tol >= abs.b
    if (contains && r.width * r.height < bestArea) {
      best = el
      bestArea = r.width * r.height
    }
  })
  if (best === root) {
    const hit = root.ownerDocument
      .elementsFromPoint((abs.l + abs.r) / 2, (abs.t + abs.b) / 2)
      .find((e) => root.contains(e))
      ?.closest<HTMLElement>('[data-component]')
    if (hit && root.contains(hit)) best = hit
  }

  const component = best === root ? SCREEN_ANCHOR : (best.dataset['component'] ?? SCREEN_ANCHOR)
  const key = best === root ? '0' : String([...root.querySelectorAll(`[data-component="${component}"]`)].indexOf(best))
  const r = best.getBoundingClientRect()
  const rect: Rect =
    r.width > 0 && r.height > 0
      ? { x: (abs.l - r.left) / r.width, y: (abs.t - r.top) / r.height, w: box.width / r.width, h: box.height / r.height }
      : { x: 0, y: 0, w: 1, h: 1 }

  return {
    component,
    key,
    rect,
    snippet: (best.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  }
}

/** The anchored element, or `null` when the note is outdated (its component/key no longer
 * resolves, or its snippet no longer appears in that element's text). */
export function anchorEl(root: HTMLElement, component: string | null, key: string | null, snippet: string | null): HTMLElement | null {
  const el =
    component === SCREEN_ANCHOR || component === null
      ? root
      : (root.querySelectorAll<HTMLElement>(`[data-component="${component}"]`)[Number(key ?? '0')] ?? null)
  if (!el) return null
  if (snippet && !(el.innerText || '').replace(/\s+/g, ' ').trim().includes(snippet)) return null
  return el
}

/** The note's box, resolved against its own `rect` fraction of the anchor element. */
export function resolveBox(root: HTMLElement, component: string | null, key: string | null, snippet: string | null, rect: Rect): Box | null {
  const el = anchorEl(root, component, key, snippet)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left + rect.x * r.width, top: r.top + rect.y * r.height, width: rect.w * r.width, height: rect.h * r.height }
}

/** The whole anchored component's box — used for a ghost pin in the *other* device. */
export function resolveGhost(root: HTMLElement, component: string | null, key: string | null, snippet: string | null): Box | null {
  const el = anchorEl(root, component, key, snippet)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** Rule 12: a note is outdated when its box cannot be resolved. */
export function isOutdated(root: HTMLElement, component: string | null, key: string | null, snippet: string | null, rect: Rect): boolean {
  return resolveBox(root, component, key, snippet, rect) === null
}
