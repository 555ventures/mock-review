// Small pieces shared by the client view's pages: the phone bar, the desktop sentence column, the
// "story changed" band, the sheet container and the media query.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { clientHref } from './route.js'
import type { Step } from './model.js'

const DESKTOP = '(min-width: 960px)'

export function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(DESKTOP)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(DESKTOP).matches,
    () => false,
  )
}

export function quote(sentence: string): string {
  return `“${sentence}”`
}

/** Phone: project name left, position right, progress in segments filled up to here. */
export function PhoneBar({ project, projectHref, position, total, done, always = false }: { project: string; projectHref: string | null; position: string | null; total: number; done: number; always?: boolean }) {
  return (
    <header className={always ? "cv-bar cv-bar--always" : "cv-bar"}>
      <div className="cv-bar-row">
        {projectHref ? (
          <a className="cv-project" href={projectHref}>
            {project}
          </a>
        ) : (
          <span className="cv-project">{project}</span>
        )}
        {position && <span className="cv-steptitle">{position}</span>}
      </div>
      {total > 0 && (
        <div className="cv-progress" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < done ? 'is-done' : ''} />
          ))}
        </div>
      )}
    </header>
  )
}

/** Desktop: the numbered sentences (a real sequence), the current one ink, the others quiet; a
 * highlighter dot after a sentence whose step has a note waiting; "See the whole story" last. */
export function SideColumn({
  project,
  projectHref,
  title,
  journeyId,
  steps,
  current,
  waiting,
}: {
  project: string
  projectHref: string | null
  title: string
  journeyId: string
  steps: Step[]
  current: number | 'story'
  waiting: (step: Step) => number
}) {
  return (
    <nav className="cv-side" aria-label="The story">
      <div className="cv-side-inner">
      {projectHref ? (
        <a className="cv-project" href={projectHref}>
          {project}
        </a>
      ) : (
        <span className="cv-project">{project}</span>
      )}
      <span className="cv-steptitle">{title}</span>
      <ol className="cv-side-steps">
        {steps.map((s) => {
          const w = waiting(s)
          return (
            <li key={s.index}>
              <a href={clientHref({ kind: 'step', journey: journeyId, step: s.index + 1 })} aria-current={current === s.index ? 'page' : undefined}>
                <span className="cv-side-n">{s.index + 1}</span>
                <span className="cv-side-sentence">
                  {s.sentence ?? `Step ${s.index + 1}`}
                  {w > 0 && <span className="cv-dot" role="img" aria-label={w === 1 ? '1 note waiting' : `${w} notes waiting`} />}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
      <a className="cv-side-story" href={clientHref({ kind: 'story', journey: journeyId })} aria-current={current === 'story' ? 'page' : undefined}>
        See the whole story
      </a>
      </div>
    </nav>
  )
}

export function StoryChangedBand() {
  return (
    <div className="cv-band" role="status">
      The story changed since you confirmed it. Please read it again.
    </div>
  )
}

/** A bottom sheet on a phone, a 420 px panel docked right on a desktop. Escape closes it; focus
 * moves into it on open and back to where it was on close. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('textarea, [data-autofocus]')
    ;(first ?? el)?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
      }
    }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      if (before && document.contains(before)) before.focus({ preventScroll: true })
    }
  }, [])
  return (
    <aside ref={ref} className="cv-sheet" role="dialog" aria-label={label} tabIndex={-1}>
      {children}
    </aside>
  )
}

/** A line that shows for a few seconds (the "Note saved" line). */
export function useFlash(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return [
    on,
    () => {
      window.clearTimeout(timer.current)
      setOn(true)
      timer.current = window.setTimeout(() => setOn(false), ms)
    },
  ]
}

export function Check() {
  return (
    <svg className="cv-check" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
