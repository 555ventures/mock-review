// docs/design/client-view.md §1 (a step), §2 (adding a note), §3 (reading notes). Phone first:
// one column, the sentence leading, the frame scaled to the column, a sticky bar of three buttons.
// At ≥ 960 px a real two-column layout: the numbered sentences on the left, the step on the right,
// and a 420 px panel docked right when a sheet is open.
import { useEffect, useMemo, useState } from 'react'
import type { ServerJourney, ServerState } from '../../schemas/patches.js'
import type { Pick } from '../notes/anchor.js'
import { roundOf } from '../sync/walkthrough.js'
import { ClientFrame, HeightProbes } from './ClientFrame.js'
import { NewNoteSheet, NotesSheet } from './Sheets.js'
import { PhoneBar, SideColumn, StoryChangedBand, quote, useDesktop, useFlash } from './parts.js'
import { addNote } from './actions.js'
import {
  changesOf,
  confirmationOf,
  isWaiting,
  markRead,
  notesOnStep,
  numberedNotes,
  stepChanged,
  widthsOf,
  type Step,
} from './model.js'
import { go } from './route.js'

export type Device = 'phone' | 'desktop'

/** The devices' own heights, and the room the controls under the frame take (CSS px). */
const PHONE_HEIGHT = 844
const DESKTOP_HEIGHT = 800
const FRAME_BELOW = 176
const ZOOM_STEP = 1.25
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.5

type SheetState ={ kind: 'new'; pick: Pick | null } | { kind: 'notes' } | null

