// D7 + reference §13 rules 2-5: pure tone derivations over the store's data. No non-null
// assertions anywhere in this module (AC-20260915-02-4 greps for the operator, spelled out here
// as "bang dot" so this very comment does not trip the check).
import type { Approval, JourneyConversation, Note } from '../../schemas/index.js'

export type Tone = 'open' | 'answered' | 'approved'

/** D21: journey `Step.state` (authored in `meta.states` casing, D4) is normalised server-side to
 * its case-matched example key, and the page's own state list is always the example keys (D21,
 * `statesOf` below) — so nothing downstream ever compares two different casings of the same
 * state. Strict equality is correct once both sides are guaranteed to already agree. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  return a === b
}

/** Rule 2: worst-of — open beats answered beats nothing pending. */
export function worst(notes: readonly Note[]): Tone | null {
  if (notes.some((n) => n.status === 'open')) return 'open'
  if (notes.some((n) => n.status === 'answered')) return 'answered'
  return null
}

/** Rule 3: a screen's tone is worst-of its notes across every state; with nothing pending it is
 * `approved` only once `approval.screens[name]` exists, else `answered`. */
export function screenTone(name: string, notes: readonly Note[], approval: Approval): Tone {
  const w = worst(notes.filter((n) => n.screen === name))
  if (w) return w
  return name in approval.screens ? 'approved' : 'answered'
}

/** Rule 4: a state's tone is worst-of its notes, with no approval concept — nothing pending means
 * no dot at all. */
export function stateTone(screen: string, state: string, notes: readonly Note[]): Tone | null {
  return worst(notes.filter((n) => n.screen === screen && sameState(n.state, state)))
}

/** Rule 5: a journey with no conversation entry defaults to `answered`. */
export function journeyTone(id: string, journeys: Record<string, JourneyConversation>): Tone {
  return journeys[id]?.status ?? 'answered'
}

/** Every note anchored to `screen`, any state (the notes panel's "THIS SCREEN" group). */
export function notesHere(screen: string, notes: readonly Note[]): Note[] {
  return notes.filter((n) => n.screen === screen)
}

/** Every note not anchored to `screen` — everything else in the project, including project notes
 * (the notes panel's "PROJECT" group). */
export function notesRest(screen: string, notes: readonly Note[]): Note[] {
  return notes.filter((n) => n.screen !== screen)
}

/** D3/D16: the duck-typed screen-module shape (`meta.states` + `examples`) — `Object.keys(examples)`
 * ordered `meta.states` first (case-matched), any example key not named in `meta.states` after. */
export function statesOf(screen: { meta?: { states?: string[] }; examples?: Record<string, unknown> }): string[] {
  const metaStates = screen.meta?.states ?? []
  const exampleKeys = Object.keys(screen.examples ?? {})
  const ordered: string[] = []
  const used = new Set<string>()
  for (const m of metaStates) {
    const match = exampleKeys.find((k) => k.toLowerCase() === m.toLowerCase() && !used.has(k))
    if (match) {
      ordered.push(match)
      used.add(match)
    }
  }
  for (const k of exampleKeys) {
    if (!used.has(k)) ordered.push(k)
  }
  return ordered
}

/** D21: the page's actual state list for a `ServerState.screens[]` row. The row itself carries
 * `states` (the raw `meta.states` entries) and `examples` (the screen module's example keys,
 * D21) as flat arrays; this adapts that shape into `statesOf`'s duck-typed module shape so every
 * call site (`ScreenPage`, `AppSidebar`, `CommandPalette`) derives the same ordered example-key
 * list instead of the raw `meta.states` order. */
export function screenStates(row: { states: readonly string[]; examples: readonly string[] }): string[] {
  return statesOf({
    meta: { states: [...row.states] },
    examples: Object.fromEntries(row.examples.map((e) => [e, true])),
  })
}
