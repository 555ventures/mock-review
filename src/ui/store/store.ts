// D2: one store — `createStore()` + `useStore(selector)` over a `useSyncExternalStore`
// subscription. Holds the server's `ServerState` (`data`) plus chrome/UI state that never leaves
// the browser (`ui`). No file writes happen here — every notes/approval mutation goes out through
// `sync/api.ts` and comes back in as a fresh `ServerState` (Behavior section).
import { useSyncExternalStore } from 'react'
import type { ServerState } from '../../schemas/patches.js'
import { getGuideOn, getSideTab, getView, setGuideOn, setSideTab, setView, type SideTab, type ViewMode } from '../prefs.js'

export type Draft = {
  viewport: 'desktop' | 'mobile'
  box: { left: number; top: number; width: number; height: number }
  text: string
  open: boolean
  whole?: boolean
  about?: 'project'
}

export type UiState = {
  view: ViewMode
  sideTab: SideTab
  guideOn: boolean
  marking: boolean
  reanchor: string | null
  selected: string | null
  cardOpen: boolean
  draft: Draft | null
  showNotes: boolean
  paletteOpen: boolean
}

export type State = {
  data: ServerState | null
  ui: UiState
  // D24: `GET state` answered 403 — the owner changed `config.client.token` (or this browser
  // otherwise stopped qualifying as `client`/loopback `owner`) while this tab was open. Distinct
  // from `data: null` (still loading, or a transient fetch failure the next SSE event retries).
  forbidden: boolean
}

const EMPTY_STATE: ServerState = {
  screens: [],
  shells: [],
  journeys: [],
  themes: [],
  config: { name: null, port: null, targets: null, theme: null, client: null },
  inventory: [],
  violations: [],
  notes: { contractVersion: 1, notes: [], journeys: {} },
  approval: { contractVersion: 1, screens: {}, journeys: {}, theme: null },
  role: 'owner',
}

export { EMPTY_STATE }

function initialUi(): UiState {
  return {
    view: getView(),
    sideTab: getSideTab(),
    guideOn: getGuideOn(),
    marking: false,
    reanchor: null,
    selected: null,
    cardOpen: false,
    draft: null,
    showNotes: true,
    paletteOpen: false,
  }
}

export type Store = {
  getState: () => State
  subscribe: (listener: () => void) => () => void
  setData: (data: ServerState, seq: number) => void
  setForbidden: () => void
  setUi: (patch: Partial<UiState> | ((ui: UiState) => Partial<UiState>)) => void
}

export function createStore(): Store {
  let state: State = { data: null, ui: initialUi(), forbidden: false }
  const listeners = new Set<() => void>()
  // D26: the highest `sync/api.ts` `fetchState` request number applied so far. The action path
  // (`useNoteActions` -> patch -> refresh) and the SSE path (`main.tsx` -> refetch) both call
  // `setData` and can resolve in either order; `seq` reflects issue order (assigned when the
  // request is sent, not when it resolves), so a response older than the newest already applied
  // is dropped instead of silently overwriting fresher data with stale data.
  let latestSeq = 0

  const notify = () => {
    for (const l of listeners) l()
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setData: (data, seq) => {
      if (seq < latestSeq) return
      latestSeq = seq
      state = { ...state, data, forbidden: false }
      notify()
    },
    setForbidden: () => {
      if (state.forbidden) return
      state = { ...state, forbidden: true }
      notify()
    },
    setUi: (patch) => {
      const resolved = typeof patch === 'function' ? patch(state.ui) : patch
      state = { ...state, ui: { ...state.ui, ...resolved } }
      // D2/rule 31: `view`, `sideTab` and `guideOn` are the three prefs the reference persists
      // across a reload — every path that changes them goes through this one store update, so
      // this is the one place that needs to call back out to `prefs.ts`.
      if (resolved.view !== undefined) setView(resolved.view)
      if (resolved.sideTab !== undefined) setSideTab(resolved.sideTab)
      if (resolved.guideOn !== undefined) setGuideOn(resolved.guideOn)
      notify()
    },
  }
}

let singleton: Store | null = null

/** The one store instance for the page (mounted once in `main.tsx`). */
export function getStore(): Store {
  if (!singleton) singleton = createStore()
  return singleton
}

export function useStore<T>(selector: (state: State) => T): T {
  const store = getStore()
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  )
}
