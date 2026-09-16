// Reference §1: left sidebar — navigation only, one list at a time (Journeys | Screens).
import { useEffect } from 'react'
import { LayoutGrid, Monitor, Route as RouteIcon, Search } from 'lucide-react'
import { Kbd, KbdGroup } from '../components/ui/kbd.js'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '../components/ui/sidebar.js'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js'
import { StatusDot } from '../notes/notes-ui.js'
import { componentsHref, href, type Route } from '../router/route.js'
import { screenLabel, stateLabel } from '../store/labels.js'
import { journeyTone, screenStates, screenTone, stateTone } from '../store/selectors.js'
import { locate } from '../journeys/locate.js'
import { getStore, useStore } from '../store/store.js'
import type { SideTab } from '../prefs.js'

export function AppSidebar({ route }: { route: Route }) {
  const data = useStore((s) => s.data)
  const ui = useStore((s) => s.ui)

  const notes = data?.notes.notes ?? []
  const journeysConv = data?.notes.journeys ?? {}
  const approval = data?.approval ?? { contractVersion: 1 as const, screens: {}, journeys: {}, theme: null }
  const journeys = data?.journeys ?? []
  const screens = data?.screens ?? []
  const role = data?.role ?? 'owner'

  const screenStateRows = screens.map((s) => ({ name: s.name, states: screenStates(s) }))
  const defaultStateOf = (screen: string): string => screenStateRows.find((s) => s.name === screen)?.states[0] ?? ''
  const stepState = (s: { screen: string; state?: string | undefined }): string => s.state ?? defaultStateOf(s.screen)

  const curScreen = route.kind === 'screen' ? route.screen : ''
  const curState = route.kind === 'screen' ? (route.state ?? defaultStateOf(curScreen) ?? 'default') : ''
  const curJourneyId = route.kind === 'screen' ? route.journey : undefined
  const curStep = route.kind === 'screen' ? route.step : undefined

  const activeJourney = journeys.find((j) => j.id === curJourneyId)
  const activeIdx = activeJourney ? (locate(activeJourney, curScreen, curState, screenStateRows, curStep) ?? -1) : -1

  useEffect(() => {
    if (activeJourney) setUiSideTab('journeys')
  }, [activeJourney?.id])

  function setUiSideTab(t: SideTab) {
    getStore().setUi({ sideTab: t })
  }

  const stateHref = (screen: string, state: string): string => {
    const i = activeJourney ? activeJourney.steps.findIndex((s) => s.screen === screen && stepState(s) === state) : -1
    if (activeJourney && i >= 0) return href({ kind: 'screen', screen, state, journey: activeJourney.id, step: i })
    return href({ kind: 'screen', screen, state })
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="group-data-[collapsible=icon]:hidden">
        <Tabs value={ui.sideTab} onValueChange={(v) => setUiSideTab(v as SideTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="journeys">Journeys</TabsTrigger>
            <TabsTrigger value="screens">Screens</TabsTrigger>
          </TabsList>
        </Tabs>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {ui.sideTab === 'journeys' ? (
            <SidebarMenu>
              {journeys.map((j) => {
                const on = activeJourney?.id === j.id
                return (
                  <SidebarMenuItem key={j.id}>
                    <SidebarMenuButton asChild tooltip={j.persona} isActive={on && activeIdx < 0}>
                      <a
                        href={href({ kind: 'screen', screen: j.steps[0]?.screen ?? '', state: j.steps[0]?.state, journey: j.id, step: 0 })}
                        title={j.persona}
                        onClick={() => getStore().setUi({ guideOn: true })}
                      >
                        <RouteIcon />
                        <span>{j.title}</span>
                      </a>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      <StatusDot tone={journeyTone(j.id, journeysConv)} />
                    </SidebarMenuBadge>
                    {on && (
                      <SidebarMenuSub className="mr-0 gap-0.5 pr-0">
                        {j.steps.map((s, i) => {
                          const state = stepState(s)
                          return (
                            <SidebarMenuSubItem key={i}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={activeIdx === i}
                                className="pr-6 data-active:bg-transparent data-active:font-medium"
                              >
                                <a href={href({ kind: 'screen', screen: s.screen, state, journey: j.id, step: i })}>
                                  <span className="min-w-0 flex-1 truncate">
                                    {screenLabel(s.screen)} – {stateLabel(state)}
                                  </span>
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          ) : (
            <SidebarMenu>
              {screens.map((screen) => {
                const on = curScreen === screen.name
                return (
                  <SidebarMenuItem key={screen.name}>
                    <SidebarMenuButton asChild tooltip={screenLabel(screen.name)} isActive={on}>
                      <a href={href({ kind: 'screen', screen: screen.name })}>
                        <Monitor />
                        <span>{screenLabel(screen.name)}</span>
                      </a>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      <StatusDot tone={screenTone(screen.name, notes, approval)} />
                    </SidebarMenuBadge>
                    {on && (
                      <SidebarMenuSub className="mr-0 gap-0.5 pr-0">
                        {screenStates(screen).map((s) => {
                          const tone = stateTone(screen.name, s, notes)
                          return (
                            <SidebarMenuSubItem key={s}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={curState === s}
                                className="pr-6 data-active:bg-transparent data-active:font-medium"
                              >
                                <a href={stateHref(screen.name, s)}>
                                  <span className="min-w-0 flex-1 truncate">{stateLabel(s)}</span>
                                </a>
                              </SidebarMenuSubButton>
                              {tone && (
                                <span className="pointer-events-none absolute top-1/2 right-1 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center">
                                  <StatusDot tone={tone} />
                                </span>
                              )}
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {role === 'owner' && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Components" isActive={route.kind === 'components'}>
                <a href={componentsHref(null, screens.some((s) => s.name === curScreen) ? curScreen : null)}>
                  <LayoutGrid />
                  <span>Components</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {role === 'owner' && (
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                tooltip="Search (⌘K)"
                className="text-muted-foreground"
                onClick={() => getStore().setUi({ paletteOpen: true })}
              >
                <Search />
                <span>Search</span>
                <KbdGroup className="ml-auto group-data-[collapsible=icon]:hidden">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

