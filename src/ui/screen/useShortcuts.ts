// Reference §12: keyboard shortcuts scoped to screen mode. M/N are suppressed with a modifier
// held, while focus is in an input/textarea/contenteditable/dialog, and entirely in journey mode.
import { useEffect } from 'react'

export function useShortcuts({
  marking,
  draftOpen,
  journey,
  onToggleMark,
  onEscape,
  onNewNote,
}: {
  marking: boolean
  draftOpen: boolean
  journey: boolean
  onToggleMark: () => void
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
      if (e.key === 'm' || e.key === 'M') {
        onToggleMark()
        e.preventDefault()
      } else if (e.key === 'n' || e.key === 'N') {
        onNewNote()
        e.preventDefault()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [marking, draftOpen, journey, onToggleMark, onEscape, onNewNote])
}
