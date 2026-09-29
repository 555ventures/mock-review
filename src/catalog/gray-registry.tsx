// The gray registry (PROTOTYPE-PLAN.md seam D): React components for every entry of
// `gray-catalog.ts`, drawn as a low-fidelity wireframe — neutral borders, light gray fills, Geist
// or the system font, placeholder boxes for pictures and avatars, and no colour anywhere.
//
// Every component's root element carries `data-node` and `data-component` (both = the element's
// key in the spec) so the reviewer's anchoring (`src/ui/notes/anchor.ts`, which resolves through
// `[data-component]`) lands a note on a node with no rewrite; an element whose `on.press` is
// `navigate` also carries `data-to="<screen>"` so the journey guide ring and click-to-advance find
// it; a child of a `repeat` element carries `data-index` (its row number).
//
// json-render does not hand an element its own key, so `prepareSpec` copies it into
// `props.__node` (plus `props.__to` for a navigate press, `props.__repeated` for a repeat child)
// before rendering. Styles are inline so the frame needs no stylesheet of the product's.
import {
  Children,
  useMemo,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import type { Spec, UIElement } from '@json-render/core'
import {
  JSONUIProvider,
  Renderer,
  defineRegistry,
  useRepeatScope,
  type BaseComponentProps,
} from '@json-render/react'
import { catalog } from './gray-catalog.js'

// ---------------------------------------------------------------------------------------------
// Spec preparation (pure)

type Binding = { action: string; params?: Record<string, unknown> }

function navigateTarget(el: UIElement): string | undefined {
  const press = el.on?.['press'] as Binding | Binding[] | undefined
  const list = Array.isArray(press) ? press : press ? [press] : []
  const nav = list.find((b) => b.action === 'navigate')
  const to = nav?.params?.['to']
  return typeof to === 'string' ? to : undefined
}

/** A pure copy of `spec` whose every element's props carry its own key (`__node`), its navigate
 * target (`__to`) and whether it is a child of a `repeat` element (`__repeated`). */
export function prepareSpec(spec: Spec): Spec {
  const repeated = new Set<string>()
  for (const el of Object.values(spec.elements)) {
    if (el.repeat) for (const c of el.children ?? []) repeated.add(c)
  }
  const elements: Record<string, UIElement> = {}
  for (const [key, el] of Object.entries(spec.elements)) {
    const to = navigateTarget(el)
    elements[key] = {
      ...el,
      props: {
        ...el.props,
        __node: key,
        ...(to !== undefined ? { __to: to } : {}),
        ...(repeated.has(key) ? { __repeated: true } : {}),
      },
    }
  }
  return { ...spec, elements }
}

// ---------------------------------------------------------------------------------------------
// Tokens — grays only

const T = {
  ink: '#171717',
  sub: '#525252',
  muted: '#8a8a8a',
  line: '#d4d4d4',
  lineSoft: '#e5e5e5',
  fill: '#f5f5f5',
  fillStrong: '#e5e5e5',
  dark: '#262626',
  white: '#ffffff',
  radius: 6,
  font: '"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback
}
function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)) : []
}

// ---------------------------------------------------------------------------------------------
// Root attributes

type Ctx = BaseComponentProps<Record<string, unknown>>

type RootProps = {
  'data-node'?: string
  'data-component'?: string
  'data-to'?: string
  'data-index'?: number
  onClick?: (e: MouseEvent) => void
}

/** The attributes every component root carries, plus the press wiring. A hook: it reads the
 * repeat scope, so it runs inside each component's own React function. */
function useRoot(ctx: Ctx): { root: RootProps; pressable: boolean } {
  const scope = useRepeatScope()
  const p = ctx.props
  const node = typeof p['__node'] === 'string' ? p['__node'] : undefined
  const to = typeof p['__to'] === 'string' ? p['__to'] : undefined
  const press = ctx.on('press')
  const root: RootProps = {}
  if (node !== undefined) {
    root['data-node'] = node
    root['data-component'] = node
  }
  if (to !== undefined) root['data-to'] = to
  if (p['__repeated'] === true && scope) root['data-index'] = scope.index
  if (press.bound) {
    root.onClick = (e) => {
      if (press.shouldPreventDefault) e.preventDefault()
      press.emit()
    }
  }
  return { root, pressable: press.bound }
}

const pointer = (on: boolean): CSSProperties => (on ? { cursor: 'pointer' } : {})

// ---------------------------------------------------------------------------------------------
// Components

function Stack(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const align = str(ctx.props['align'], 'stretch')
  return (
    <div
      {...root}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: numOr(ctx.props['gap'], 12),
        padding: numOr(ctx.props['padding'], 0),
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
        minWidth: 0,
        ...pointer(pressable),
      }}
    >
      {ctx.children}
    </div>
  )
}

