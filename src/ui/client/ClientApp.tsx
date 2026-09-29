// The client view (docs/design/client-view.md): what a `client` link shows instead of the owner's
// reviewer. A storyboard — the client's sentence leads, the gray frame follows. Routes live in the
// hash (`route.ts`); data comes from the same store and `GET state` as the reviewer.
import { useEffect, useState } from 'react'
import './client.css'
import { useStore } from '../store/store.js'
import { PhoneBar, useDesktop } from './parts.js'
import { StepPage, type Device } from './StepPage.js'
import { StoriesPage } from './StoriesPage.js'
import { StoryPage } from './StoryPage.js'
import { projectTitle, stepsOf } from './model.js'
import { go, useClientRoute } from './route.js'

const NEWSREADER = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;1,400&display=swap'

/** Newsreader for the sentences, loaded for the client view only; the slate page behind it. */
function useClientDocument(title: string): void {
  useEffect(() => {
    if (!document.querySelector('link[data-newsreader]')) {
      for (const [rel, href, cross] of [
        ['preconnect', 'https://fonts.googleapis.com', false],
        ['preconnect', 'https://fonts.gstatic.com', true],
        ['stylesheet', NEWSREADER, false],
      ] as const) {
        const link = document.createElement('link')
        link.rel = rel
        link.href = href
        if (cross) link.crossOrigin = ''
        link.setAttribute('data-newsreader', '')
        document.head.appendChild(link)
      }
    }
    document.documentElement.classList.add('cv-html')
    document.documentElement.lang = 'en'
  }, [])
  useEffect(() => {
    document.title = title
  }, [title])
}

/** §6: one sentence on the slate page, under the project bar. */
function Message({ project, children }: { project: string | null; children: string }) {
  return (
    <div className="cv cv-page">
      {project !== null && <PhoneBar project={project} projectHref={null} position={null} total={0} done={0} always />}
      <main className="cv-empty">
        <p>{children}</p>
      </main>
    </div>
  )
}

/** §6 "Link no longer valid" — also what the page shows when `GET state` starts refusing. */
export function LinkInvalid() {
  useClientDocument('walkthrough')
  return <Message project={null}>This link no longer works. Ask the person who sent it for a new one.</Message>
}

export function ClientApp() {
  const data = useStore((s) => s.data)
  const route = useClientRoute()
  const desktop = useDesktop()
  const [device, setDevice] = useState<Device>('desktop')
  const project = projectTitle(data)
  useClientDocument(project)

  const journeys = data?.journeys ?? []
  const single = journeys.length === 1 ? journeys[0] : undefined
  const journey = route.kind === 'home' ? undefined : journeys.find((j) => j.id === route.journey)
  const lost = journeys.length > 0 && ((route.kind === 'home' && !!single) || (route.kind !== 'home' && !journey))

  // With one journey the link opens straight on step 1; an address that names nothing we have
  // goes back to the start.
  useEffect(() => {
    if (!lost) return
    if (single) go({ kind: 'step', journey: single.id, step: 1 }, true)
    else go({ kind: 'home' }, true)
  }, [lost, single?.id])

  if (!data) return null
  if (journeys.length === 0) {
    return <Message project={project}>Nothing to look at yet. We will send you a message when the first version is ready.</Message>
  }
  if (lost) return null
  if (route.kind === 'home' || !journey) return <StoriesPage data={data} project={project} />

  const steps = stepsOf(journey, data)
  const multi = journeys.length > 1
  if (route.kind === 'story' || steps.length === 0) {
    return <StoryPage data={data} project={project} journey={journey} steps={steps} multi={multi} />
  }
  const index = Math.min(Math.max(route.step - 1, 0), steps.length - 1)
  return (
    <StepPage
      data={data}
      project={project}
      journey={journey}
      steps={steps}
      index={index}
      multi={multi}
      device={desktop ? device : 'phone'}
      onDevice={setDevice}
    />
  )
}
