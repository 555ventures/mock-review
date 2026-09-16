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

export function JourneyPanel({
  title,
  thread,
  tone,
  role,
  onReply,
  onApprove,
  onConfirm,
}: {
  title: string
  thread: ThreadEntry[]
  tone: Tone
  role: 'owner' | 'client'
  onReply: (text: string) => void
  onApprove: () => void
  onConfirm: () => void
}) {
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
          {role === 'client' ? (
            <Button type="button" onClick={() => setConfirm(true)}>
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
