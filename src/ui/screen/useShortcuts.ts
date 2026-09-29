// Reference §12: keyboard shortcuts scoped to screen mode. N (a note on the whole screen) is
// suppressed with a modifier held, while focus is in an input/textarea/contenteditable/dialog, and
// entirely in journey mode. Escape leaves "Add a note" pick mode. (The old M shortcut for drawing
// an area is gone with the drag gesture.)
import { useEffect } from 'react'

export function useShortcuts({
  marking,
  draftOpen,
  journey,
  onEscape,
  onNewNote,
}: {
  marking: boolean
  draftOpen: boolean
  journey: boolean
  onEscape: () => void
  onNewNote: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && marking && !draftOpen) {
        onEscape()
        return
      }
      const t = e.target as HTMLElement | null
      if (journey || e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, [contenteditable], [role=dialog]')) return
      if (e.key === 'n' || e.key === 'N') {
        onNewNote()
        e.preventDefault()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [marking, draftOpen, journey, onEscape, onNewNote])
}
