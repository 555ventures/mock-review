// Reference §8.1/D11: journey mode's right panel. A journey is not noted — it has one
// conversation and one status. D11: the client role gets "Confirm journey" instead of the owner's
// Reply/Approve conversation controls.
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js'
import { Button } from '../components/ui/button.js'
import { Field } from '../components/ui/field.js'
import { Label } from '../components/ui/label.js'
import { Textarea } from '../components/ui/textarea.js'
import { NoteThread } from '../notes/notes-ui.js'
import type { ThreadEntry } from '../../schemas/index.js'
import type { Tone } from '../store/selectors.js'
import { Check } from 'lucide-react'

/** `29 Sep` from an ISO timestamp; the raw text when it does not parse. */
function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const NO_BEATS = 'This story has no sentences yet, so there is nothing to confirm — every step needs a beat first.'

export function JourneyPanel({
  title,
  thread,
  tone,
  role,
  beats,
  onReply,
  onApprove,
  onConfirm,
  confirmed = null,
}: {
  title: string
  thread: ThreadEntry[]
  tone: Tone | null
  role: 'owner' | 'client'
  /** The story hash the page was served, or `null` when the host's journey has no `beat:` lines.
   * The confirm is If-Match on this hash, so a null one is refused 400 by the server — which the
   * client used to experience as a button that did nothing. Disable it and say why instead. */
  beats: string | null
  onReply: (text: string) => void
  onApprove: () => void
  onConfirm: () => void
  /** U4: the client's standing confirmation, `stale` once the story changed after it. */
  confirmed?: { at: string | null; stale: boolean } | null
}) {
  const fresh = confirmed && !confirmed.stale ? confirmed : null
  const when = fresh?.at ? ` · ${shortDate(fresh.at)}` : ''
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {thread.length ? <NoteThread entries={thread} viewerRole={role} /> : <p className="text-sm text-muted-foreground">No feedback yet.</p>}
      </div>
      <form
        className="flex flex-col gap-3 border-t border-sidebar-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          onReply(text.trim())
          setText('')
        }}
      >
        <Field>
          <Label htmlFor="journey-reply">Reply</Label>
          <Textarea id="journey-reply" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          {role === 'client' && fresh ? (
            // U4: the confirm is now visible — a settled, non-interactive button (not `disabled`, which
            // would fade it like an unavailable control).
            <Button type="button" variant="outline" aria-disabled data-confirmed className="pointer-events-none">
              <Check /> Confirmed{when}
            </Button>
          ) : role === 'client' ? (
            <Button type="button" disabled={beats === null} title={beats === null ? NO_BEATS : undefined} onClick={() => setConfirm(true)}>
              Confirm journey
            </Button>
          ) : (
            tone === 'answered' && (
              <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
                Approve
              </Button>
            )
          )}
          <Button type="submit" disabled={!text.trim()}>
            Reply
          </Button>
        </div>
        {role === 'client' && beats === null && <p className="text-xs text-muted-foreground">{NO_BEATS}</p>}
        {confirmed?.stale && (
          <p data-confirmed-stale className="text-xs text-muted-foreground">
            {role === 'client' ? 'The story changed since you confirmed it.' : 'The story changed since the client confirmed it.'}
          </p>
        )}
        {role === 'owner' && fresh && (
          <p data-confirmed className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" /> Confirmed by the client{when}
          </p>
        )}
      </form>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{role === 'client' ? `Confirm ${title}?` : `Approve ${title}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {role === 'client' ? 'You confirm this journey works as you expect.' : 'The journey stays approved until you reply again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (role === 'client') onConfirm()
                else onApprove()
                setConfirm(false)
              }}
            >
              {role === 'client' ? 'Confirm' : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
