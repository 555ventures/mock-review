// Reference §4 TONE table + the note UI kit: stock shadcn parts (Badge, Item, Button, Textarea,
// AlertDialog) with default styling. The only custom styling is the status color, which shadcn
// has no variant for.
import { Fragment, type ReactNode } from 'react'
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

export type PinTone = 'open' | 'answered' | 'approved' | 'deferred'

/** ONE status palette. Red = pending an AI fix, yellow = pending your approval, blue = approved,
 * muted grey = parked (D9: a fourth, distinct tone — a deferred note is separable at a glance
 * from an approved one, though both count as closed in every aggregate dot, see
 * `store/selectors.ts`'s `worst()`). */
export const TONE: Record<PinTone, { box: string; pin: string }> = {
  open: { box: 'border-red-500 bg-red-500/5', pin: 'bg-red-500 text-white' },
  answered: { box: 'border-yellow-400 bg-yellow-400/10', pin: 'bg-yellow-400 text-yellow-950' },
  approved: { box: 'border-blue-500 bg-blue-500/5', pin: 'bg-blue-500 text-white' },
  deferred: { box: 'border-gray-400 bg-gray-400/10', pin: 'bg-gray-400 text-gray-950' },
}

export function StatusDot({ tone }: { tone: PinTone }) {
  return <span className={`size-2 shrink-0 rounded-full ${TONE[tone].pin}`} />
}

export function NotePin({ tone, children }: { tone: PinTone; children: ReactNode }) {
  return <Badge className={TONE[tone].pin}>{children}</Badge>
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
  tone: PinTone
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

export type Verdict = { id: string; kind: 'approve' | 'reject' | 'delete' | 'defer' }

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
  const defer = verdict?.kind === 'defer'
  const label = approve ? 'Approve' : verdict?.kind === 'delete' ? 'Delete' : defer ? 'Defer' : 'Reject'
  const description = approve
    ? 'The note moves to Done.'
    : defer
      ? 'It stays on the list, greyed out, until someone replies again.'
      : 'The note and its thread are removed from the screen and the list.'
  return (
    <AlertDialog open={!!verdict} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {label} {verdict?.id}?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={approve || defer ? 'default' : 'destructive'}
            onClick={() => verdict && onConfirm(verdict)}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** D8: the actions a note allows, by role/ownership/status — the one place this rule lives.
 * `own` is the server's own ownership gate (`thread[0].by === 'client'`), so a client never sees
 * a control the server would refuse anyway.
 *
 * | viewer | status | buttons |
 * | --- | --- | --- |
 * | owner | open | Delete |
 * | owner | answered | Reject, Approve, Defer |
 * | owner | approved/deferred | none |
 * | client (own note) | open/answered | Approve, Defer |
 * | client (any other) | any | none |
 */
export function NoteActions({
  role,
  own,
  status,
  onApprove,
  onReject,
  onDelete,
  onDefer,
}: {
  role: 'owner' | 'client'
  own: boolean
  status: PinTone
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
  onDefer: () => void
}) {
  if (role === 'client') {
    if (own && (status === 'open' || status === 'answered'))
      return (
        <>
          <Button type="button" variant="outline" onClick={onApprove}>
            Approve
          </Button>
          <Button type="button" variant="outline" onClick={onDefer}>
            Defer
          </Button>
        </>
      )
    return null
  }
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
        <Button type="button" variant="outline" onClick={onDefer}>
          Defer
        </Button>
      </>
    )
  return null
}
