// SEED copies this file to app/src/journeys.ts verbatim (specs/20260914/01 D4). One journey per
// seed `### <journey-kebab>` block, added here as SCREENS draws it — `mock-review check --json`
// reads this array to resolve each journey's edges against real controls (D6), and the driver's
// `journey-drawn` mark refuses unless every step's `screen`/`beat`/`state` equals the seed's own
// beats verbatim (specs/20260917/02-the-story-travels.md D13, mirroring the plugin template).
export type Step = {
  screen: string
  beat: string
  state?: string
}

export type Edge = {
  from: number
  to: number
  label?: string
  say?: string
}

export type Journey = {
  id: string
  title: string
  persona?: string
  steps: Step[]
  edges: Edge[]
}

export const journeys: Journey[] = [
  {
    id: 'first-visit',
    title: 'First visit',
    persona: 'a new customer',
    steps: [
      { screen: 'home', beat: 'I open the app' },
      { screen: 'account', beat: 'I land on my account', state: 'default' },
    ],
    edges: [{ from: 0, to: 1, label: 'Account', say: 'I tap Account' }],
  },
]
