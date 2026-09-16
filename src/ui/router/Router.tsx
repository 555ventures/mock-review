// D2: route -> ScreenPage / ComponentsPage / UnknownScreen (reference §11).
import { useMemo } from 'react'
import { ComponentsPage } from '../catalog/ComponentsPage.js'
import { AppSidebar } from '../shell/AppSidebar.js'
import { UnknownScreen } from '../shell/UnknownScreen.js'
import { ScreenPage } from '../screen/ScreenPage.js'
import { useStore } from '../store/store.js'
import { useRoute } from './route.js'

const EMPTY_SCREENS: string[] = []

export function Router() {
  // `useSyncExternalStore` requires a referentially stable snapshot per unchanged state — the
  // selector reads the raw `data` object only, and the derived name list is memoised separately
  // (a `.map()` inside the selector itself would return a new array every render and force React
  // into an infinite re-render loop).
  const data = useStore((s) => s.data)
  const screenRows = useStore((s) => s.data?.screens)
  const screens = useMemo(() => screenRows?.map((sc) => sc.name) ?? EMPTY_SCREENS, [screenRows])
  const route = useRoute(screens)

  // Before the first `fetchState()` resolves, `screens` is empty and a direct load of e.g.
  // `#/home` would parse against that empty list and render the unknown-screen fallback for one
  // frame before the real screen list arrives and corrects it. Render nothing until the screen
  // list is actually known, rather than a wrong verdict that self-corrects a moment later.
  if (!data) return null

  return (
    <>
      <AppSidebar route={route} />
      {route.kind === 'components' ? (
        <ComponentsPage selected={route.c ?? null} from={route.from ?? null} />
      ) : route.kind === 'screen' ? (
        <ScreenPage route={route} />
      ) : (
        <UnknownScreen path={route.path} screens={screens} />
      )}
    </>
  )
}
