// D4/D16/rule 29: the journey pill's hint text and step location. `locate` trusts the `step`
// param only when that step really is the current screen+state; otherwise it finds the first
// matching step (a stateless step resolves to the screen's first state, D4's default), or
// returns `undefined` when nothing matches.
export type LocateEdge = { from: number; to: number; label?: string | undefined; say?: string | undefined }
export type LocateStep = { screen: string; state?: string | undefined }
export type LocateJourney = { steps: LocateStep[] }
export type ScreenStates = { name: string; states: string[] }

export function hintFor(edge: LocateEdge): string {
  return edge.say ?? edge.label ?? ''
}

function stateOf(step: LocateStep, screens: readonly ScreenStates[]): string | undefined {
  if (step.state !== undefined) return step.state
  const screen = screens.find((s) => s.name === step.screen)
  return screen?.states[0]
}

export function locate(
  journey: LocateJourney,
  screen: string,
  state: string,
  screens: readonly ScreenStates[],
  step?: number,
): number | undefined {
  const matches = (i: number): boolean => {
    const s = journey.steps[i]
    if (!s) return false
    return s.screen === screen && stateOf(s, screens) === state
  }

  if (step !== undefined && matches(step)) return step

  const idx = journey.steps.findIndex((_, i) => matches(i))
  return idx === -1 ? undefined : idx
}
