// SEED copies this file to app/src/journeys.ts verbatim (specs/20260914/01 D4). One journey per
// seed `### <journey-kebab>` block, added here as SCREENS draws it — `mock-review check --json`
// reads this array to resolve each journey's edges against real controls (D6).
export type Step = {
  screen: string
}

export type Edge = {
  from: number
  to: number
  label?: string
}

export type Journey = {
  id: string
  title: string
  steps: Step[]
  edges: Edge[]
}

export const journeys: Journey[] = [
  {
    id: 'first-visit',
    title: 'First visit',
    steps: [{ screen: 'home' }, { screen: 'account' }],
    edges: [{ from: 0, to: 1, label: 'Account' }],
  },
]
