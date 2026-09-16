/// <reference types="vite/client" />
// D2 of specs/20260915/03: the frame entry — the `?frame` branch of the one entry document.
// `src/ui/main.tsx` dynamically imports this module when the URL carries `frame`, so the mock's
// document never loads the reviewer's CSS, store or component libraries. It ships as source and
// compiles through the *host's* own Vite dev server, running under the host's aliases, Tailwind
// and React plugins exactly like a real host module would. `import.meta.glob`'s root-relative
// patterns (leading `/`) resolve against the host's project root regardless of where this file
// physically lives (A2), so this one static source works for every host without the plugin
// generating anything per-request.
//
// Renders `examples[state]` for `#/<screen>?state=<s>&scheme=<light|dark>` or the
// component/shell example for `#/__component?name=&example=` into `div.p-4` (D8); no reviewer
// chrome is ever mounted here — this document is the mock alone.
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { parseFrameHash, type FrameRoute } from './frameRoute.js'

type ExampleModule = { examples?: Record<string, ReactNode> }

const screenModules = import.meta.glob<ExampleModule>('/src/screens/*.tsx', { eager: true })
const componentModules = import.meta.glob<ExampleModule>('/src/components/*.tsx', { eager: true })
const shellModules = import.meta.glob<ExampleModule>('/src/shells/*.tsx', { eager: true })

function baseName(filePath: string): string {
  const file = filePath.split('/').pop() ?? filePath
  return file.replace(/\.tsx$/, '')
}

function moduleByName(modules: Record<string, ExampleModule>, name: string): ExampleModule | undefined {
  for (const [file, mod] of Object.entries(modules)) {
    if (baseName(file) === name) return mod
  }
  return undefined
}

/** D3's fallback (an unknown/missing state falls back to the first): exact match, then a
 * case-insensitive one, then the first declared example. */
function pickExample(examples: Record<string, ReactNode> | undefined, requested: string | null): ReactNode {
  if (!examples) return null
  if (requested && requested in examples) return examples[requested] ?? null
  const keys = Object.keys(examples)
  if (requested) {
    const ci = keys.find((k) => k.toLowerCase() === requested.toLowerCase())
    if (ci) return examples[ci] ?? null
  }
  const first = keys[0]
  return first ? (examples[first] ?? null) : null
}

function ensureStylesheet(href: string): void {
  const already = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(
    (link) => link.getAttribute('href') === href,
  )
  if (already) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

/** D8/D20: the host's own base stylesheet, and the picked theme's when the frame's own `_theme`
 * search param is set — a missing file is just a 404'd `<link>`, never a thrown module error, so
 * a host without either still renders. `_theme` (outer `location.search`, set by whoever embeds
 * this frame, e.g. the reviewer page's iframe `src`) replaces an earlier `GET /__mock-review/state`
 * fetch: every extra request into the server risked a race with `serve`'s own dependency
 * optimizer (D20) for no benefit here, since the theme is the only piece of state the frame ever
 * needed. */
function applyStyles(): void {
  ensureStylesheet('/src/index.css')
  const theme = new URLSearchParams(location.search).get('_theme')
  if (theme) ensureStylesheet(`/src/themes/${theme}.css`)
}

function applyScheme(route: FrameRoute | undefined): void {
  document.documentElement.classList.toggle('dark', route?.scheme === 'dark')
}

let root: ReturnType<typeof createRoot> | undefined

function render(): void {
  const route = parseFrameHash(window.location.hash)
  applyScheme(route)

  let node: ReactNode = null

  if (route?.kind === 'component') {
    const mod = route.name ? (moduleByName(componentModules, route.name) ?? moduleByName(shellModules, route.name)) : undefined
    node = pickExample(mod?.examples, route.example ?? null)
  } else if (route?.kind === 'screen') {
    const mod = moduleByName(screenModules, route.screen)
    node = pickExample(mod?.examples, route.state ?? null)
  }

  const container = document.getElementById('root')
  if (!container) return
  if (!root) root = createRoot(container)
  root.render(<div className="p-4">{node}</div>)
}

document.body.classList.add('bg-background')
applyStyles()
render()
window.addEventListener('hashchange', render)
if (import.meta.hot) import.meta.hot.on('mock-review:frame-reload', () => location.reload())
