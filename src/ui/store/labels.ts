// D3: labels never show raw ids (reference rule 35). screenLabel Title-Cases a screen id
// (dashes/underscores/spaces split, camel humps split); stateLabel sentence-cases the state key;
// stepLabel joins them with an en dash.
function splitWords(id: string): string[] {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .flatMap((word) => word.split(/(?<=[a-z0-9])(?=[A-Z])/))
}

export function screenLabel(id: string): string {
  return splitWords(id)
    .map((w) => (w.length > 0 ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function stateLabel(state: string): string {
  if (state.length === 0) return state
  const words = state.split(/(?<=[a-z0-9])(?=[A-Z])/)
  const joined = words.join(' ').toLowerCase()
  return (joined[0]?.toUpperCase() ?? '') + joined.slice(1)
}

export function stepLabel(screen: string, state: string): string {
  return `${screenLabel(screen)} – ${stateLabel(state)}`
}
