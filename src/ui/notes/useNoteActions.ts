// D5/D7: turns note/journey/approval intents into patches sent through `sync/api.ts`. Every
// mutation refetches `GET state` afterwards so the store always reflects the server's document —
// the store itself never writes files (Behavior section).
import { useCallback } from 'react'
import { fetchState, patchApproval, patchNotes } from '../sync/api.js'
import { getStore } from '../store/store.js'
import type { Note, ThreadEntry } from '../../schemas/index.js'
import type { Rect, Viewport } from './anchor.js'

async function refresh(): Promise<void> {
  const { seq, state } = await fetchState()
  getStore().setData(state, seq)
}

export function useNoteActions() {
  const addNote = useCallback(
    async (
      note: Omit<Note, 'id' | 'status' | 'thread'> & { rect?: Rect; viewport?: Viewport; whole?: boolean },
      text: string,
      by: 'owner' | 'client' = 'owner',
    ): Promise<string> => {
      const doc = await patchNotes({
        op: 'add',
        note: { ...note, status: 'open', thread: [{ by, text }] } as Note,
      })
      await refresh()
      const last = doc.notes[doc.notes.length - 1]
      return last ? last.id : ''
    },
    [],
  )

  const replyNote = useCallback(async (id: string, text: string): Promise<void> => {
    const store = getStore()
    const existing = store.getState().data?.notes.notes.find((n) => n.id === id)
    const thread: ThreadEntry[] = [...(existing?.thread ?? []), { by: 'owner', text }]
    await patchNotes({ op: 'update', id, fields: { status: 'open', thread } })
    await refresh()
  }, [])

  const approveNote = useCallback(async (id: string): Promise<void> => {
    await patchNotes({ op: 'update', id, fields: { status: 'approved' } })
    await refresh()
  }, [])

  const removeNote = useCallback(async (id: string): Promise<void> => {
    await patchNotes({ op: 'remove', id })
    await refresh()
  }, [])

  const reanchorNote = useCallback(
    async (id: string, fields: { screen: string; state: string; viewport: Viewport; component: string; key: string; rect: Rect; snippet: string }): Promise<void> => {
      await patchNotes({ op: 'update', id, fields })
      await refresh()
    },
    [],
  )

  const replyJourney = useCallback(async (id: string, text: string, by: 'owner' | 'client' = 'owner'): Promise<void> => {
    await patchNotes({ op: 'journey', id, entry: { by, text } })
    await refresh()
  }, [])

  // D7: approving a journey both closes its conversation (blue tone, rule 33) and writes
  // `approval.journeys[id].approvedAt` — the key the plugin's `--mark journey-approved` reads.
  const approveJourney = useCallback(async (id: string): Promise<void> => {
    await patchNotes({ op: 'journey', id, status: 'approved' })
    await patchApproval({ op: 'approveJourney', id })
    await refresh()
  }, [])

  const approveScreen = useCallback(async (name: string): Promise<void> => {
    await patchApproval({ op: 'approveScreen', name })
    await refresh()
  }, [])

  const clientOk = useCallback(async (id: string): Promise<void> => {
    await patchApproval({ op: 'clientOk', id })
    await refresh()
  }, [])

  const pickTheme = useCallback(async (key: string): Promise<void> => {
    await patchApproval({ op: 'theme', key })
    await refresh()
  }, [])

  return {
    addNote,
    replyNote,
    approveNote,
    removeNote,
    reanchorNote,
    replyJourney,
    approveJourney,
    approveScreen,
    clientOk,
    pickTheme,
  }
}
