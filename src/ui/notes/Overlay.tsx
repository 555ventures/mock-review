// Reference §4: note pins, ghosts, the draft box and the marking overlay. Presentational: every
// box is already resolved into CSS pixels (frame-viewport coordinates) by the caller
// (`frame/DeviceFrames.tsx`), which also owns pointer-event geometry (it knows the wrapper's scale).
import type { PointerEvent, WheelEvent } from 'react'
import { TONE, NotePin } from './notes-ui.js'
import { SCREEN_ANCHOR, type Box, type UiNote, type Viewport } from './anchor.js'

export type VisibleNote = { note: UiNote; box: Box | null; ownDevice: boolean }

export function Overlay({
  viewport: _viewport,
  visible,
  marking,
  drag,
  draft,
  onSelect,
  onOpenDraft,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
}: {
  viewport: Viewport
  visible: VisibleNote[]
  marking: boolean
  drag: Box | null
  draft: Box | null
  onSelect: (id: string) => void
  onOpenDraft: () => void
  onPointerDown: (e: PointerEvent) => void
  onPointerMove: (e: PointerEvent) => void
  onPointerUp: (e: PointerEvent) => void
  onWheel: (e: WheelEvent) => void
}) {
  return (
    <>
      {visible.map(({ note, box, ownDevice }) => {
        if (!box || note.whole) return null
        if (!ownDevice) {
          return note.component === SCREEN_ANCHOR ? null : (
            <div
              key={note.id}
              data-ghost={note.id}
              className="pointer-events-none absolute z-10 rounded-sm border-2 border-dashed border-muted-foreground/20"
              style={box}
            />
          )
        }
        const t = TONE[note.status]
        return (
          <div key={note.id} data-note={note.id} className={`pointer-events-none absolute z-20 rounded-sm border-2 ${t.box}`} style={box}>
            <button
              type="button"
              aria-label={`Open note ${note.id}`}
              onClick={() => onSelect(note.id)}
              className={`absolute -top-2.5 -left-2.5 cursor-pointer ${marking ? 'pointer-events-none' : 'pointer-events-auto'}`}
            >
              <NotePin tone={note.status}>{note.id}</NotePin>
            </button>
          </div>
        )
      })}

      {draft && (
        <div
          data-draft
          className={`pointer-events-auto absolute z-30 cursor-pointer rounded-sm border-2 ${TONE.draft.box}`}
          style={draft}
          onClick={onOpenDraft}
        >
          <NotePin tone="draft" floating>
            draft
          </NotePin>
        </div>
      )}

      {marking && (
        <div
          className="absolute inset-0 z-25 cursor-crosshair bg-foreground/[0.03]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          {drag && <div className="absolute rounded-sm border-2 border-dashed border-foreground" style={drag} />}
        </div>
      )}
    </>
  )
}
