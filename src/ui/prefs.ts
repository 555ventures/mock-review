// D2: the single sessionStorage accessor. Every access is wrapped (private-mode browsers throw on
// sessionStorage access), and the three keys the reference persists (`guide-off`, `view`,
// `side-tab`) are the only keys this module ever touches (rule 31). The palette's open state is
// deliberately not persisted (rule 31).
export type ViewMode = 'desktop' | 'mobile' | 'both'
export type SideTab = 'journeys' | 'screens'

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // private mode, or sessionStorage disabled — the pref just doesn't persist this session.
  }
}

export function getGuideOn(): boolean {
  return read('guide-off') !== '1'
}

export function setGuideOn(on: boolean): void {
  write('guide-off', on ? '0' : '1')
}

/** D18a: the default view stays the prototype's `desktop` (reference §2, `store.tsx:101-104`) —
 * AC-14 was amended to check both captions after choosing Both rather than pinning them on load. */
export function getView(): ViewMode {
  const v = read('view')
  return v === 'mobile' || v === 'both' ? v : 'desktop'
}

export function setView(v: ViewMode): void {
  write('view', v)
}

export function getSideTab(): SideTab {
  return read('side-tab') === 'screens' ? 'screens' : 'journeys'
}

export function setSideTab(t: SideTab): void {
  write('side-tab', t)
}
