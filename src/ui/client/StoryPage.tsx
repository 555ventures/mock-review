// docs/design/client-view.md §4: the whole story — a storyboard of small frames, each with its
// sentence, and the confirm. Phone: one list, frame left and sentence right. Desktop: a sheet of 2
// or 3 columns, each frame with its sentence under it; the confirm block at the end, left-aligned.
import { useEffect, useState } from 'react'
import type { ServerJourney, ServerState } from '../../schemas/patches.js'
import { roundOf } from '../sync/walkthrough.js'
import { Thumb } from './ClientFrame.js'
import { Check, PhoneBar, SideColumn, StoryChangedBand, quote, useDesktop } from './parts.js'
import { confirmStory } from './actions.js'
import { changesOf, confirmationOf, dayMonth, isWaiting, notesOnStep, numberedNotes, plural, sentenceChanged, widthsOf, type Step } from './model.js'
import { clientHref } from './route.js'

export function StoryPage({ data, project, journey, steps, multi }: { data: ServerState; project: string; journey: ServerJourney; steps: Step[]; multi: boolean }) {
  const desktop = useDesktop()
  const round = roundOf(data)?.n ?? null
  const widths = widthsOf(data)
  const all = numberedNotes(data)
  const changes = changesOf(data)
  const confirmation = confirmationOf(journey, data.approval)
  const stale = confirmation?.stale ?? false
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const projectHref = multi ? '#/' : null

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [journey.id])

  const waitingOn = (s: Step) => notesOnStep(all, s).filter(({ note }) => isWaiting(note)).length
  // a note on a screen+state two steps share is one note, counted once
  const waitingIds = new Set(steps.flatMap((s) => notesOnStep(all, s).filter(({ note }) => isWaiting(note)).map(({ note }) => note.id)))
  const waiting = waitingIds.size

  const thumbWidth = desktop ? widths.desktop : widths.phone
  const thumbHeight = desktop ? Math.round(thumbWidth * 0.625) : Math.round(thumbWidth * 1.45)

  const confirm = async () => {
    if (!journey.beats || busy) return
    setBusy(true)
    const ok = await confirmStory(journey.id, journey.beats)
    setBusy(false)
    setFailed(!ok)
  }

  let confirmBlock
  if (journey.beats === null) {
    confirmBlock = <p>This story is not written yet.</p>
  } else if (confirmation && !stale) {
    confirmBlock = (
      <p className="cv-confirmed" role="status">
        <Check />
        You confirmed this story on {dayMonth(confirmation.at)}.
      </p>
    )
  } else {
    confirmBlock = (
      <>
        <button type="button" className="cv-btn cv-btn--ink" disabled={busy} onClick={() => void confirm()}>
          This is my story
        </button>
        <p>{waiting > 0 ? `${plural(waiting, 'note is', 'notes are')} still waiting for an answer. You can confirm now or wait.` : 'You can still add notes after.'}</p>
        {failed && (
          <p className="cv-error" role="alert">
            That did not go through. Check your connection and press This is my story again.
          </p>
        )}
      </>
    )
  }

  return (
    <div className="cv cv-layout">
      {desktop && (
        <SideColumn project={project} projectHref={projectHref} title={journey.title} journeyId={journey.id} steps={steps} current="story" waiting={waitingOn} />
      )}
      <div className="cv-column cv-on-slate">
        {!desktop && <PhoneBar project={project} projectHref={projectHref} position={null} total={0} done={0} />}
        {stale && <StoryChangedBand />}
        <main className="cv-story">
          <h1 className="cv-heading">{journey.title}</h1>
          {journey.persona && <p className="cv-persona">{journey.persona}</p>}
          <ol className="cv-board">
            {steps.map((s) => {
              const w = waitingOn(s)
              const changed = stale && sentenceChanged(changes, journey.id, s.index)
              return (
                <li key={s.index} className="cv-board-item">
                  <a href={clientHref({ kind: 'step', journey: journey.id, step: s.index + 1 })}>
                    <Thumb round={round} width={thumbWidth} height={thumbHeight} screen={s.screen} state={s.state} />
                    <div className="cv-board-text">
                      <span className="cv-board-n">{s.index + 1}</span>
                      <span className="cv-board-sentence">{s.sentence ? quote(s.sentence) : `Step ${s.index + 1}`}</span>
                      {(changed || w > 0) && (
                        <span className="cv-board-meta">
                          {changed && (
                            <span>
                              <span className="cv-dot" aria-hidden />
                              Changed
                            </span>
                          )}
                          {w > 0 && <span>{plural(w, 'note waiting', 'notes waiting')}</span>}
                        </span>
                      )}
                    </div>
                  </a>
                </li>
              )
            })}
          </ol>
          <div className="cv-confirm">{confirmBlock}</div>
        </main>
      </div>
    </div>
  )
}
