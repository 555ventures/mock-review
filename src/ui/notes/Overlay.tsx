// Reference §4: note pins, the "Add a note" pick layer and the picked element. Presentational:
// every box is already resolved into frame-viewport pixels by the caller
// (`frame/DeviceFrames.tsx`), which also turns pointer events into frame coordinates (it knows the
// wrapper's scale). Pick mode is the client view's (docs/design/client-view.md §2): the element
// under the pointer gets a 2 px highlighter outline with a 4 px highlighter/30% halo, and one
// click picks it; on a picture one click picks that point.
import type { MouseEvent, PointerEvent, WheelEvent } from 'react'
import { TONE, NotePin } from './notes-ui.js'
import type { Box, UiNote } from './anchor.js'

export type VisibleNote = { note: UiNote; box: Box | null }

/** The highlighter outline + halo (client-view.md §2), shared with the client view's CSS. */
export const PICK_OUTLINE = '0 0 0 2px #FFD84A, 0 0 0 6px rgba(255, 216, 74, 0.3)'

function isPoint(box: Box): boolean {
  return box.width === 0 && box.height === 0
}

export function Overlay({
  visible,
  marking,
  hover,
  picked,
  onSelect,
  onOpenDraft,
  onPointerMove,
  onPointerLeave,
  onClick,
  onWheel,
}: {
  visible: VisibleNote[]
  marking: boolean
  hover: Box | null
  picked: Box | null
  onSelect: (id: string) => void
  onOpenDraft: () => void
  onPointerMove: (e: PointerEvent) => void
  onPointerLeave: () => void
  onClick: (e: MouseEvent) => void
  onWheel: (e: WheelEvent) => void
}) {
  return (
    <>
      {visible.map(({ note, box }) => {
        if (!box) return null
        const t = TONE[note.status]
        const point = isPoint(box)
        return (
          <div
            key={note.id}
            data-note={note.id}
            className={`pointer-events-none absolute z-20 ${point ? '' : `rounded-sm border-2 ${t.box}`}`}
            style={box}
          >
            <button
              type="button"
              aria-label={`Open note ${note.id}`}
              onClick={() => onSelect(note.id)}
              className={`absolute cursor-pointer ${point ? '-translate-x-1/2 -translate-y-1/2' : '-top-2.5 -left-2.5'} ${marking ? 'pointer-events-none' : 'pointer-events-auto'}`}
            >
              <NotePin tone={note.status}>{note.id}</NotePin>
            </button>
          </div>
        )
      })}

      {picked && (
        <div
          data-draft
          className="pointer-events-auto absolute z-30 cursor-pointer rounded-sm"
          style={isPoint(picked) ? { ...picked, width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: 999, background: '#FFD84A', boxShadow: PICK_OUTLINE } : { ...picked, boxShadow: PICK_OUTLINE }}
          onClick={onOpenDraft}
        />
      )}

      {marking && (
        <div
          data-pick-layer
          className="absolute inset-0 z-25 cursor-pointer"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
          onWheel={onWheel}
        >
          {hover && <div className="pointer-events-none absolute rounded-sm" style={{ ...hover, boxShadow: PICK_OUTLINE }} />}
        </div>
      )}
    </>
  )
}
