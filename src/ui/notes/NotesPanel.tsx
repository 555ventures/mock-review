// Reference §5: the notes panel in screen mode. Presentational — `ScreenPage` reads the store and
// passes the two groups down.
import { Fragment } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { ItemGroup } from '../components/ui/item.js'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable.js'
import { Sidebar, SidebarHeader } from '../components/ui/sidebar.js'
import { NoteRow, StatusLine } from './notes-ui.js'
import { SCREEN_ANCHOR, type UiNote } from './anchor.js'
import { screenLabel, stateLabel, stepLabel } from '../store/labels.js'
import { sameState, type Tone } from '../store/selectors.js'

export type NotesGroup = { key: 'here' | 'rest'; label: string; notes: UiNote[] }

export function NotesPanel({
  role,
  screen,
  state,
  screenTone: tone,
  here,
  rest,
  selected,
  onSelect,
  onAddNote,
  onApproveScreen,
  listRef,
}: {
  role: 'owner' | 'client'
  screen: string
  state: string
  screenTone: Tone
  here: UiNote[]
  rest: UiNote[]
  selected: string | null
  onSelect: (id: string, fromList: boolean) => void
  onAddNote: (target: 'here' | 'rest') => void
  onApproveScreen: () => void
  listRef: React.RefObject<HTMLDivElement | null>
}) {
  const groups: NotesGroup[] = [
    { key: 'here', label: 'This screen', notes: here },
    { key: 'rest', label: 'Project', notes: rest },
  ]

  return (
    <Sidebar side="right" collapsible="none" className="sticky top-0 h-svh w-80 border-l">
      {role === 'owner' && tone === 'answered' && (
        <SidebarHeader className="gap-2 border-b border-sidebar-border">
          <StatusLine
            tone={tone}
            title={screenLabel(screen)}
            approveLabel="Approve screen"
            description="The screen is marked approved until a new note or a reply reopens it."
            onApprove={onApproveScreen}
          />
        </SidebarHeader>
      )}
      <div ref={listRef} className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="vertical">
          {groups.map((g, gi) => (
            <Fragment key={g.key}>
              {gi > 0 && <ResizableHandle withHandle />}
              <ResizablePanel defaultSize={gi === 0 ? '60' : '40'} minSize="15">
                <section data-notes-scroll className="flex h-full flex-col overflow-y-auto pb-3">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-sidebar/95 px-3 py-2 backdrop-blur">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {g.label}
                    </span>
                    <Badge variant="secondary">{g.notes.length}</Badge>
                    <Button size="xs" variant="outline" onClick={() => onAddNote(g.key)}>
                      <Plus /> Note
                    </Button>
                  </div>
                  {g.notes.length === 0 ? (
                    <p className="px-3 text-sm text-muted-foreground">
                      {g.key === 'here' ? 'No notes on this screen.' : 'No other notes.'}
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
                              : (n.component ?? 'Screen')
                        const noteState = n.state ?? ''
                        const what =
                          n.project || (g.key === 'here' && sameState(noteState, state))
                            ? part
                            : `${n.screen === screen ? stateLabel(noteState) : stepLabel(n.screen ?? '', noteState)} · ${part}`
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
