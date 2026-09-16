// Reference §6/§7.4: the two note dialogs (new note, thread) plus the verdict confirmation.
// shadcn's Dialog demo shape: Dialog > form > DialogContent > Header, body, Footer.
import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js'
import { Alert, AlertDescription } from '../components/ui/alert.js'
import { Button } from '../components/ui/button.js'
import { Field, FieldGroup } from '../components/ui/field.js'
import { Label } from '../components/ui/label.js'
import { Textarea } from '../components/ui/textarea.js'
import { NoteActions, NotePin, NoteThread, VerdictDialog, type Verdict } from './notes-ui.js'
import { SCREEN_ANCHOR, type UiNote, type Viewport } from './anchor.js'
import { screenLabel, stateLabel, stepLabel } from '../store/labels.js'

export type DraftState = {
  viewport: Viewport
  text: string
  open: boolean
  whole?: boolean | undefined
  about?: 'project' | undefined
}

export function NewNoteDialog({
  screen,
  state,
  draft,
  onTextChange,
  onCancel,
  onSave,
  onOpenChange,
}: {
  screen: string
  state: string
  draft: DraftState | null
  onTextChange: (text: string) => void
  onCancel: () => void
  onSave: () => void
  onOpenChange: (open: boolean) => void
}) {
  const description = draft
    ? draft.about === 'project'
      ? 'Project'
      : draft.whole
        ? `${screenLabel(screen)} – ${stateLabel(state)}`
        : `${stepLabel(screen, state)} · ${draft.viewport}`
    : ''

  return (
    <Dialog open={!!draft?.open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <form
        id="form-note-new"
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        {draft?.open && (
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>New note</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <Label htmlFor="note-text">Note</Label>
                <Textarea
                  id="note-text"
                  autoFocus
                  placeholder="What should change here?"
                  value={draft.text}
                  onChange={(e) => onTextChange(e.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" form="form-note-new" disabled={!draft.text.trim()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </form>
    </Dialog>
  )
}

export function NoteThreadDialog({
  note,
  open,
  outdated,
  role,
  onOpenChange,
  onReanchor,
  onReply,
  onVerdict,
}: {
  note: UiNote | null
  open: boolean
  outdated: boolean
  role: 'owner' | 'client'
  onOpenChange: (open: boolean) => void
  onReanchor: () => void
  onReply: (text: string) => void
  onVerdict: (v: Verdict) => void
}) {
  const [reply, setReply] = useState('')
  const [confirm, setConfirm] = useState<Verdict | null>(null)

  return (
    <>
      <Dialog open={open && !!note} onOpenChange={(o) => !o && onOpenChange(false)}>
        <form
          id="form-note-reply"
          onSubmit={(e) => {
            e.preventDefault()
            if (!reply.trim()) return
            onReply(reply.trim())
            setReply('')
          }}
        >
          {note && (
            <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => confirm && e.preventDefault()}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <NotePin tone={note.status}>{note.id}</NotePin>
                  {note.project ? 'Project note' : note.whole || note.component === SCREEN_ANCHOR ? 'Whole screen' : note.component}
                </DialogTitle>
                <DialogDescription>
                  {note.project ? 'Project' : `${stepLabel(note.screen ?? '', note.state ?? '')}${note.viewport ? ` · ${note.viewport}` : ''}`}
                </DialogDescription>
              </DialogHeader>
              <div className="-mx-4 no-scrollbar flex max-h-[50vh] flex-col gap-4 overflow-y-auto px-4">
                {outdated && (
                  <Alert>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      This area changed since the note was written
                      <Button type="button" size="sm" variant="outline" onClick={onReanchor}>
                        Re-anchor
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <NoteThread entries={note.thread} viewerRole={role} />
              </div>
              <Field>
                <Label htmlFor="note-reply">Reply</Label>
                <Textarea id="note-reply" value={reply} onChange={(e) => setReply(e.target.value)} />
              </Field>
              <DialogFooter>
                {role === 'owner' && (
                  <NoteActions
                    status={note.status}
                    onDelete={() => setConfirm({ id: note.id, kind: 'delete' })}
                    onApprove={() => setConfirm({ id: note.id, kind: 'approve' })}
                    onReject={() => setConfirm({ id: note.id, kind: 'reject' })}
                  />
                )}
                <Button type="submit" form="form-note-reply" disabled={!reply.trim()}>
                  Reply
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </form>
      </Dialog>
      <VerdictDialog
        verdict={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(v) => {
          onVerdict(v)
          setConfirm(null)
        }}
      />
    </>
  )
}