function Row(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const align = str(ctx.props['align'], 'center')
  const justify = str(ctx.props['justify'], 'start')
  return (
    <div
      {...root}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: ctx.props['wrap'] === true ? 'wrap' : 'nowrap',
        gap: numOr(ctx.props['gap'], 12),
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
        justifyContent:
          justify === 'between' ? 'space-between' : justify === 'start' ? 'flex-start' : justify === 'end' ? 'flex-end' : 'center',
        minWidth: 0,
        ...pointer(pressable),
      }}
    >
      {ctx.children}
    </div>
  )
}

function Grid(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const cols = Math.max(1, Math.round(numOr(ctx.props['columns'], 2)))
  return (
    <div
      {...root}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: numOr(ctx.props['gap'], 12),
        ...pointer(pressable),
      }}
    >
      {ctx.children}
    </div>
  )
}

const HEADING: Record<number, CSSProperties> = {
  1: { fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.4 },
  2: { fontSize: 22, fontWeight: 600, lineHeight: 1.25, letterSpacing: -0.2 },
  3: { fontSize: 18, fontWeight: 600, lineHeight: 1.3 },
  4: { fontSize: 15, fontWeight: 600, lineHeight: 1.35 },
}

function Heading(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const level = numOr(ctx.props['level'], 2)
  const style: CSSProperties = { margin: 0, color: T.ink, ...(HEADING[level] ?? HEADING[2]), ...pointer(pressable) }
  const content = str(ctx.props['text'])
  if (level === 1) return <h1 {...root} style={style}>{content}</h1>
  if (level === 3) return <h3 {...root} style={style}>{content}</h3>
  if (level === 4) return <h4 {...root} style={style}>{content}</h4>
  return <h2 {...root} style={style}>{content}</h2>
}

function Text(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const size = str(ctx.props['size'], 'md')
  return (
    <p
      {...root}
      style={{
        margin: 0,
        fontSize: size === 'sm' ? 12 : size === 'lg' ? 16 : 14,
        lineHeight: 1.55,
        color: ctx.props['muted'] === true ? T.muted : T.sub,
        ...pointer(pressable),
      }}
    >
      {str(ctx.props['text'])}
    </p>
  )
}

function Card(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const title = str(ctx.props['title'])
  const description = str(ctx.props['description'])
  return (
    <div
      {...root}
      style={{
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        background: T.white,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
        ...pointer(pressable),
      }}
    >
      {(title || description) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {title && <div style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>{title}</div>}
          {description && <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{description}</div>}
        </div>
      )}
      {ctx.children}
    </div>
  )
}

const BUTTON: Record<string, CSSProperties> = {
  primary: { background: T.dark, color: T.white, border: `1px solid ${T.dark}` },
  secondary: { background: T.white, color: T.ink, border: `1px solid ${T.line}` },
  ghost: { background: 'transparent', color: T.sub, border: '1px solid transparent' },
}

function Button(ctx: Ctx) {
  const { root } = useRoot(ctx)
  const variant = str(ctx.props['variant'], 'primary')
  return (
    <button
      type="button"
      {...root}
      style={{
        ...(BUTTON[variant] ?? BUTTON['primary']),
        font: 'inherit',
        fontSize: 14,
        fontWeight: 500,
        height: 36,
        padding: '0 16px',
        borderRadius: T.radius,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      {str(ctx.props['label'])}
    </button>
  )
}

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: T.ink }
const boxStyle: CSSProperties = {
  font: 'inherit',
  fontSize: 14,
  color: T.ink,
  background: T.white,
  border: `1px solid ${T.line}`,
  borderRadius: T.radius,
  padding: '0 10px',
  height: 36,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

function Field(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const label = str(ctx.props['label'])
  const placeholder = str(ctx.props['placeholder'])
  const value = str(ctx.props['value'])
  const hint = str(ctx.props['hint'])
  return (
    <label {...root} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...pointer(pressable) }}>
      <span style={labelStyle}>{label}</span>
      {ctx.props['multiline'] === true ? (
        <textarea
          defaultValue={value}
          placeholder={placeholder}
          rows={3}
          style={{ ...boxStyle, height: 'auto', padding: '8px 10px', resize: 'none' }}
        />
      ) : (
        <input defaultValue={value} placeholder={placeholder} style={boxStyle} />
      )}
      {hint && <span style={{ fontSize: 12, color: T.muted }}>{hint}</span>}
    </label>
  )
}

function Select(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const label = str(ctx.props['label'])
  const value = str(ctx.props['value'])
  const placeholder = str(ctx.props['placeholder'], strs(ctx.props['options'])[0] ?? '')
  return (
    <div {...root} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...pointer(pressable) }}>
      {label && <span style={labelStyle}>{label}</span>}
      <div style={{ ...boxStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: value ? T.ink : T.muted }}>{value || placeholder}</span>
        <span aria-hidden style={{ color: T.muted, fontSize: 11 }}>
          ▼
        </span>
      </div>
    </div>
  )
}

