// The client view's writes. Each answers whether it went through, so the page can keep the reader's
// text and say so in place (docs/design/client-view.md §6) instead of a technical notice. After a
// write the state is fetched again, so numbers, pins and statuses come from the server.
import { fetchState, patchApproval, patchNotes } from '../sync/api.js'
import { getStore } from '../store/store.js'
import type { WalkAnchor } from '../notes/anchor.js'

async function refresh(): Promise<void> {
  const { seq, state } = await fetchState()
  getStore().setData(state, seq)
}

async function attempt(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
  } catch {
    return false
  }
  try {
    await refresh()
  } catch {
    // the write went through; the next server event refetches
  }
  return true
}

export function addNote(note: { screen: string; state: string; anchor: WalkAnchor | null; pickedText: string | null; text: string }): Promise<boolean> {
  const node = note.anchor && 'node' in note.anchor ? note.anchor : null
  return attempt(() =>
    patchNotes({
      op: 'add',
      note: {
        screen: note.screen,
        state: note.state,
        component: node ? node.node : '__screen',
        key: node ? String(node.index ?? 0) : '0',
        snippet: note.pickedText,
        status: 'open',
        // the server writes the author from the link (always `client` here)
        thread: [{ by: 'client', text: note.text }],
        anchor: note.anchor,
        pickedText: note.pickedText,
      },
    }),
  )
}

export function reply(id: string, text: string): Promise<boolean> {
  return attempt(() => patchNotes({ op: 'reply', id, entry: { by: 'owner', text } }))
}

/** "Looks right": the reader closes their own note as done (`close → approved`). */
export function looksRight(id: string): Promise<boolean> {
  return attempt(() => patchNotes({ op: 'close', id, status: 'approved' }))
}

export function confirmStory(journey: string, beats: string): Promise<boolean> {
  return attempt(() => patchApproval({ op: 'clientOk', id: journey, beats }))
}
