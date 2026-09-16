// Reference §2: screen-mode top bar. D10: the theme Select, gated on the host having themes.
import { ChevronDown, Columns2, Monitor, PanelRight, Smartphone, SquareDashedMousePointer } from 'lucide-react'
import { Kbd } from '../components/ui/kbd.js'
import { Badge } from '../components/ui/badge.js'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb.js'
import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js'
import { Separator } from '../components/ui/separator.js'
import { SidebarTrigger } from '../components/ui/sidebar.js'
import { Toggle } from '../components/ui/toggle.js'
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip.js'
import { href } from '../router/route.js'
import { screenLabel, stateLabel, stepLabel } from '../store/labels.js'
import type { ViewMode } from '../prefs.js'

export type JourneyBreadcrumb = {
  title: string
  journeyId: string
  idx: number
  total: number
  step0Screen: string
  step0State?: string | undefined
}

export function TopBar({
  screen,
  state,
  states,
  countInState,
  journey,
  view,
  onViewChange,
  reanchorId,
  marking,
  onMarkingChange,
  showNotes,
  onShowNotesChange,
  notesOnScreenCount,
  themes,
  currentTheme,
  onThemeChange,
  onOpenInScreens,
  hasMobile,
}: {
  screen: string
  state: string
  states: string[]
  countInState: (s: string) => number
  journey: JourneyBreadcrumb | null
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  hasMobile: boolean
  reanchorId: string | null
  marking: boolean
  onMarkingChange: (v: boolean) => void
  showNotes: boolean
  onShowNotesChange: (v: boolean) => void
  notesOnScreenCount: number
  themes: string[]
  currentTheme: string | null
  onThemeChange: (key: string) => void
  onOpenInScreens: () => void
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
      <div className="min-w-0 flex-1">
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            {journey ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={href({ kind: 'screen', screen: journey.step0Screen, state: journey.step0State, journey: journey.journeyId, step: 0 })}
                    className="line-clamp-1"
                  >
                    {journey.title}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="whitespace-nowrap">
                    <span className="text-muted-foreground">
                      Step {journey.idx + 1} of {journey.total} ·{' '}
                    </span>
                    {stepLabel(screen, state)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink href={href({ kind: 'screen', screen })} className="line-clamp-1">
                    {screenLabel(screen)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1 whitespace-nowrap">
                      <BreadcrumbPage>{stateLabel(state)}</BreadcrumbPage>
                      <ChevronDown className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={state} onValueChange={(s) => (location.hash = href({ kind: 'screen', screen, state: s }))}>
                        {states.map((s) => {
                          const c = countInState(s)
                          return (
                            <DropdownMenuRadioItem key={s} value={s}>
                              {stateLabel(s)}
                              {c > 0 && <Badge variant="secondary" className="ml-auto">{c}</Badge>}
                            </DropdownMenuRadioItem>
                          )
                        })}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {themes.length > 0 && (
          <Select {...(currentTheme ? { value: currentTheme } : {})} onValueChange={onThemeChange}>
            <SelectTrigger size="sm" aria-label="Theme">
              <SelectValue placeholder="Theme" />
            </SelectTrigger>
            <SelectContent position="popper">
              {themes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={view} onValueChange={(v) => v && onViewChange(v as ViewMode)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="desktop" aria-label="Desktop">
                <Monitor />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Desktop</TooltipContent>
          </Tooltip>
          {hasMobile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem value="mobile" aria-label="Mobile">
                  <Smartphone />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>Mobile</TooltipContent>
            </Tooltip>
          )}
          {hasMobile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem value="both" aria-label="Both">
                  <Columns2 />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>Both</TooltipContent>
            </Tooltip>
          )}
        </ToggleGroup>
        {reanchorId && (
          <span className="text-sm whitespace-nowrap text-muted-foreground">
            Re-anchoring {reanchorId}: draw the new area · Esc cancels
          </span>
        )}
        {journey ? (
          <Button variant="outline" size="sm" asChild>
            <a href={href({ kind: 'screen', screen, state })} onClick={onOpenInScreens}>
              <Monitor /> Open in Screens
            </a>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle variant="outline" size="sm" pressed={marking} onPressedChange={onMarkingChange} aria-label="Mark an area">
                <SquareDashedMousePointer /> Mark an area <Kbd>M</Kbd>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Drag over the mock to note an area · Esc exits</TooltipContent>
          </Tooltip>
        )}
        <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-auto" />
        <Toggle variant="outline" size="sm" pressed={showNotes} onPressedChange={onShowNotesChange}>
          <PanelRight /> Notes{!journey && <Badge variant="secondary">{notesOnScreenCount}</Badge>}
        </Toggle>
      </div>
    </header>
  )
}
