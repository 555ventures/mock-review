// Reference §9/D11: the ⌘K command palette. Client role hides the Components group and Actions.
import { useEffect } from 'react'
import { Blocks, LayoutGrid, Monitor, PanelRight, Route, SquareDashedMousePointer } from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../components/ui/command.js'
import { componentsHref, href } from '../router/route.js'
import { screenLabel, stateLabel, stepLabel } from '../store/labels.js'
import { screenStates } from '../store/selectors.js'
import { getStore, useStore } from '../store/store.js'

export function isPaletteKey(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
}

export function CommandPalette({
  onMark,
  onToggleNotes,
}: {
  onMark?: (() => void) | undefined
  onToggleNotes?: (() => void) | undefined
}) {
  const data = useStore((s) => s.data)
  const paletteOpen = useStore((s) => s.ui.paletteOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteKey(e)) {
        e.preventDefault()
        getStore().setUi((ui) => ({ paletteOpen: !ui.paletteOpen }))
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const setOpen = (open: boolean) => getStore().setUi({ paletteOpen: open })
  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }
  const nav = (h: string) => run(() => (location.hash = h))

  const screens = data?.screens ?? []
  const journeys = data?.journeys ?? []
  const role = data?.role ?? 'owner'
  const components = data?.inventory ?? []

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setOpen} title="Search" description="Jump to a screen, state or journey, or run an action.">
      <Command>
        <CommandInput placeholder="Search screens, states, journeys…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Screens">
            {screens.flatMap((s) => [
              <CommandItem key={s.name} value={`${screenLabel(s.name)} ${s.name}`} keywords={[s.name]} onSelect={() => nav(href({ kind: 'screen', screen: s.name }))}>
                <Monitor />
                {screenLabel(s.name)}
              </CommandItem>,
              ...screenStates(s).map((st) => (
                <CommandItem
                  key={`${s.name}:${st}`}
                  value={`${stepLabel(s.name, st)} ${s.name} ${st}`}
                  keywords={[s.name, st, stateLabel(st)]}
                  onSelect={() => nav(href({ kind: 'screen', screen: s.name, state: st }))}
                >
                  {stepLabel(s.name, st)}
                </CommandItem>
              )),
            ])}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Journeys">
            {journeys.flatMap((j) => [
              <CommandItem
                key={j.id}
                value={`${j.title} ${j.id}`}
                keywords={j.persona ? [j.id, j.persona] : [j.id]}
                onSelect={() =>
                  run(() => {
                    getStore().setUi({ guideOn: true })
                    location.hash = href({ kind: 'screen', screen: j.steps[0]?.screen ?? '', state: j.steps[0]?.state, journey: j.id, step: 0 })
                  })
                }
              >
                <Route />
                {j.title}
              </CommandItem>,
              ...j.steps.map((s, i) => (
                <CommandItem
                  key={`${j.id}:${i}`}
                  value={`${j.title} ${i + 1} · ${stepLabel(s.screen, s.state ?? '')} ${j.id}-${i}`}
                  keywords={[j.id, s.screen, s.state ?? '', screenLabel(s.screen)]}
                  onSelect={() => nav(href({ kind: 'screen', screen: s.screen, state: s.state, journey: j.id, step: i }))}
                >
                  {j.title} {i + 1} · {stepLabel(s.screen, s.state ?? '')}
                </CommandItem>
              )),
            ])}
          </CommandGroup>
          {role === 'owner' && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Components">
                {components.map((c) => (
                  <CommandItem key={c.name} value={`${c.name}`} keywords={[c.name]} onSelect={() => nav(componentsHref(c.name))}>
                    <Blocks />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem value="Components" onSelect={() => nav(componentsHref())}>
                  <LayoutGrid />
                  Components
                </CommandItem>
                {onMark && (
                  <CommandItem value="Mark an area" onSelect={() => run(onMark)}>
                    <SquareDashedMousePointer />
                    Mark an area
                  </CommandItem>
                )}
                {onToggleNotes && (
                  <CommandItem value="Toggle notes panel" onSelect={() => run(onToggleNotes)}>
                    <PanelRight />
                    Toggle notes panel
                  </CommandItem>
                )}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