function Checkbox(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const checked = ctx.props['checked'] === true
  return (
    <div {...root} style={{ display: 'flex', alignItems: 'center', gap: 8, ...pointer(pressable) }}>
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1px solid ${checked ? T.dark : T.line}`,
          background: checked ? T.dark : T.white,
          color: T.white,
          fontSize: 11,
          lineHeight: '14px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {checked ? '✓' : ''}
      </span>
      <span style={{ fontSize: 14, color: T.ink }}>{str(ctx.props['label'])}</span>
    </div>
  )
}

function List(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const items = strs(ctx.props['items'])
  const ordered = ctx.props['ordered'] === true
  const style: CSSProperties = {
    margin: 0,
    paddingLeft: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 14,
    color: T.sub,
    lineHeight: 1.5,
    ...pointer(pressable),
  }
  const lis = [
    ...items.map((it, i) => <li key={`i${i}`}>{it}</li>),
    ...Children.toArray(ctx.children).map((c, i) => <li key={`c${i}`}>{c}</li>),
  ]
  return ordered ? <ol {...root} style={style}>{lis}</ol> : <ul {...root} style={style}>{lis}</ul>
}

function Table(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const columns = strs(ctx.props['columns'])
  const rows = Array.isArray(ctx.props['rows']) ? ctx.props['rows'].map((r) => strs(r)) : []
  const cell: CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 13 }
  return (
    <div {...root} style={{ border: `1px solid ${T.line}`, borderRadius: 8, overflow: 'hidden', ...pointer(pressable) }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: T.fill }}>
            {columns.map((c, i) => (
              <th key={i} style={{ ...cell, fontWeight: 500, color: T.sub }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
              {columns.map((_, j) => (
                <td key={j} style={{ ...cell, color: T.ink }}>
                  {r[j] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Image(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const label = str(ctx.props['label'])
  return (
    <div
      {...root}
      role="img"
      aria-label={label || 'Picture'}
      style={{
        position: 'relative',
        height: numOr(ctx.props['height'], 160),
        width: '100%',
        background: T.fill,
        border: `1px solid ${T.lineSoft}`,
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...pointer(pressable),
      }}
    >
      <svg aria-hidden width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <line x1="0" y1="0" x2="100%" y2="100%" stroke={T.lineSoft} strokeWidth="1" />
        <line x1="100%" y1="0" x2="0" y2="100%" stroke={T.lineSoft} strokeWidth="1" />
      </svg>
      {label && (
        <span style={{ position: 'relative', fontSize: 12, color: T.muted, background: T.fill, padding: '2px 6px' }}>{label}</span>
      )}
    </div>
  )
}

function Badge(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  return (
    <span
      {...root}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'flex-start',
        height: 22,
        padding: '0 8px',
        borderRadius: 999,
        border: `1px solid ${T.line}`,
        background: T.fill,
        fontSize: 12,
        fontWeight: 500,
        color: T.sub,
        whiteSpace: 'nowrap',
        ...pointer(pressable),
      }}
    >
      {str(ctx.props['text'])}
    </span>
  )
}

function Divider(ctx: Ctx) {
  const { root } = useRoot(ctx)
  const label = str(ctx.props['label'])
  if (!label) return <hr {...root} style={{ border: 0, borderTop: `1px solid ${T.lineSoft}`, margin: '4px 0', width: '100%' }} />
  return (
    <div {...root} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <span style={{ flex: 1, borderTop: `1px solid ${T.lineSoft}` }} />
      <span style={{ fontSize: 12, color: T.muted }}>{label}</span>
      <span style={{ flex: 1, borderTop: `1px solid ${T.lineSoft}` }} />
    </div>
  )
}

function Tabs(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const tabs = strs(ctx.props['tabs'])
  const active = str(ctx.props['active'], tabs[0] ?? '')
  return (
    <div {...root} style={{ display: 'flex', flexDirection: 'column', gap: 16, ...pointer(pressable) }}>
      <div role="tablist" style={{ display: 'flex', gap: 20, borderBottom: `1px solid ${T.lineSoft}` }}>
        {tabs.map((t) => (
          <span
            key={t}
            role="tab"
            aria-selected={t === active}
            style={{
              padding: '8px 0',
              marginBottom: -1,
              fontSize: 14,
              fontWeight: t === active ? 600 : 400,
              color: t === active ? T.ink : T.muted,
              borderBottom: `2px solid ${t === active ? T.dark : 'transparent'}`,
            }}
          >
            {t}
          </span>
        ))}
      </div>
      {ctx.children}
    </div>
  )
}

function Nav(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const brand = str(ctx.props['brand'])
  const items = strs(ctx.props['items'])
  const active = str(ctx.props['active'])
  const vertical = ctx.props['vertical'] === true
  return (
    <nav
      {...root}
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: vertical ? 'stretch' : 'center',
        gap: vertical ? 4 : 24,
        padding: vertical ? 16 : '0 24px',
        minHeight: vertical ? undefined : 56,
        width: vertical ? 220 : undefined,
        boxSizing: 'border-box',
        background: T.white,
        [vertical ? 'borderRight' : 'borderBottom']: `1px solid ${T.lineSoft}`,
        ...pointer(pressable),
      }}
    >
      {brand && (
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: T.ink, marginBottom: vertical ? 12 : 0 }}
        >
          <span aria-hidden style={{ width: 20, height: 20, borderRadius: 5, background: T.fillStrong }} />
          {brand}
        </span>
      )}
      {items.map((it) => (
        <span
          key={it}
          style={{
            fontSize: 14,
            color: it === active ? T.ink : T.muted,
            fontWeight: it === active ? 500 : 400,
            ...(vertical
              ? { padding: '6px 10px', borderRadius: T.radius, background: it === active ? T.fill : 'transparent' }
              : {}),
          }}
        >
          {it}
        </span>
      ))}
      {Children.count(ctx.children) > 0 && (
        <span style={{ [vertical ? 'marginTop' : 'marginLeft']: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {ctx.children}
        </span>
      )}
    </nav>
  )
}

const AVATAR = { sm: 24, md: 36, lg: 56 } as const

function Avatar(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const name = str(ctx.props['name'])
  const sizeKey = str(ctx.props['size'], 'md')
  const size = sizeKey === 'sm' ? AVATAR.sm : sizeKey === 'lg' ? AVATAR.lg : AVATAR.md
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      {...root}
      title={name || undefined}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: T.fillStrong,
        color: T.sub,
        fontSize: Math.round(size * 0.38),
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...pointer(pressable),
      }}
    >
      {initials}
    </span>
  )
}

function Alert(ctx: Ctx) {
  const { root, pressable } = useRoot(ctx)
  const body = str(ctx.props['text'])
  return (
    <div
      {...root}
      role="note"
      style={{
        display: 'flex',
        gap: 10,
        padding: 12,
        border: `1px solid ${T.line}`,
        borderRadius: 8,
        background: '#fafafa',
        ...pointer(pressable),
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `1.5px solid ${T.sub}`,
          color: T.sub,
          fontSize: 11,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        !
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{str(ctx.props['title'])}</span>
        {body && <span style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>{body}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Registry

// The library calls each entry as a plain function; the hooks above (`useRepeatScope`) need a
// real component boundary, so every entry renders its component as an element.
const wrap = (C: (ctx: Ctx) => ReactNode) => (ctx: Ctx) => <C {...ctx} />

export const { registry } = defineRegistry(catalog, {
  components: {
    Stack: wrap(Stack),
    Row: wrap(Row),
    Grid: wrap(Grid),
    Heading: wrap(Heading),
    Text: wrap(Text),
    Card: wrap(Card),
    Button: wrap(Button),
    Field: wrap(Field),
    Select: wrap(Select),
    Checkbox: wrap(Checkbox),
    List: wrap(List),
    Table: wrap(Table),
    Image: wrap(Image),
    Badge: wrap(Badge),
    Divider: wrap(Divider),
    Tabs: wrap(Tabs),
    Nav: wrap(Nav),
    Avatar: wrap(Avatar),
    Alert: wrap(Alert),
  },
  // The real `navigate` runs through `JSONUIProvider`'s `handlers` (see `GrayScreen`); the
  // catalog declares the action, so the registry must name it too.
  actions: {
    navigate: async () => {},
  },
})

export const grayPageStyle: CSSProperties = {
  fontFamily: T.font,
  color: T.ink,
  background: T.white,
  minHeight: '100vh',
  WebkitFontSmoothing: 'antialiased',
}

/** One screen: one `JSONUIProvider` per spec (the caller keys it by screen+state so its state
 * model starts fresh), the prepared spec, and `navigate` wired to `onNavigate`. */
export function GrayScreen({ spec, onNavigate }: { spec: Spec; onNavigate?: (to: string) => void }) {
  const prepared = useMemo(() => prepareSpec(spec), [spec])
  const handlers = useMemo(
    () => ({
      navigate: (params: Record<string, unknown>) => {
        const to = params['to']
        if (typeof to === 'string') onNavigate?.(to)
      },
    }),
    [onNavigate],
  )
  return (
    <JSONUIProvider registry={registry} handlers={handlers} initialState={spec.state ?? {}}>
      <div style={grayPageStyle}>
        <Renderer spec={prepared} registry={registry} />
      </div>
    </JSONUIProvider>
  )
}
