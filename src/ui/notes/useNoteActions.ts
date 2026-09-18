// D5/D7: turns note/journey/approval intents into patches sent through `sync/api.ts`. Every
// mutation refetches `GET state` afterwards so the store always reflects the server's document —
// the store itself never writes files (Behavior section).
import { useCallback } from 'react'
import { ForbiddenError, RefusedError, fetchState, patchApproval, patchNotes } from '../sync/api.js'
import { getStore } from '../store/store.js'
import type { Note, ThreadEntry } from '../../schemas/index.js'
import type { Rect, Viewport } from './anchor.js'

async function refresh(): Promise<void> {
  const { seq, state } = await fetchState()
  getStore().setData(state, seq)
}

/** Every caller of these actions is a `void actions.x()` in `ScreenPage`, so before this wrapper a
 * refused write was an unhandled rejection: the server's sentence was discarded and the control
 * looked dead (a 403 on a client op, a 400 on a beatless confirm, a 409 on a stale story or an
 * unparseable design file). `run` turns every refusal into the one-line notice and every success
 * into clearing it, so no action can fail silently again.
 *
 * A 403 on a WRITE is not D24's dead token — `plugin.ts`'s op-level gate answers a bare 403 for
 * any op a client may never issue, with the token perfectly valid. Only `GET state` answering 403
 * means the link itself stopped working, and that case is handled where it is raised
 * (`reviewer.tsx`). Calling `setForbidden` here would replace the client's whole page with "this
 * review link is no longer valid" the first time they touched a control they don't have — worse
 * than the silent no-op it replaces. */
async function run<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  const store = getStore()
  try {
    const out = await fn()
    store.setNotice(null)
    return out
  } catch (e) {
    if (e instanceof ForbiddenError) {
      store.setNotice('This review link cannot make that change.')
      return fallback
    }
    store.setNotice(
      e instanceof RefusedError
        ? e.message
        : 'The reviewer server did not answer — check that `mock-review serve` is still running, then reload.',
    )
    return fallback
  }
}

export function useNoteActions() {
  const addNote = useCallback(
    async (
      note: Omit<Note, 'id' | 'status' | 'thread'> & { rect?: Rect; viewport?: Viewport; whole?: boolean },
      text: string,
      by: 'owner' | 'client' = 'owner',
    ): Promise<string> =>
      run(async () => {
        const doc = await patchNotes({
          op: 'add',
          note: { ...note, status: 'open', thread: [{ by, text }] } as Note,
        })
        await refresh()
        const last = doc.notes[doc.notes.length - 1]
        return last ? last.id : ''
      }, ''),
    [],
  )

  const replyNote = useCallback(async (id: string, text: string): Promise<void> => {
    await run(async () => {
      const store = getStore()
      const existing = store.getState().data?.notes.notes.find((n) => n.id === id)
      const thread: ThreadEntry[] = [...(existing?.thread ?? []), { by: 'owner', text }]
      await patchNotes({ op: 'update', id, fields: { status: 'open', thread } })
      await refresh()
    }, undefined)
  }, [])

  const approveNote = useCallback(async (id: string): Promise<void> => {
    await run(async () => {
      await patchNotes({ op: 'update', id, fields: { status: 'approved' } })
      await refresh()
    }, undefined)
  }, [])

  const removeNote = useCallback(async (id: string): Promise<void> => {
    await run(async () => {
      await patchNotes({ op: 'remove', id })
      await refresh()
    }, undefined)
  }, [])

  const reanchorNote = useCallback(
    async (id: string, fields: { screen: string; state: string; viewport: Viewport; component: string; key: string; rect: Rect; snippet: string }): Promise<void> => {
      await run(async () => {
        await patchNotes({ op: 'update', id, fields })
        await refresh()
      }, undefined)
    },
    [],
  )

  const replyJourney = useCallback(async (id: string, text: string, by: 'owner' | 'client' = 'owner'): Promise<void> => {
    await run(async () => {
      await patchNotes({ op: 'journey', id, entry: { by, text } })
      await refresh()
    }, undefined)
  }, [])

  // D9: approving a journey closes its conversation (blue tone, rule 33) only — the
  // `approveJourney` approval op is gone, and nothing renders `approvedAt` any more.
  const approveJourney = useCallback(async (id: string): Promise<void> => {
    await run(async () => {
      await patchNotes({ op: 'journey', id, status: 'approved' })
      await refresh()
    }, undefined)
  }, [])

  const approveScreen = useCallback(async (name: string): Promise<void> => {
    await run(async () => {
      await patchApproval({ op: 'approveScreen', name })
      await refresh()
    }, undefined)
  }, [])

  // D7: the confirm is If-Match on the story hash — `beats` is the hash the page was served
  // (`ServerJourney.beats`), echoed back verbatim so the server can tell a stale page from a
  // fresh one.
  const clientOk = useCallback(async (id: string, beats: string): Promise<void> => {
    await run(async () => {
      await patchApproval({ op: 'clientOk', id, beats })
      await refresh()
    }, undefined)
  }, [])

  const pickTheme = useCallback(async (key: string): Promise<void> => {
    await run(async () => {
      await patchApproval({ op: 'theme', key })
      await refresh()
    }, undefined)
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
