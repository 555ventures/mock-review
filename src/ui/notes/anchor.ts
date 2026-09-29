// A note is placed by picking (docs/design/client-view.md §2): one tap or click on an element of a
// wireframe (`[data-node]`, plus the row number of a repeated element), or one point on a picture.
// There is no drawn area. This module is shared by the owner's reviewer and the client view: it
// finds what is under a point of the frame, turns it into the served anchor and the reader's words
// for it (`pickedText`), and resolves a served anchor back to a box on the frame.
import type { Note } from '../../schemas/index.js'

export const SCREEN_ANCHOR = '__screen'
/** The `data-component` of a screenshots round's picture (`frame/mount.tsx`). */
export const PICTURE_ANCHOR = '__picture'

export type Box = { left: number; top: number; width: number; height: number }
export type Viewport = 'desktop' | 'mobile'

/** Seam A as amended by the design: `{node, index}` on a wireframe (`index` = which occurrence of a
 * repeated node, null when the node occurs once), `{x, y, width}` on a picture (fractions of the
 * picture plus its pixel width). `null` = the whole screen (or a project note). */
export type WireAnchor = { node: string; index: number | null }
export type PictureAnchor = { x: number; y: number; width: number }
export type WalkAnchor = WireAnchor | PictureAnchor

/** A served note: `Note` plus the walkthrough fields the page reads. */
export type UiNote = Note & { anchor?: WalkAnchor | null; pickedText?: string | null; whole?: boolean; round?: number; at?: string }

export function isPictureAnchor(a: WalkAnchor): a is PictureAnchor {
  return 'width' in a
}

export const PICKED_MAX = 40

/** The reader's words for a picked element: its visible text, whitespace collapsed, at most 40
 * characters (the last an ellipsis when cut). Same rule as the server's `shortenPicked`. */
export function shortenPicked(text: string | null | undefined): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length <= PICKED_MAX ? t : `${t.slice(0, PICKED_MAX - 1).trimEnd()}…`
}

function visibleText(el: HTMLElement): string | null {
  return (
    shortenPicked(el.innerText) ??
    shortenPicked(el.getAttribute('aria-label')) ??
    shortenPicked(el.getAttribute('title')) ??
    shortenPicked(el.getAttribute('placeholder'))
  )
}

function nodesNamed(root: HTMLElement, node: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-node="${CSS.escape(node)}"]`)]
}

function picture(root: HTMLElement): HTMLImageElement | null {
  return root.querySelector<HTMLImageElement>(`img[data-component="${PICTURE_ANCHOR}"]`)
}

function rectBox(r: DOMRect): Box {
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export type Pick = { anchor: WalkAnchor | null; pickedText: string | null; box: Box }

/** What a tap/click at (x, y) of the frame's viewport picks, or null when it hit nothing of the
 * screen. The outermost node of the spec (the page itself) means the whole screen. */
export function pickAt(root: HTMLElement, x: number, y: number): Pick | null {
  const img = picture(root)
  if (img) {
    const r = img.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) return null
    const width = img.naturalWidth || Math.round(r.width)
    return {
      anchor: { x: (x - r.left) / r.width, y: (y - r.top) / r.height, width },
      pickedText: null,
      box: { left: x, top: y, width: 0, height: 0 },
    }
  }
  const hit = root.ownerDocument
    .elementsFromPoint(x, y)
    .find((e) => root.contains(e))
    ?.closest<HTMLElement>('[data-node]')
  if (!hit || !root.contains(hit)) return null
  const box = rectBox(hit.getBoundingClientRect())
  const outermost = !hit.parentElement?.closest('[data-node]')
  if (outermost) return { anchor: null, pickedText: null, box }
  const node = hit.dataset['node'] ?? ''
  const all = nodesNamed(root, node)
  return { anchor: { node, index: all.length > 1 ? Math.max(0, all.indexOf(hit)) : null }, pickedText: visibleText(hit), box }
}

/** The element a wireframe anchor names, or null when this screen no longer has it. */
export function anchorElement(root: HTMLElement, a: WireAnchor): HTMLElement | null {
  return nodesNamed(root, a.node)[a.index ?? 0] ?? null
}

/** Where a served anchor sits on the frame (frame-viewport pixels): the named element's box, or a
 * zero-size box at the picked point of the picture. Null when it cannot be placed on this frame
 * (the element is gone, or the picture is a different width). */
export function anchorBox(root: HTMLElement, a: WalkAnchor): Box | null {
  if (isPictureAnchor(a)) {
    const img = picture(root)
    if (!img) return null
    const width = img.naturalWidth || 0
    if (width && Math.abs(width - a.width) > 1) return null
    const r = img.getBoundingClientRect()
    if (r.width === 0) return null
    return { left: r.left + a.x * r.width, top: r.top + a.y * r.height, width: 0, height: 0 }
  }
  const el = anchorElement(root, a)
  return el ? rectBox(el.getBoundingClientRect()) : null
}

/** A served note with `whole` derived from its anchor (a screen note with no anchor is about the
 * whole screen) — what the pins and lists filter on. */
export function servedNote(n: UiNote): UiNote {
  const whole = !n.project && n.screen !== null && (n.anchor === null || n.anchor === undefined)
  return whole === !!n.whole ? n : { ...n, whole }
}

/** The new-note sheet's first line (client-view.md §2): "About “Ren” on this screen", "About this
 * screen" when nothing was picked, "About this spot" on a picture. */
export function sheetTitle(pick: Pick | null | undefined): string {
  const anchor = pick?.anchor ?? null
  if (!anchor) return 'About this screen'
  if (isPictureAnchor(anchor)) return 'About this spot'
  return pick?.pickedText ? `About “${pick.pickedText}” on this screen` : 'About this part of the screen'
}

/** "About “Ren”" — the reader's label for a note; never an element name. */
export function aboutLabel(n: Pick | UiNote): string {
  const anchor = n.anchor ?? null
  if (anchor && isPictureAnchor(anchor)) return 'About this spot'
  const picked = n.pickedText ?? null
  if (anchor && picked) return `About “${picked}”`
  // A picked element with no words of its own (a picture box, a divider).
  if (anchor) return 'About this part'
  return 'About this screen'
}
