// The client view's reading of `GET state` (docs/design/client-view.md). Pure functions over the
// store's data: the steps of a journey, which notes sit on a step and what number the reader
// knows them by, what changed since the previous round, and the words the page says about status.
// No internal name (screen id, element key, note id) ever leaves this module as display text.
import type { Approval, ThreadEntry } from '../../schemas/index.js'
import type { ServerJourney, ServerState } from '../../schemas/patches.js'
import { servedNote, type UiNote } from '../notes/anchor.js'
import { screenLabel } from '../store/labels.js'
import { journeyConfirmation, screenStates } from '../store/selectors.js'

export type Change = 'new' | 'changed' | 'same'
export type Changes = {
  since: number | null
  screens: { screen: string; state: string; change: Change }[]
  journeys: { id: string; change: Change; steps: number[] }[]
}

export type Step = { index: number; sentence: string | null; screen: string; state: string }

/** `GET state`'s walkthrough additions, read without widening the frozen `ServerState` schema. */
export function changesOf(data: ServerState | null): Changes | null {
  if (!data || !('changes' in data)) return null
  const c = (data as { changes?: unknown }).changes
  if (!c || typeof c !== 'object' || !('screens' in c) || !('journeys' in c)) return null
  return c as Changes
}

export function projectTitle(data: ServerState | null): string {
  const named = data && 'projectName' in data ? (data as { projectName?: unknown }).projectName : null
  if (typeof named === 'string' && named.trim()) return named
  const id = data?.config && 'name' in data.config && typeof data.config.name === 'string' ? data.config.name : ''
  return screenLabel(id)
}

export function stepsOf(journey: ServerJourney, data: ServerState): Step[] {
  return journey.steps.map((s, index) => {
    const row = data.screens.find((sc) => sc.name === s.screen)
    const state = s.state ?? (row ? screenStates(row)[0] : undefined) ?? 'default'
    const beat = 'beat' in s && typeof s.beat === 'string' && s.beat.trim() ? s.beat.trim() : null
    return { index, sentence: beat, screen: s.screen, state }
  })
}

/** The widths the round was pushed at: the narrowest is the phone, the widest the desktop. */
export function widthsOf(data: ServerState): { phone: number; desktop: number; both: boolean } {
  const raw = data.config && 'targets' in data.config && data.config.targets ? data.config.targets.viewports : []
  const widths = raw.map((v) => Number(String(v).split('x')[0])).filter((w) => Number.isFinite(w) && w > 0)
  const phone = widths.length ? Math.min(...widths) : 390
  const desktop = widths.length ? Math.max(...widths) : 1280
  return { phone, desktop, both: phone !== desktop }
}

/** Every note the reader can see (screen notes; project notes are the owner's), in creation order,
 * each with the number the reader knows it by: 1, 2, 3 per project. */
export type NumberedNote = { note: UiNote; number: number }

export function numberedNotes(data: ServerState): NumberedNote[] {
  const notes = (data.notes.notes as UiNote[]).map(servedNote).filter((n) => !n.project && n.screen !== null)
  return notes.map((note, i) => ({ note, number: i + 1 }))
}

export function notesOnStep(all: NumberedNote[], step: Step): NumberedNote[] {
  return all.filter(({ note }) => note.screen === step.screen && (note.state ?? '') === step.state)
}

export function isWaiting(n: UiNote): boolean {
  return n.status === 'open'
}

export function statusWords(n: UiNote): string {
  if (n.status === 'open') return 'Waiting for an answer'
  if (n.status === 'answered') return 'Answered'
  return 'Done'
}

/** Who wrote a thread entry, for a client reader: themselves, or the team (the owner or the AI
 * session answering for them). */
export function authorWord(entry: ThreadEntry): string {
  return entry.by === 'client' ? 'You' : 'Team'
}

export function isOwn(n: UiNote): boolean {
  return n.thread[0]?.by === 'client'
}

export function screenChange(changes: Changes | null, step: Step): Change {
  return changes?.screens.find((s) => s.screen === step.screen && s.state === step.state)?.change ?? 'same'
}

export function sentenceChanged(changes: Changes | null, journeyId: string, index: number): boolean {
  if (!changes || changes.since === null) return false
  return changes.journeys.find((j) => j.id === journeyId)?.steps.includes(index) ?? false
}

/** "Changed since you last looked": the previous round showed this step differently — its
 * sentence, or its screen. Never on a project's first round. */
export function stepChanged(changes: Changes | null, journeyId: string, step: Step): boolean {
  if (!changes || changes.since === null) return false
  return sentenceChanged(changes, journeyId, step.index) || screenChange(changes, step) !== 'same'
}

export type Confirmation = { at: string | null; stale: boolean } | null

export function confirmationOf(journey: ServerJourney, approval: Approval): Confirmation {
  return journeyConfirmation(journey.id, journey.beats, approval)
}

