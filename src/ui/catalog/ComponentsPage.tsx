// Reference §10: a catalog of every project component/shell the mocks use, with live isolated
// previews. Only the project's own components and shells — never shadcn primitives (the
// inventory is already built that way, D11 of spec 01).
//
// D18(b): `ServerState.inventory[]` rows carry the module's own `examples` keys, so both project
// components and shells drive the "Live preview" example picker from `ServerInventoryRow.examples`
// directly (no more falling back to a synthetic `['Default']`).
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js'
import { Badge } from '../components/ui/badge.js'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '../components/ui/breadcrumb.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../components/ui/input-group.js'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '../components/ui/item.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js'
import { Separator } from '../components/ui/separator.js'
import { SidebarInset, SidebarTrigger } from '../components/ui/sidebar.js'
import { CommandPalette } from '../shell/CommandPalette.js'
import { componentsHref, href } from '../router/route.js'
import { screenLabel, stateLabel } from '../store/labels.js'
import { useStore } from '../store/store.js'
import { Preview } from './Preview.js'
import type { ServerInventoryRow } from '../../schemas/patches.js'

const LAYER_LABEL = { component: 'Project', shell: 'App shell' } as const
const LAYERS: { kind: 'shell' | 'component'; title: string }[] = [
  { kind: 'shell', title: 'App shell' },
  { kind: 'component', title: 'Project components' },
]

export function ComponentsPage({ selected, from }: { selected: string | null; from: string | null }) {
  const data = useStore((s) => s.data)
  const [query, setQuery] = useState('')
  const [example, setExample] = useState<string | null>(null)
  useEffect(() => setExample(null), [selected])

  const inventory: ServerInventoryRow[] = data?.inventory ?? []
  const screens = data?.screens ?? []
  const violations = data?.violations ?? []
  const theme = data?.approval.theme ?? null

  const byName = (name: string) => inventory.find((c) => c.name === name)
  const sel = selected && byName(selected) ? selected : null
  const q = query.trim().toLowerCase()
  const visible = inventory.filter((c) => (!from || c.usedOn.includes(from)) && (!q || c.name.toLowerCase().includes(q)))

  const selRow = sel ? byName(sel) : undefined
  const examples = selRow?.examples ?? []
  const ex = example && examples.includes(example) ? example : examples[0]
  const usedOn = selRow?.usedOn ?? []

  return (
    <SidebarInset className="min-w-0 md:h-svh md:overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {sel ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink href={componentsHref(null, from)}>Components</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="line-clamp-1">{sel}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>Components</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex flex-col gap-4 border-b p-4 md:w-80 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search components…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </InputGroup>
          {from && (
            <Badge variant="secondary" className="self-start" asChild>
              <a href={componentsHref(sel)}>
                On {screenLabel(from)} <X />
              </a>
            </Badge>
          )}
          {violations.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Layer violations</AlertTitle>
              <AlertDescription>{violations.join(' · ')}</AlertDescription>
            </Alert>
          )}
          {LAYERS.map(({ kind, title }) => {
            const rows = visible.filter((c) => c.kind === kind)
            if (!rows.length) return null
            return (
              <div key={kind} className="flex flex-col gap-2">
                <p className="text-sm font-medium">{title}</p>
                <ItemGroup className="gap-1">
                  {rows.map((c) => (
                    <Item key={c.name} size="sm" variant={sel === c.name ? 'muted' : 'outline'} asChild>
                      <a href={componentsHref(c.name, from)}>
                        <ItemContent>
                          <ItemTitle>{c.name}</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <Badge variant="secondary">{c.usedOn.length}</Badge>
                        </ItemActions>
                      </a>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            )
          })}
          {visible.length === 0 && <p className="text-sm text-muted-foreground">No components match.</p>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-6 p-6 md:overflow-y-auto">
          {!sel || !selRow ? (
            <p className="text-muted-foreground">Select a component to see where it is used.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{sel}</h1>
                <Badge variant="outline">{LAYER_LABEL[selRow.kind]}</Badge>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Live preview</p>
                  {examples.length > 1 && (
                    <Select {...(ex ? { value: ex } : {})} onValueChange={setExample}>
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {examples.map((e) => (
                          <SelectItem key={e} value={e}>
                            {e}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Card>
                  <CardContent>
                    {ex ? (
                      <Preview key={sel} name={sel} example={ex} shell={selRow.kind === 'shell'} theme={theme} />
                    ) : (
                      <p className="text-sm text-muted-foreground">No preview</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Used on</p>
                {usedOn.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No screen</p>
                ) : (
                  <ItemGroup className="gap-1">
                    {usedOn.map((s) => {
                      const screenStates = screens.find((sc) => sc.name === s)?.states ?? []
                      return (
                        <Item key={s} size="sm" variant="outline">
                          <ItemContent>
                            <ItemTitle>
                              <a href={href({ kind: 'screen', screen: s })} className="hover:underline">
                                {screenLabel(s)}
                              </a>
                            </ItemTitle>
                            <div className="flex flex-wrap gap-x-3">
                              {screenStates.map((st) => (
                                <Button key={st} variant="link" size="xs" className="h-auto p-0" asChild>
                                  <a href={href({ kind: 'screen', screen: s, state: st })}>{stateLabel(st)}</a>
                                </Button>
                              ))}
                            </div>
                          </ItemContent>
                        </Item>
                      )
                    })}
                  </ItemGroup>
                )}
              </div>

              {selRow.kind === 'component' && (
                <p className="text-sm">
                  Registry:{' '}
                  <a href="/r/registry.json" target="_blank" rel="noreferrer" className="underline">
                    included
                  </a>
                </p>
              )}
              {selRow.kind === 'shell' && (
                <p className="text-sm">
                  Registry:{' '}
                  <a href="/r/registry.json" target="_blank" rel="noreferrer" className="underline">
                    not included
                  </a>{' '}
                  <span className="text-muted-foreground">(the registry lists src/components only)</span>
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <CommandPalette />
    </SidebarInset>
  )
}
