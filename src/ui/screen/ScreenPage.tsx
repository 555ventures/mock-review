// Composes TopBar, DeviceFrames, the notes/journey panel, dialogs and shortcuts for one screen
// route (reference §2-§8, §12). The container: reads the store, turns intents into patches
// through `useNoteActions`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SidebarInset } from '../components/ui/sidebar.js'
import { CAPTION, GAP, DeviceFrames, type DeviceSpec } from '../frame/DeviceFrames.js'
import { useMeasure } from '../frame/useMeasure.js'
import {
  anchorFor,
  anchorForElement,
  elementAt,
  fromWalkAnchor,
  toWalkAnchor,
  type Anchor,
  type Box,
  type UiNote,
  type Viewport,
  type WalkAnchor,
} from '../notes/anchor.js'
import { roundOf } from '../sync/walkthrough.js'
import { NewNoteDialog, NoteThreadDialog } from '../notes/NoteDialogs.js'
import { NotesPanel } from '../notes/NotesPanel.js'
import { useNoteActions } from '../notes/useNoteActions.js'
import { CommandPalette } from '../shell/CommandPalette.js'
import { TopBar, type JourneyBreadcrumb } from '../shell/TopBar.js'
import { JourneyPanel } from '../journeys/JourneyPanel.js'
import { JourneyPill } from '../journeys/JourneyPill.js'
import { useJourneyGuide, type GuideStep } from '../journeys/useJourneyGuide.js'
import { locate, type LocateEdge } from '../journeys/locate.js'
import { href, type Route } from '../router/route.js'
import { screenLabel } from '../store/labels.js'
import { journeyConfirmation, journeyTone, notesHere, projectNotes, sameState, screenStates } from '../store/selectors.js'
import { EMPTY_APPROVAL } from '../../schemas/version.js'
import { enterMarking, getStore, useStore } from '../store/store.js'
import type { Verdict } from '../notes/notes-ui.js'
import type { JourneyConversation } from '../../schemas/index.js'
import { useShortcuts } from './useShortcuts.js'

// A screen with no active journey needs a stable "no edges" value: `journey?.edges ?? []` would
// build a brand-new array on every render, which is exactly the kind of unstable dependency
// `useJourneyGuide`'s effect (deps include `edges`) re-runs on — its very first line is
// `setHints([])`, so a fresh `[]` every render means a fresh state update every render, which
// means another render, forever. Confirmed by direct reproduction (concurrent page loads with no
// journey active at all still logged "Maximum update depth exceeded" once CPU contention was
// high enough to stop the browser's normal per-frame throttling from masking it) and by removing
// this exact line and watching the loop disappear.
const EMPTY_EDGES: LocateEdge[] = []
const EMPTY_JOURNEYS: Record<string, JourneyConversation> = {}

// Same stability concern as `EMPTY_EDGES` above, for the brief window before the store's first
// `fetchState()` resolves (`data` is `null`): `notes` feeds straight into `DeviceFrames`' own
// box-resolution effect dependency array, so a fresh `[]` on every render during that window
// would re-run it every render too.
const EMPTY_NOTES: UiNote[] = []

function parseViewport(v: string | number): number {
  const [w] = String(v).split('x')
  return Number(w)
}

