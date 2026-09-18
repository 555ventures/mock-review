// D7 + reference §13 rules 2-5: pure tone derivations over the store's data. No non-null
// assertions anywhere in this module (AC-20260915-02-4 greps for the operator, spelled out here
// as "bang dot" so this very comment does not trip the check).
import type { Approval, JourneyConversation, Note } from '../../schemas/index.js'
import { resolveStates } from '../../ui/frame/stateKey.js'

export type Tone = 'open' | 'answered' | 'approved'

/** D21: journey `Step.state` (authored in `meta.states` casing, D4) is normalised server-side to
 * its case-matched example key, and the page's own state list is always the example keys (D21,
 * `statesOf` below) — so nothing downstream ever compares two different casings of the same
 * state. Strict equality is correct once both sides are guaranteed to already agree. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  return a === b
}

/** Rule 2 (amended 2026-09-17): worst-of over the lifecycle. `null` means the list is EMPTY —
 * never "nothing pending". Any status that is not `open`/`answered` counts as closed, so a
 * status added later (`deferred`, spec 02) needs no new branch here — it is not `open` and not
 * `answered`, so it lands in the closed bucket, which is why D10 retires spec 02's explicit
 * deferred line rather than keeping both. */
export function worst(notes: readonly Note[]): Tone | null {
  if (notes.length === 0) return null
  if (notes.some((n) => n.status === 'open')) return 'open'
  if (notes.some((n) => n.status === 'answered')) return 'answered'
  return 'approved'
}

/** Rule 3 (amended): worst-of this screen's notes; with no notes at all, `approved` when the
 * owner explicitly approved the screen, else `null` (no dot). */
export function screenTone(name: string, notes: readonly Note[], approval: Approval): Tone | null {
  const w = worst(notes.filter((n) => n.screen === name))
  if (w) return w
  return name in approval.screens ? 'approved' : null
}

/** Rule 4 (amended): worst-of that state's notes; an all-approved state is `approved`, an empty
 * one is `null`. */
export function stateTone(screen: string, state: string, notes: readonly Note[]): Tone | null {
  return worst(notes.filter((n) => n.screen === screen && sameState(n.state, state)))
}

/** Rule 5 (amended): a journey's own conversation status, and nothing else. `null` when the
 * journey has no conversation entry. Never reads `approval.journeys`; never aggregates the notes
 * of the screens its steps visit. D9: `deferred` is a fourth PIN tone owned by `notes-ui.tsx`'s
 * `TONE` table, not a widened aggregate `Tone` — the aggregate stays at three members, so a
 * `deferred` conversation collapses to `approved` here, inline, now that `toneOf` is gone. */
export function journeyTone(id: string, journeys: Record<string, JourneyConversation>): Tone | null {
  const conv = journeys[id]
  if (!conv) return null
  return conv.status === 'deferred' ? 'approved' : conv.status
}

/** Every note anchored to `screen`, any state (the notes panel's "THIS SCREEN" group). */
export function notesHere(screen: string, notes: readonly Note[]): Note[] {
  return notes.filter((n) => n.screen === screen)
}

/** D1: the notes panel's PROJECT group — product-wide notes only, screen-independent. Replaces
 * `notesRest`, which selected "every note not on this screen". */
export function projectNotes(notes: readonly Note[]): Note[] {
  return notes.filter((n) => n.project === true)
}

/** D3/D16: the duck-typed screen-module shape (`meta.states` + `examples`) — `Object.keys(examples)`
 * ordered `meta.states` first (resolved by the D4 rule in `resolveStates`: exact match, then a
 * unique normalised match; an ambiguous state contributes nothing here), any example key not
 * claimed by a state after, in declaration order. */
export function statesOf(screen: { meta?: { states?: string[] }; examples?: Record<string, unknown> }): string[] {
  const metaStates = screen.meta?.states ?? []
  const exampleKeys = Object.keys(screen.examples ?? {})
  const { byState } = resolveStates(metaStates, exampleKeys)
  const ordered: string[] = []
  const used = new Set<string>()
  for (const m of metaStates) {
    const match = byState.get(m)
    if (match && !used.has(match)) {
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