export function StepPage({
  data,
  project,
  journey,
  steps,
  index,
  multi,
  device,
  onDevice,
}: {
  data: ServerState
  project: string
  journey: ServerJourney
  steps: Step[]
  index: number
  multi: boolean
  device: Device
  onDevice: (d: Device) => void
}) {
  const desktop = useDesktop()
  const round = roundOf(data)?.n ?? null
  const widths = widthsOf(data)
  const width = desktop && device === 'desktop' ? widths.desktop : widths.phone
  const step = steps[index] ?? steps[0]
  const all = useMemo(() => numberedNotes(data), [data])
  const here = useMemo(() => (step ? notesOnStep(all, step) : []), [all, step])
  const changes = changesOf(data)
  const confirmation = confirmationOf(journey, data.approval)
  const [picking, setPicking] = useState(false)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [saved, flashSaved] = useFlash(4000)
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null)

  // On a desktop the frame is never stretched past its own width: a phone screen is shown so a
  // whole phone's height fits the window, a desktop screen at most at its real size. `zoom`
  // multiplies that fit; the column's width is the ceiling either way.
  const [zoom, setZoom] = useState(1)
  useEffect(() => setZoom(1), [device])
  const fit = desktop ? { below: FRAME_BELOW, zoom, minHeight: width < 600 ? PHONE_HEIGHT : DESKTOP_HEIGHT } : undefined

  useEffect(() => {
    setPicking(false)
    setSheet(null)
    setPulse(null)
    window.scrollTo(0, 0)
    markRead(journey.id)
  }, [journey.id, index])

  useEffect(() => {
    if (!picking || sheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicking(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [picking, sheet])

  if (!step) return null
  const total = steps.length
  const position = `Step ${index + 1} of ${total}`
  const projectHref = multi ? '#/' : null

  const next = () => (index + 1 < total ? go({ kind: 'step', journey: journey.id, step: index + 2 }) : go({ kind: 'story', journey: journey.id }))
  const back = () => (index > 0 ? go({ kind: 'step', journey: journey.id, step: index }) : multi ? go({ kind: 'home' }) : undefined)
  const canBack = index > 0 || multi
  const onPress = (to: string) => {
    const edge = journey.edges.find((e) => e.from === index && e.label === to)
    if (edge) go({ kind: 'step', journey: journey.id, step: edge.to + 1 })
  }

  const save = async (text: string): Promise<boolean> => {
    const pick = sheet?.kind === 'new' ? sheet.pick : null
    const ok = await addNote({ screen: step.screen, state: step.state, anchor: pick?.anchor ?? null, pickedText: pick?.pickedText ?? null, text })
    if (ok) {
      setSheet(null)
      setPicking(false)
      flashSaved()
    }
    return ok
  }

  const locate = (id: string) => {
    if (!desktop) setSheet(null)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const pin = document.querySelector<HTMLElement>(`[data-pin="${CSS.escape(id)}"]`)
        const target = pin ?? document.querySelector<HTMLElement>('.cv-main .cv-frame')
        target?.scrollIntoView({ block: 'center' })
        if (pin) setPulse({ id, n: Date.now() })
      }),
    )
  }

  const waitingOn = (s: Step) => notesOnStep(all, s).filter(({ note }) => isWaiting(note)).length
  const notesLabel = (
    <>
      <span className="cv-count">{here.length}</span> {here.length === 1 ? 'note' : 'notes'} on this step
    </>
  )
  const savedLine = saved ? (
    <p className="cv-toast" role="status">
      Note saved. We will answer it here.
    </p>
  ) : null

  const pickPrompt = (
    <>
      <span className="cv-pickbar-say">Tap the part you mean</span>
    </>
  )
  const wholeScreen = (
    <button type="button" className="cv-textbtn" onClick={() => setSheet({ kind: 'new', pick: null })}>
      or write about the whole screen
    </button>
  )

  return (
    <div className={`cv cv-layout${desktop && sheet ? ' has-panel' : ''}`}>
      {desktop && (
        <SideColumn
          project={project}
          projectHref={projectHref}
          title={journey.title}
          journeyId={journey.id}
          steps={steps}
          current={index}
          waiting={waitingOn}
        />
      )}

      <div className="cv-column cv-page cv-on-slate">
        {!desktop && <PhoneBar project={project} projectHref={projectHref} position={position} total={total} done={index + 1} />}
        {confirmation?.stale && <StoryChangedBand />}

        <main className="cv-main">
          {step.sentence ? <h1 className="cv-sentence">{quote(step.sentence)}</h1> : <h1 className="cv-steptitle">{position}</h1>}
          {stepChanged(changes, journey.id, step) && (
            <p className="cv-changed">
              <span className="cv-dot" aria-hidden />
              Changed since you last looked
            </p>
          )}

          <ClientFrame
            screen={step.screen}
            state={step.state}
            round={round}
            width={width}
            {...(fit ? { fit } : {})}
            title={step.sentence ? `The screen for “${step.sentence}”` : `The screen for step ${index + 1}`}
            notes={here}
            pickMode={picking && !sheet}
            picked={sheet?.kind === 'new' ? sheet.pick : null}
            pulse={pulse}
            onPick={(pick) => setSheet({ kind: 'new', pick })}
            onPress={onPress}
            onPin={() => setSheet({ kind: 'notes' })}
          />

          {(here.length > 0 || desktop) && (
            <div className="cv-under">
              {desktop ? (
                <div className="cv-switch" role="group" aria-label="How the screen is shown">
                  {widths.both && (
                    <>
                      <button type="button" aria-pressed={device === 'phone'} onClick={() => onDevice('phone')}>
                        Phone
                      </button>
                      <button type="button" aria-pressed={device === 'desktop'} onClick={() => onDevice('desktop')}>
                        Desktop
                      </button>
                      <span className="cv-switch-gap" aria-hidden />
                    </>
                  )}
                  <button type="button" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))}>
                    Smaller
                  </button>
                  <button type="button" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))}>
                    Larger
                  </button>
                  {zoom !== 1 && (
                    <button type="button" onClick={() => setZoom(1)}>
                      Fit to window
                    </button>
                  )}
                </div>
              ) : null}
              {here.length > 0 && (
                <button type="button" className="cv-noterow" onClick={() => setSheet({ kind: 'notes' })}>
                  {notesLabel}
                </button>
              )}
            </div>
          )}

          {desktop &&
            (picking && !sheet ? (
              <div className="cv-desk-pick">
                {pickPrompt}
                {wholeScreen}
                <span className="cv-spacer" />
                <button type="button" className="cv-btn" onClick={() => setPicking(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {savedLine && <div style={{ marginTop: 24 }}>{savedLine}</div>}
                <div className="cv-desk-actions" style={savedLine ? { marginTop: 0 } : undefined}>
                  <button type="button" className={`cv-btn${canBack ? "" : " cv-invisible"}`} onClick={back}>
                    Back
                  </button>
                  <span className="cv-spacer" />
                  <button type="button" className="cv-btn" onClick={() => setPicking(true)}>
                    Add a note
                  </button>
                  <button type="button" className="cv-btn cv-btn--ink" onClick={next}>
                    Next
                  </button>
                </div>
              </>
            ))}
        </main>

        {!desktop && (
          <div className="cv-actions">
            {picking && !sheet ? (
              <>
                <div className="cv-pickbar">
                  {pickPrompt}
                  <button type="button" className="cv-btn" onClick={() => setPicking(false)}>
                    Cancel
                  </button>
                </div>
                {wholeScreen}
              </>
            ) : (
              <>
                {savedLine}
                <div className="cv-actions-row">
                  <button type="button" className={`cv-btn${canBack ? "" : " cv-invisible"}`} onClick={back}>
                    Back
                  </button>
                  <button type="button" className="cv-btn" onClick={() => setPicking(true)}>
                    Add a note
                  </button>
                  <button type="button" className="cv-btn cv-btn--ink" onClick={next}>
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <HeightProbes round={round} width={width} targets={steps} />
      </div>

      {sheet?.kind === 'new' && <NewNoteSheet key={JSON.stringify(sheet.pick?.anchor ?? null)} pick={sheet.pick} onCancel={() => setSheet(null)} onSave={save} />}
      {sheet?.kind === 'notes' && <NotesSheet notes={here} onClose={() => setSheet(null)} onLocate={locate} />}
    </div>
  )
}