export function ScreenPage({ route }: { route: Route & { kind: 'screen' } }) {
  const data = useStore((s) => s.data)
  const ui = useStore((s) => s.ui)
  const actions = useNoteActions()

  const screenRow = data?.screens.find((s) => s.name === route.screen)
  const states = screenRow ? screenStates(screenRow) : []
  const state = route.state && states.includes(route.state) ? route.state : (states[0] ?? 'default')
  const role = data?.role ?? 'owner'
  const config = data?.config
  // U6/U5: which round the page shows, and whether it is pictures (view only, no guide ring).
  const round = roundOf(data)
  const screenshots = round?.kind === 'screenshots'

  const viewports: Viewport[] = ui.view === 'both' ? ['desktop', 'mobile'] : [ui.view]
  const rawViewports = config && 'targets' in config && config.targets ? config.targets.viewports : []
  const sortedViewports = [...rawViewports].sort((a, b) => parseViewport(b) - parseViewport(a))
  const widest = sortedViewports[0]
  const narrowest = sortedViewports[sortedViewports.length - 1]
  const deviceSpecs: Record<Viewport, DeviceSpec> = {
    desktop: { key: 'desktop', width: widest ? parseViewport(widest) : 1280, label: 'Desktop' },
    mobile: { key: 'mobile', width: narrowest ? parseViewport(narrowest) : 360, label: 'Mobile' },
  }
  const desktopW = deviceSpecs.desktop.width
  const mobileW = deviceSpecs.mobile.width

  // Seam B serves each note's `anchor`; `fromWalkAnchor` turns it back into the page's own
  // component/key/rect/viewport, so the pins, ghosts and outdated checks below work unchanged.
  const rawNotes = data?.notes.notes
  const notes = useMemo(() => {
    if (!rawNotes) return EMPTY_NOTES
    const viewportOfWidth = (w: number): Viewport => (Math.abs(w - desktopW) <= Math.abs(w - mobileW) ? 'desktop' : 'mobile')
    return (rawNotes as UiNote[]).map((n) => fromWalkAnchor(n, viewportOfWidth))
  }, [rawNotes, desktopW, mobileW])

  const journey = route.journey ? data?.journeys.find((j) => j.id === route.journey) : undefined
  const screenStateRows = (data?.screens ?? []).map((s) => ({ name: s.name, states: screenStates(s) }))
  const journeySteps: GuideStep[] = useMemo(
    () =>
      (journey?.steps ?? []).map((s) => ({
        screen: s.screen,
        state: s.state ?? screenStateRows.find((sc) => sc.name === s.screen)?.states[0] ?? '',
      })),
    [journey?.id],
  )
  // Seam B derives each edge's `label` from the target screen's name and may send no `say`; the
  // pill then reads the target step's beat (or the screen's label) instead of a raw screen id.
  // Memoised on the journey object: `useJourneyGuide` re-runs on every new `edges` array.
  const journeyEdges: LocateEdge[] = useMemo(() => {
    if (!journey) return EMPTY_EDGES
    return journey.edges.map((e) => {
      if (e.say) return e
      const target: unknown = journey.steps[e.to]
      const beat = target && typeof target === 'object' && 'beat' in target && typeof target.beat === 'string' ? target.beat : undefined
      return { ...e, say: beat ?? (e.label ? screenLabel(e.label) : undefined) }
    })
  }, [journey])
  const journeyIdx = journey ? (locate(journey, route.screen, state, screenStateRows, route.step) ?? -1) : -1

  // D27: the note-editing session (marking/reanchor/selected/cardOpen/draft) lives in the store's
  // `UiState`, not local component state — `ScreenPage` is never remounted between screens (the
  // router renders the same instance for every `screen` route, reference §11), so local state for
  // these fields used to survive navigation wholesale: a half-drawn draft or an open note from one
  // screen could follow the reviewer to another and be saved there.
  const marking = ui.marking
  const reanchor = ui.reanchor
  const selected = ui.selected
  const cardOpen = ui.cardOpen
  const draft = ui.draft
  // D1: `notesPanel` and `pins` are chrome, like `view`/`sideTab`/`guideOn` (reference rule 31
  // lists only `guide-off`/`view`/`side-tab` as sessionStorage-persisted; neither successor of
  // `showNotes` joins them, so both stay store-only, no `prefs.ts` entry) — read/written through
  // the store like the other five, but deliberately NOT part of the screen-change reset below:
  // they must survive navigation. `notesPanel` mounts the right-hand panel (and the JourneyPanel);
  // `pins` paints note pins and ghosts on the mock — two unrelated jobs the old single boolean
  // conflated (rule 39).
  const notesPanel = ui.notesPanel
  const pins = ui.pins

  const rootsRef = useRef<Partial<Record<Viewport, HTMLElement | null>>>({})
  const [frameLoads, setFrameLoads] = useState(0)
  const [boxesBy, setBoxesBy] = useState<Partial<Record<Viewport, Record<string, Box | null>>>>({})
  const onRoot = useCallback((v: Viewport, root: HTMLElement | null) => {
    rootsRef.current[v] = root
  }, [])
  const onBoxes = useCallback((v: Viewport, b: Record<string, Box | null>) => setBoxesBy((p) => ({ ...p, [v]: b })), [])
  const onFrameLoad = useCallback(() => setFrameLoads((n) => n + 1), [])

  const here = useMemo(() => notesHere(route.screen, notes), [route.screen, notes])
  const project = useMemo(() => projectNotes(notes), [notes])

  const { ref: wsRef, avail } = useMeasure()

  const selectedNote = notes.find((n) => n.id === selected) ?? null
  const notesListRef = useRef<HTMLDivElement>(null)
  const scrollToRow = useRef<string | null>(null)

  // D27: reset on `route.screen` only — a state or journey-step change within the same screen
  // must reset nothing, so `route.screen` (not `route` itself) is the only dependency. D9: the
  // scroll-to-row marker is cleared here too, so a pin click just before navigating away never
  // fires a scroll on the new screen's list.
  useEffect(() => {
    getStore().setUi({ marking: false, reanchor: null, selected: null, cardOpen: false, draft: null })
    scrollToRow.current = null
  }, [route.screen])

  // Rule 18: selecting a note from the mock scrolls the sidebar's own note list to that row — it
  // never scrolls the page. A list ref (`notesListRef`, passed down to `NotesPanel`) plus a
  // `[data-row]` attribute on each row (`notes/notes-ui.tsx`'s `NoteRow`) let this reach into the
  // panel without the panel needing to know why. `Element.scrollTop` on the row's own scrollable
  // ancestor (`[data-notes-scroll]`) is used instead of `scrollIntoView`, which would happily walk
  // up and scroll the document too.
  const select = useCallback(
    (id: string, fromList: boolean) => {
      scrollToRow.current = fromList ? null : id
      const n = notes.find((x) => x.id === id)
      if (!n) return
      if (n.project) {
        getStore().setUi((u) => ({ selected: id, cardOpen: true, draft: u.draft && u.draft.text.trim() ? { ...u.draft, open: false } : null }))
        return
      }
      getStore().setUi((u) => ({ selected: id, cardOpen: true, draft: u.draft && u.draft.text.trim() ? { ...u.draft, open: false } : null }))
      if (!sameState(n.state, state)) location.hash = href({ kind: 'screen', screen: route.screen, state: n.state ?? undefined })
    },
    [notes, route.screen, state],
  )

  useEffect(() => {
    const id = scrollToRow.current
    if (!id) return
    const root = notesListRef.current
    const row = root?.querySelector<HTMLElement>(`[data-row="${id}"]`)
    const scrollParent = row?.closest<HTMLElement>('[data-notes-scroll]')
    if (!row || !scrollParent) return
    scrollToRow.current = null
    const win = row.ownerDocument.defaultView ?? window
    // Two rAFs: `[data-notes-scroll]`'s enclosing `ResizablePanel` sizes itself off a
    // `ResizeObserver` on remount (react-resizable-panels), which settles a frame after this
    // effect's own commit — reading `getBoundingClientRect` synchronously here (as the D9 patch
    // text shows) races that resize and measures against its pre-settled full-height layout,
    // scrolling short. Same coalescing idiom as `DeviceFrames.tsx`'s `bump` (rule 17).
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        const rowRect = row.getBoundingClientRect()
        const parentRect = scrollParent.getBoundingClientRect()
        const delta = rowRect.top - parentRect.top
        if (delta < 0 || delta + rowRect.height > parentRect.height) {
          scrollParent.scrollTop += delta - parentRect.height / 2 + rowRect.height / 2
        }
      }),
    )
  }, [selected, notesPanel])

  useEffect(() => {
    if (!marking) getStore().setUi({ reanchor: null })
  }, [marking])

  // Seam A's `anchor` for a resolved anchor: the node (wireframe) or the picture fraction plus
  // the picture's width (screenshots). `wholeNode` = picked by a plain click (rect null).
  const walkAnchor = (root: HTMLElement, a: Anchor, v: Viewport, wholeNode = false): WalkAnchor =>
    toWalkAnchor(root, a, { kind: screenshots ? 'screenshots' : 'wireframe', viewport: v, width: deviceSpecs[v].width, wholeNode })

  const reanchorTo = (id: string, root: HTMLElement, a: Anchor, v: Viewport, wholeNode = false) => {
    void actions.reanchorNote(id, {
      screen: route.screen,
      state,
      viewport: v,
      component: a.component,
      key: a.key,
      rect: a.rect,
      snippet: a.snippet,
      anchor: walkAnchor(root, a, v, wholeNode),
    })
    getStore().setUi({ reanchor: null, marking: false, selected: id })
  }

  const onDraw = (v: Viewport, box: Box) => {
    const root = rootsRef.current[v]
    if (reanchor && root) {
      reanchorTo(reanchor, root, anchorFor(root, box), v)
      return
    }
    getStore().setUi((u) => ({ cardOpen: false, draft: { viewport: v, box, text: u.draft?.text ?? '', open: true } }))
  }

  // U3: a plain click in marking mode. On a wireframe it selects the whole node under the pointer
  // (the draft box outlines that node; the saved anchor has rect = null). On a screenshot it is a
  // point on the picture (anchor w/h = null).
  const onPick = (v: Viewport, p: { x: number; y: number }) => {
    const root = rootsRef.current[v]
    if (!root) return
    if (screenshots) {
      const box = { left: p.x, top: p.y, width: 0, height: 0 }
      if (reanchor) {
        reanchorTo(reanchor, root, anchorFor(root, box), v)
        return
      }
      getStore().setUi((u) => ({ cardOpen: false, draft: { viewport: v, box, text: u.draft?.text ?? '', open: true } }))
      return
    }
    const el = elementAt(root, p.x, p.y)
    if (!el) return
    const a = anchorForElement(root, el)
    if (reanchor) {
      reanchorTo(reanchor, root, a, v, true)
      return
    }
    const r = el.getBoundingClientRect()
    const box = { left: r.left, top: r.top, width: r.width, height: r.height }
    getStore().setUi((u) => ({
      cardOpen: false,
      draft: { viewport: v, box, text: u.draft?.text ?? '', open: true, pick: { component: a.component, key: a.key, snippet: a.snippet } },
    }))
  }

  const noteOnScreen = (target: 'here' | 'project' = 'here') => {
    getStore().setUi({
      notesPanel: true,
      marking: false,
      reanchor: null,
      cardOpen: false,
      draft: {
        viewport: 'desktop',
        box: { left: 0, top: 0, width: 0, height: 0 },
        text: '',
        open: true,
        whole: true,
        ...(target === 'project' ? { about: 'project' as const } : {}),
      },
    })
  }

  const saveDraft = async () => {
    if (!draft || !draft.text.trim()) return
    if (draft.about === 'project') {
      const id = await actions.addNote(
        { screen: null, state: null, component: null, key: null, snippet: null, project: true, anchor: null },
        draft.text.trim(),
        role,
      )
      getStore().setUi({ draft: null, selected: id })
      return
    }
    if (draft.whole) {
      const id = await actions.addNote(
        { screen: route.screen, state, component: '__screen', key: '0', snippet: null, viewport: draft.viewport, whole: true, anchor: null },
        draft.text.trim(),
        role,
      )
      getStore().setUi({ draft: null, selected: id })
      return
    }
    const root = rootsRef.current[draft.viewport]
    if (!root) return
    const a: Anchor = draft.pick ? { ...draft.pick, rect: { x: 0, y: 0, w: 1, h: 1 } } : anchorFor(root, draft.box)
    const anchor = walkAnchor(root, a, draft.viewport, !!draft.pick)
    const id = await actions.addNote(
      { screen: route.screen, state, component: a.component, key: a.key, snippet: a.snippet, viewport: draft.viewport, rect: a.rect, anchor },
      draft.text.trim(),
      role,
    )
    getStore().setUi({ draft: null, marking: false, selected: id })
  }

  const isolated = (draft?.open ?? false) || (cardOpen && !!selected)
  const { hints: guideHints, ring: guideRing } = useJourneyGuide({
    rootsRef,
    count: ui.view === 'both' ? 2 : 1,
    steps: journeySteps,
    edges: journeyEdges,
    idx: journeyIdx,
    // U5: a screenshots round has no controls to find — no ring, no hints, no red "not found".
    enabled: !marking && !isolated && !screenshots,
    ring: ui.guideOn,
    frame: frameLoads,
    journeyId: journey?.id ?? '',
  })

  useShortcuts({
    marking,
    draftOpen: draft?.open ?? false,
    journey: !!journey,
    onToggleMark: () => getStore().setUi((u) => (u.marking ? { marking: false } : enterMarking())),
    onEscape: () => getStore().setUi({ marking: false, reanchor: null }),
    onNewNote: () => noteOnScreen(),
  })

  const hasMobile = sortedViewports.length > 1
  const activeViewports = hasMobile ? viewports : (['desktop'] as Viewport[])
  const devices: DeviceSpec[] = activeViewports.map((v) => deviceSpecs[v])

  const pillH = journey ? 64 : 0
  const totalW = devices.reduce((sum, d) => sum + d.width, 0)
  const gaps = GAP * (devices.length - 1)
  const scale = Math.max(0.1, Math.min(1, (avail.w - gaps) / Math.max(1, totalW)))
  const deviceH = Math.max(200, avail.h - CAPTION - pillH) / scale

  const isOutdatedNote = (n: UiNote): boolean => {
    if (n.screen !== route.screen || !sameState(n.state, state)) return false
    const frames = n.viewport && activeViewports.includes(n.viewport) ? [n.viewport] : activeViewports
    return frames.every((v) => boxesBy[v]?.[n.id] === null)
  }

  const journeyThread = journey ? (data?.notes.journeys[journey.id]?.thread ?? []) : []

  return (
    <>
      <SidebarInset className="min-w-0">
        <TopBar
          screen={route.screen}
          state={state}
          states={states}
          countInState={(s) => here.filter((n) => sameState(n.state, s)).length}
          journey={
            journey
              ? ({
                  title: journey.title,
                  journeyId: journey.id,
                  idx: journeyIdx,
                  total: journey.steps.length,
                  step0Screen: journey.steps[0]?.screen ?? '',
                  step0State: journey.steps[0]?.state,
                } satisfies JourneyBreadcrumb)
              : null
          }
          view={ui.view}
          onViewChange={(v) => {
            getStore().setUi({ view: v })
          }}
          reanchorId={reanchor}
          marking={marking}
          onMarkingChange={(v) => getStore().setUi(v ? enterMarking() : { marking: false })}
          pins={pins}
          onPinsChange={(v) => getStore().setUi({ pins: v })}
          notesPanel={notesPanel}
          onNotesPanelChange={(v) => getStore().setUi({ notesPanel: v })}
          notesOnScreenCount={here.length}
          onOpenInScreens={() => getStore().setUi({ sideTab: 'screens' })}
          hasMobile={hasMobile}
          round={round}
        />

        <div ref={wsRef} className="relative flex min-w-0 flex-1 flex-col items-center bg-muted px-8 py-6">
          <DeviceFrames
            devices={devices}
            scale={scale}
            h={deviceH}
            screen={route.screen}
            state={state}
            round={round?.n ?? null}
            title={screenLabel(route.screen)}
            notes={notes}
            pins={pins && !journey}
            marking={marking && !journey}
            draftByViewport={(v) => (draft && draft.viewport === v && !draft.whole ? draft.box : null)}
            ring={guideRing}
            isolated={isolated}
            onFrameLoad={onFrameLoad}
            onRoot={onRoot}
            onBoxes={onBoxes}
            onSelect={(id) => select(id, false)}
            onDraw={onDraw}
            onPick={onPick}
            onOpenDraft={() => draft && getStore().setUi({ draft: { ...draft, open: true } })}
            onPaletteKey={() => getStore().setUi((u) => ({ paletteOpen: !u.paletteOpen }))}
          />

          {journey && (
            <JourneyPill
              journeyId={journey.id}
              title={journey.title}
              steps={journeySteps}
              edges={journeyEdges}
              simple={screenshots}
              idx={journeyIdx}
              hints={guideHints}
              guideOn={ui.guideOn}
              setGuideOn={(on) => getStore().setUi({ guideOn: on })}
            />
          )}
        </div>
      </SidebarInset>

      {notesPanel &&
        (journey ? (
          <div className="sticky top-0 flex h-svh w-80 flex-col border-l bg-sidebar">
            <JourneyPanel
              title={journey.title}
              thread={journeyThread}
              tone={journeyTone(journey.id, data?.notes.journeys ?? EMPTY_JOURNEYS)}
              role={role}
              beats={journey.beats ?? null}
              onReply={(text) => void actions.replyJourney(journey.id, text)}
              onApprove={() => void actions.approveJourney(journey.id)}
              onConfirm={() => void actions.clientOk(journey.id, journey.beats ?? '')}
              confirmed={journeyConfirmation(journey.id, journey.beats, data?.approval ?? EMPTY_APPROVAL)}
            />
          </div>
        ) : (
          <NotesPanel
            state={state}
            here={here}
            project={project}
            selected={selected}
            onSelect={select}
            onAddNote={(target) => noteOnScreen(target)}
            listRef={notesListRef}
          />
        ))}

      <NewNoteDialog
        screen={route.screen}
        state={state}
        draft={draft}
        onTextChange={(text) => getStore().setUi((u) => ({ draft: u.draft ? { ...u.draft, text } : u.draft }))}
        onCancel={() => getStore().setUi({ draft: null })}
        onSave={() => void saveDraft()}
        onOpenChange={(open) => {
          if (!open) getStore().setUi((u) => ({ draft: u.draft && u.draft.text.trim() ? { ...u.draft, open: false } : null }))
        }}
      />

      <NoteThreadDialog
        note={selectedNote}
        open={!draft?.open && cardOpen && !!selectedNote}
        outdated={selectedNote ? isOutdatedNote(selectedNote) : false}
        role={role}
        onOpenChange={(open) => !open && getStore().setUi({ cardOpen: false })}
        onReanchor={() => {
          if (!selectedNote) return
          getStore().setUi(enterMarking({ cardOpen: false, draft: null, reanchor: selectedNote.id }))
        }}
        onReply={(text) => selectedNote && void actions.replyNote(selectedNote.id, text)}
        onVerdict={(v: Verdict) => {
          if (v.kind === 'approve') void actions.approveNote(v.id)
          else if (v.kind === 'defer') void actions.deferNote(v.id)
          else {
            void actions.removeNote(v.id)
            getStore().setUi({ selected: null, cardOpen: false })
          }
        }}
      />

      <CommandPalette
        onMark={
          role === 'owner' && !journey
            ? () => getStore().setUi(enterMarking({ draft: null, cardOpen: false }))
            : undefined
        }
        onToggleNotes={role === 'owner' ? () => getStore().setUi((u) => ({ notesPanel: !u.notesPanel })) : undefined}
        onTogglePins={
          role === 'owner' && !journey ? () => getStore().setUi((u) => ({ pins: !u.pins })) : undefined
        }
      />
    </>
  )
}
