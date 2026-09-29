// Reference §5: the notes panel in screen mode. Presentational — `ScreenPage` reads the store and
// passes the two groups down.
import { Fragment } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { ItemGroup } from '../components/ui/item.js'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable.js'
import { Sidebar, SidebarHeader } from '../components/ui/sidebar.js'
import { NoteRow } from './notes-ui.js'
import { PICTURE_ANCHOR, SCREEN_ANCHOR, type UiNote } from './anchor.js'
import { stateLabel } from '../store/labels.js'
import { sameState } from '../store/selectors.js'

export type NotesGroup = { key: 'here' | 'project'; label: string; notes: UiNote[] }

export function NotesPanel({
  state,
  here,
  project,
  selected,
  onSelect,
  onAddNote,
  listRef,
}: {
  state: string
  here: UiNote[]
  project: UiNote[]
  selected: string | null
  onSelect: (id: string, fromList: boolean) => void
  onAddNote: (target: 'here' | 'project') => void
  listRef: React.RefObject<HTMLDivElement | null>
}) {
  const groups: NotesGroup[] = [
    { key: 'here', label: 'This screen', notes: here },
    { key: 'project', label: 'Project', notes: project },
  ]

  return (
    <Sidebar side="right" collapsible="none" className="sticky top-0 h-svh w-80 border-l">
      {/* D4: the Approve-screen control and its status line are gone — the header that used to
       * hold `StatusLine` now shows the group heading and count for the first group (THIS
       * SCREEN), unconditionally, in the same row shape as before. */}
      <SidebarHeader className="gap-2 border-b border-sidebar-border">
        <div className="flex min-h-8 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
            This screen
          </span>
          <Badge variant="secondary">{here.length}</Badge>
          <Button size="xs" variant="outline" onClick={() => onAddNote('here')}>
            <Plus /> Note
          </Button>
        </div>
      </SidebarHeader>
      <div ref={listRef} className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="vertical">
          {groups.map((g, gi) => (
            <Fragment key={g.key}>
              {gi > 0 && <ResizableHandle withHandle />}
              <ResizablePanel defaultSize={gi === 0 ? '60' : '40'} minSize="15">
                <section data-notes-scroll className="flex h-full flex-col overflow-y-auto pb-3">
                  {g.key !== 'here' && (
                    <div className="sticky top-0 z-10 flex items-center gap-2 bg-sidebar/95 px-3 py-2 backdrop-blur">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {g.label}
                      </span>
                      <Badge variant="secondary">{g.notes.length}</Badge>
                      <Button size="xs" variant="outline" onClick={() => onAddNote(g.key)}>
                        <Plus /> Note
                      </Button>
                    </div>
                  )}
                  {g.notes.length === 0 ? (
                    <p className="px-3 text-sm text-muted-foreground">
                      {g.key === 'here' ? 'No notes on this screen.' : 'No project notes.'}
                    </p>
                  ) : (
                    <ItemGroup className="gap-1.5 px-2">
                      {g.notes.map((n) => {
                        const part = n.project
                          ? 'Project note'
                          : n.whole
                            ? 'Whole screen'
                            : n.component === SCREEN_ANCHOR
                              ? 'Screen'
                              : n.component === PICTURE_ANCHOR
                                ? 'Picture'
                              : (n.component ?? 'Screen')
                        const noteState = n.state ?? ''
                        const what =
                          (n.status === 'deferred' ? 'Deferred · ' : '') +
                          (n.project || sameState(noteState, state) ? part : `${stateLabel(noteState)} · ${part}`)
                        return (
                          <NoteRow
                            key={n.id}
                            rowId={n.id}
                            tone={n.status}
                            selected={selected === n.id}
                            onClick={() => onSelect(n.id, true)}
                            id={n.id}
                            what={what}
                            text={n.thread[0]?.text ?? ''}
                          />
                        )
                      })}
                    </ItemGroup>
                  )}
                </section>
              </ResizablePanel>
            </Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
    </Sidebar>
  )
}
