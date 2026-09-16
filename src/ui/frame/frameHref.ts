// D8/D17: the frame URL grammar and rule 16 (a state/scheme change replaces the frame's hash — it
// never reloads the iframe). D10: a theme pick DOES reload the frame (the frame entry only reads
// `approval.theme` once, at script load) — `theme` is folded into the query string so `src`
// actually changes and the browser reloads the iframe document.
export function frameSrc(screen: string, state: string, theme?: string | null): string {
  // The theme marker must sit in the URL's real search params, not the hash fragment: a
  // hash-only change is a same-document navigation and does not reload the iframe (needed so a
  // theme pick actually re-runs the frame entry's one-time `applyStyles()`, D10).
  const themeParam = theme ? `&_theme=${encodeURIComponent(theme)}` : ''
  return `/?frame=1${themeParam}#/${screen}?state=${encodeURIComponent(state)}`
}

/** Replaces the frame's hash with the FULL url (never a bare `#...`, which would resolve against
 * the reviewer's own URL and load the whole reviewer inside the frame). */
export function replaceFrameHash(win: Window, screen: string, state: string, scheme?: 'dark'): void {
  const hash = `#/${screen}?state=${encodeURIComponent(state)}${scheme ? `&scheme=${scheme}` : ''}`
  if (win.location.hash === hash) return
  win.location.replace(win.location.pathname + win.location.search + hash)
}
