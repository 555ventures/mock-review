// Reference rule 11-12: anchoring a drawn box to the smallest `[data-component]` element that
// fully contains it (6px tolerance), falling back to the component under its centre, then the
// screen anchor. D5: the note's `key` is that component's nth-index among same-named components
// (as a string), and `rect` is a fraction of the anchor element's box, stored as a passthrough
// extra (never read by the plugin).
import type { Note } from '../../schemas/index.js'

export const SCREEN_ANCHOR = '__screen'
/** U3: the `data-component` of a screenshot round's picture (`frame/mount.tsx`). */
export const PICTURE_ANCHOR = '__picture'

export type Box = { left: number; top: number; width: number; height: number }
export type Rect = { x: number; y: number; w: number; h: number }
export type Viewport = 'desktop' | 'mobile'

/** PROTOTYPE-PLAN.md seam A, the one note model: a wireframe note names the node it landed on
 * (`rect` null = the whole node, `index` = the row of a repeated node); a screenshot note is a
 * fraction of the picture plus that picture's width. `null` = a whole-screen or project note. */
export type WireAnchor = { node: string | null; index: number | null; rect: Rect | null; viewport: Viewport }
export type PictureAnchor = { x: number; y: number; w: number | null; h: number | null; width: number }
export type WalkAnchor = WireAnchor | PictureAnchor

/** D5: `Note` plus the passthrough extras the page owns (`rect`, `viewport`, `whole`, and the
 * walkthrough's `anchor`) — never redeclares the schema, just types the extras `.passthrough()`
 * allows through at runtime. */
export type UiNote = Note & { rect?: Rect; viewport?: Viewport; whole?: boolean; anchor?: WalkAnchor | null }

function isPicture(a: WalkAnchor): a is PictureAnchor {
  return 'width' in a
}

/** U3: a plain click in marking mode selects the whole node under it — the anchor is that
 * element itself (rect = its full box), found the same way `anchorFor` finds one. */
export function anchorForElement(root: HTMLElement, el: HTMLElement): Anchor {
  const component = el.dataset['component'] ?? SCREEN_ANCHOR
  const key = String([...root.querySelectorAll(`[data-component="${CSS.escape(component)}"]`)].indexOf(el))
  return { component, key, rect: { x: 0, y: 0, w: 1, h: 1 }, snippet: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80) }
}

/** The `[data-component]` element under a point of the frame's viewport, or null. */
export function elementAt(root: HTMLElement, x: number, y: number): HTMLElement | null {
  const hit = root.ownerDocument
    .elementsFromPoint(x, y)
    .find((e) => root.contains(e))
    ?.closest<HTMLElement>('[data-component]')
  return hit && root.contains(hit) ? hit : null
}

/** Seam A's `anchor` for a resolved `Anchor`. `wholeNode` = picked by a click (rect null). */
export function toWalkAnchor(
  root: HTMLElement,
  a: Anchor,
  opts: { kind: 'wireframe' | 'screenshots'; viewport: Viewport; width: number; wholeNode?: boolean },
): WalkAnchor {
  if (opts.kind === 'screenshots') {
    // seam A bounds a picture anchor to 0..1; a box drawn past the picture's edge is clipped to it.
    const c = (n: number) => Math.min(1, Math.max(0, n))
    const x = c(a.rect.x)
    const y = c(a.rect.y)
    const w = a.rect.w > 0 ? c(Math.min(a.rect.w, 1 - x)) : null
    const h = a.rect.h > 0 ? c(Math.min(a.rect.h, 1 - y)) : null
    return { x, y, w: w || null, h: h || null, width: Math.round(opts.width) }
  }
  const el =
    a.component === SCREEN_ANCHOR
      ? null
      : (root.querySelectorAll<HTMLElement>(`[data-component="${CSS.escape(a.component)}"]`)[Number(a.key)] ?? null)
  const index = el && el.hasAttribute('data-index') ? Number(a.key) : null
  const node = a.component === SCREEN_ANCHOR ? null : a.component
  return { node, index, rect: opts.wholeNode ? null : a.rect, viewport: opts.viewport }
}

/** Reads a served note back into the page's own fields from its `anchor`, whatever the server
 * filled in for `component`/`key`/`rect`/`viewport` (seam B maps only `component` and `key`).
 * A note without an `anchor` key (the old shape) is returned untouched. */
export function fromWalkAnchor(note: UiNote, viewportOfWidth: (width: number) => Viewport): UiNote {
  if (!('anchor' in note) || note.anchor === undefined) return note
  const a = note.anchor
  if (a === null) return note.project || note.whole ? note : { ...note, whole: true }
  if (isPicture(a)) {
    return {
      ...note,
      component: PICTURE_ANCHOR,
      key: '0',
      snippet: null,
      rect: { x: a.x, y: a.y, w: a.w ?? 0, h: a.h ?? 0 },
      viewport: viewportOfWidth(a.width),
    }
  }
  return {
    ...note,
    component: a.node ?? SCREEN_ANCHOR,
    key: String(a.index ?? 0),
    // The node key is the identity now: a reworded sentence in a new round keeps the pin (plan
    // acceptance 5), so the old snippet staleness test is not applied to a wireframe anchor.
    snippet: null,
    rect: a.rect ?? { x: 0, y: 0, w: 1, h: 1 },
    viewport: a.viewport,
  }
}

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
