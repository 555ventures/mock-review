// Reference §4 TONE table + the note UI kit: stock shadcn parts (Badge, Item, Button, Textarea,
// AlertDialog) with default styling. The only custom styling is the status color, which shadcn
// has no variant for.
import { Fragment, useState, type ReactNode } from 'react'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Separator } from '../components/ui/separator.js'
import { Item, ItemContent, ItemDescription, ItemTitle } from '../components/ui/item.js'
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
import type { ThreadEntry } from '../../schemas/index.js'

export type PinTone = 'open' | 'answered' | 'approved' | 'draft'

/** ONE status palette. Red = pending an AI fix, yellow = pending your approval, blue = approved. */
export const TONE: Record<PinTone, { box: string; pin: string }> = {
  open: { box: 'border-red-500 bg-red-500/5', pin: 'bg-red-500 text-white' },
  answered: { box: 'border-yellow-400 bg-yellow-400/10', pin: 'bg-yellow-400 text-yellow-950' },
  approved: { box: 'border-blue-500 bg-blue-500/5', pin: 'bg-blue-500 text-white' },
  draft: { box: 'border-dashed border-foreground bg-foreground/5', pin: '' },
}

export function StatusDot({ tone }: { tone: Exclude<PinTone, 'draft'> }) {
  return <span className={`size-2 shrink-0 rounded-full ${TONE[tone].pin}`} />
}

/** Dot + title (+ approve button and its confirmation while yellow) — one status line for journey
 * and screen mode. */
export function StatusLine({
  tone,
  title,
  approveLabel,
  description,
  onApprove,
}: {
  tone: Exclude<PinTone, 'draft'>
  title: string
  approveLabel: string
  description: string
  onApprove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex min-h-8 items-center gap-2">
        <StatusDot tone={tone} />
        <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        {tone === 'answered' && (
          <Button size="sm" onClick={() => setOpen(true)}>
            {approveLabel}
          </Button>
        )}
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {title}?</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onApprove()
                setOpen(false)
              }}
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function NotePin({ tone, children, floating }: { tone: PinTone; children: ReactNode; floating?: boolean }) {
  return <Badge className={`${TONE[tone].pin} ${floating ? 'absolute -top-2.5 -left-2.5' : ''}`}>{children}</Badge>
}

/** One note in the panel: a plain outline Item; the status colour lives only on the id badge, the
 * same pin as on the mock. Title = id + what it is about; description = first message. */
export function NoteRow({
  tone,
  selected,
  onClick,
  rowId,
  id,
  what,
  text,
}: {
  tone: Exclude<PinTone, 'draft'>
  selected: boolean
  onClick: () => void
  rowId: string
  id: string
  what: ReactNode
  text: string
}) {
  return (
    <Item
      asChild
      size="sm"
      variant="outline"
      className={`items-start text-left hover:bg-accent/50 ${selected ? 'border-foreground/30 bg-accent' : ''}`}
    >
      <button type="button" data-row={rowId} aria-selected={selected} onClick={onClick}>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full min-w-0">
            <NotePin tone={tone}>{id}</NotePin>
            <span className="truncate">{what}</span>
          </ItemTitle>
          <ItemDescription className="line-clamp-2">{text}</ItemDescription>
        </ItemContent>
      </button>
    </Item>
  )
}

/** D5: `thread[].by` renders "You" for `owner`, "AI" for `session`, "Client" for `client`
 * (rendered "You" when the viewer themselves is the client). */
export function authorLabel(by: string, viewerRole: 'owner' | 'client'): string {
  if (by === 'session') return 'AI'
  if (by === 'client') return viewerRole === 'client' ? 'You' : 'Client'
  return 'You'
}

export function NoteThread({ entries, viewerRole }: { entries: ThreadEntry[]; viewerRole: 'owner' | 'client' }) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map((e, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator />}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{authorLabel(e.by, viewerRole)}</span>
            <p className="text-sm whitespace-pre-wrap">{e.text}</p>
          </div>
        </Fragment>
      ))}
    </div>
  )
}

export type Verdict = { id: string; kind: 'approve' | 'reject' | 'delete' }

export function VerdictDialog({
  verdict,
  onCancel,
  onConfirm,
}: {
  verdict: Verdict | null
  onCancel: () => void
  onConfirm: (v: Verdict) => void
}) {
  const approve = verdict?.kind === 'approve'
  const label = verdict?.kind === 'approve' ? 'Approve' : verdict?.kind === 'delete' ? 'Delete' : 'Reject'
  return (
    <AlertDialog open={!!verdict} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {label} {verdict?.id}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {approve ? 'The note moves to Done.' : 'The note and its thread are removed from the screen and the list.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={approve ? 'default' : 'destructive'} onClick={() => verdict && onConfirm(verdict)}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The actions a note allows, by status — the one place this rule lives. */
export function NoteActions({
  status,
  onApprove,
  onReject,
  onDelete,
}: {
  status: Exclude<PinTone, 'draft'>
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
}) {
  if (status === 'open')
    return (
      <Button type="button" variant="destructive" onClick={onDelete}>
        Delete
      </Button>
    )
  if (status === 'answered')
    return (
      <>
        <Button type="button" variant="destructive" onClick={onReject}>
          Reject
        </Button>
        <Button type="button" variant="outline" onClick={onApprove}>
          Approve
        </Button>
      </>
    )
  return null
}