/** "29 September" */
export function dayMonth(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// ---------------------------------------------------------------- the stories page (§5)

/** `actor` / `variantOf` from the push (§5), read without widening the frozen journey schema. */
export function actorOf(journey: ServerJourney): string | null {
  const v = (journey as { actor?: unknown }).actor
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function variantOf(journey: ServerJourney): string | null {
  const v = (journey as { variantOf?: unknown }).variantOf
  return typeof v === 'string' && v ? v : null
}

export type Section = 'needs' | 'unread' | 'confirmed'

/** The most urgent first. */
export const SECTIONS: { id: Section; title: string }[] = [
  { id: 'needs', title: 'Needs you' },
  { id: 'unread', title: 'Not read yet' },
  { id: 'confirmed', title: 'Confirmed' },
]

export type Mark = 'dot' | 'check' | null

/** One story's (or variant's) standing for this reader. */
export type StoryStatus = {
  section: Section
  /** The status line, in the exact words of §5. */
  words: string
  mark: Mark
  /** Confirmed at some point (fresh or stale): the tile opens the whole story. */
  confirmed: boolean
}

export function storyStatus(journey: ServerJourney, data: ServerState, all: NumberedNote[]): StoryStatus {
  const steps = stepsOf(journey, data)
  const onStory = new Map<string, UiNote>()
  for (const s of steps) for (const { note } of notesOnStep(all, s)) onStory.set(note.id, note)
  const notes = [...onStory.values()]
  // "a note of theirs has an answer they have not closed": the reader wrote it, the team answered.
  const answers = notes.filter((n) => isOwn(n) && n.status === 'answered').length
  const waiting = notes.filter(isWaiting).length
  const confirmation = confirmationOf(journey, data.approval)
  const stale = confirmation?.stale ?? false
  const confirmed = confirmation !== null

  const section: Section = stale || answers > 0 ? 'needs' : confirmed ? 'confirmed' : 'unread'
  let words: string
  let mark: Mark = null
  if (stale) {
    words = 'Changed since you confirmed'
    mark = 'dot'
  } else if (answers > 0) {
    words = plural(answers, 'answer to read', 'answers to read')
    mark = 'dot'
  } else if (waiting > 0) {
    words = plural(waiting, 'note waiting for an answer', 'notes waiting for an answer')
  } else if (confirmation) {
    words = `Confirmed on ${dayMonth(confirmation.at)}`
    mark = 'check'
  } else {
    words = wasRead(journey.id) ? 'Read, not confirmed yet' : 'Not read yet'
  }
  return { section, words, mark, confirmed }
}

const URGENCY: Record<Section, number> = { needs: 0, unread: 1, confirmed: 2 }

export function mostUrgent(sections: Section[]): Section {
  return sections.reduce((a, b) => (URGENCY[b] < URGENCY[a] ? b : a), 'confirmed')
}

/** A main story with its variants (push order). A variant whose main is missing or is itself a
 * variant (the server refuses both, so only a hand-edited row) stands as a main story. */
export type StoryGroup = { main: ServerJourney; variants: ServerJourney[] }

export function storyGroups(journeys: ServerJourney[]): StoryGroup[] {
  const byId = new Map(journeys.map((j) => [j.id, j]))
  const mainOf = (j: ServerJourney): string | null => {
    const of = variantOf(j)
    const main = of === null || of === j.id ? undefined : byId.get(of)
    return main && variantOf(main) === null ? main.id : null
  }
  const groups: StoryGroup[] = journeys.filter((j) => mainOf(j) === null).map((main) => ({ main, variants: [] }))
  for (const j of journeys) {
    const of = mainOf(j)
    if (of !== null) groups.find((g) => g.main.id === of)?.variants.push(j)
  }
  return groups
}

// ---------------------------------------------------------------- how the screen is shown (this browser)

// Remembered per browser, for every project: which width the reader looks at on a desktop, and
// how far they zoomed each one. Never synced: a zoom that suits one monitor is wrong on another.

const DEVICE_KEY = 'walkthrough:view:device'
const zoomKey = (device: 'phone' | 'desktop') => `walkthrough:view:zoom:${device}`

export function savedDevice(): 'phone' | 'desktop' {
  try {
    return localStorage.getItem(DEVICE_KEY) === 'phone' ? 'phone' : 'desktop'
  } catch {
    return 'desktop'
  }
}

export function saveDevice(device: 'phone' | 'desktop'): void {
  try {
    localStorage.setItem(DEVICE_KEY, device)
  } catch {
    // storage unavailable: the choice lasts until the page is reloaded
  }
}

export function savedZoom(device: 'phone' | 'desktop', min: number, max: number): number {
  try {
    const z = Number(localStorage.getItem(zoomKey(device)))
    return Number.isFinite(z) && z >= min && z <= max ? z : 1
  } catch {
    return 1
  }
}

export function saveZoom(device: 'phone' | 'desktop', zoom: number): void {
  try {
    if (zoom === 1) localStorage.removeItem(zoomKey(device))
    else localStorage.setItem(zoomKey(device), String(zoom))
  } catch {
    // storage unavailable: the zoom lasts until the page is reloaded
  }
}

// ---------------------------------------------------------------- "Not read yet" (this browser)

function readKey(journeyId: string): string {
  return `walkthrough:read:${location.pathname}:${journeyId}`
}

export function markRead(journeyId: string): void {
  try {
    localStorage.setItem(readKey(journeyId), '1')
  } catch {
    // storage unavailable: the list just keeps saying "Not read yet"
  }
}

export function wasRead(journeyId: string): boolean {
  try {
    return localStorage.getItem(readKey(journeyId)) === '1'
  } catch {
    return false
  }
}
