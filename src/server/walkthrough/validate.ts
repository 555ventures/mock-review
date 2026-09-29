// walkthrough prototype, seam C: a wireframe screen's spec is checked twice — json-render's own
// `validateSpec` for structure (root, children, misplaced `visible`/`on`), then OUR per-component
// prop check against the gray catalog's `propSchemas` (the library does not check props), then the
// one action the catalog has (`navigate {to}`) must name a screen of the same round.
import { validateSpec, type Spec } from '@json-render/core'
import { isRecord } from './http.js'

/** Structural stand-in for `Record<string, ZodObject<any>>` — only `safeParse` is used, so this
 * stays independent of which zod copy the catalog module was loaded with. */
export type PropSchema = {
  safeParse: (value: unknown) => { success: boolean; error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } }
}
export type PropSchemas = Record<string, PropSchema>

/** Plan section D's component list — the known set when `src/catalog/gray-catalog.ts` cannot be
 * loaded (structure check only; an unknown type is still always refused). */
export const FALLBACK_COMPONENTS: readonly string[] = [
  'Stack',
  'Row',
  'Grid',
  'Heading',
  'Text',
  'Card',
  'Button',
  'Field',
  'Select',
  'Checkbox',
  'List',
  'Table',
  'Image',
  'Badge',
  'Divider',
  'Tabs',
  'Nav',
  'Avatar',
  'Alert',
]

export const NAVIGATE_ACTION = 'navigate'

export type SpecIssueOut = {
  screen: string
  state: string
  elementKey?: string
  severity: 'error' | 'warning'
  code: string
  message: string
}

/** Every action binding on an element (`on.<event>` may be one binding or an array). */
function bindingsOf(element: Record<string, unknown>): Record<string, unknown>[] {
  const on = element['on']
  if (!isRecord(on)) return []
  const out: Record<string, unknown>[] = []
  for (const value of Object.values(on)) {
    const list = Array.isArray(value) ? (value as unknown[]) : [value]
    for (const b of list) if (isRecord(b)) out.push(b)
  }
  return out
}

/** The `navigate` targets of every element of a spec, keyed by element key. */
export function navigateTargets(spec: unknown): { key: string; to: string }[] {
  if (!isRecord(spec) || !isRecord(spec['elements'])) return []
  const out: { key: string; to: string }[] = []
  for (const [key, element] of Object.entries(spec['elements'])) {
    if (!isRecord(element)) continue
    for (const b of bindingsOf(element)) {
      const params = b['params']
      if (isRecord(params) && typeof params['to'] === 'string') out.push({ key, to: params['to'] })
    }
  }
  return out
}

export function checkSpec(
  spec: unknown,
  ctx: { screen: string; state: string; propSchemas: PropSchemas | null; screenNames: ReadonlySet<string> },
): SpecIssueOut[] {
  const at = { screen: ctx.screen, state: ctx.state }
  if (!isRecord(spec) || typeof spec['root'] !== 'string' || !isRecord(spec['elements'])) {
    return [{ ...at, severity: 'error', code: 'not_a_spec', message: 'spec must be {root: string, elements: {…}}' }]
  }
  const issues: SpecIssueOut[] = []
  const elements = spec['elements']

  // Element shape first: validateSpec assumes `type`/`props` are present.
  let shapeOk = true
  for (const [key, element] of Object.entries(elements)) {
    if (!isRecord(element) || typeof element['type'] !== 'string') {
      issues.push({ ...at, elementKey: key, severity: 'error', code: 'bad_element', message: `element "${key}" needs a string "type"` })
      shapeOk = false
      continue
    }
    if (!isRecord(element['props'])) {
      issues.push({ ...at, elementKey: key, severity: 'error', code: 'missing_props', message: `element "${key}" needs "props" (use {} for none)` })
      shapeOk = false
    }
    const children = element['children']
    if (children !== undefined && !(Array.isArray(children) && children.every((c) => typeof c === 'string'))) {
      issues.push({ ...at, elementKey: key, severity: 'error', code: 'bad_children', message: `element "${key}": "children" must be an array of element keys` })
      shapeOk = false
    }
  }
  if (!shapeOk) return issues

  // 1. json-render's own structural check.
  const structural = validateSpec(spec as unknown as Spec)
  for (const issue of structural.issues) {
    issues.push({
      ...at,
      ...(issue.elementKey !== undefined ? { elementKey: issue.elementKey } : {}),
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    })
  }

  // 2. Our per-component prop check + 3. the navigate action.
  for (const [key, raw] of Object.entries(elements)) {
    const element = raw as Record<string, unknown>
    const type = element['type'] as string
    const known = ctx.propSchemas ? Object.prototype.hasOwnProperty.call(ctx.propSchemas, type) : FALLBACK_COMPONENTS.includes(type)
    if (!known) {
      issues.push({ ...at, elementKey: key, severity: 'error', code: 'unknown_component', message: `element "${key}": unknown component type "${type}"` })
    } else if (ctx.propSchemas) {
      const schema = ctx.propSchemas[type]
      const result = schema ? schema.safeParse(element['props']) : { success: true }
      if (!result.success) {
        for (const zi of result.error?.issues ?? []) {
          const where = zi.path.length > 0 ? zi.path.map(String).join('.') : '(props)'
          issues.push({ ...at, elementKey: key, severity: 'error', code: 'bad_props', message: `element "${key}" (${type}) prop ${where}: ${zi.message}` })
        }
      }
    }

    for (const binding of bindingsOf(element)) {
      const action = binding['action']
      if (action !== NAVIGATE_ACTION) {
        issues.push({ ...at, elementKey: key, severity: 'error', code: 'unknown_action', message: `element "${key}": unknown action "${String(action)}" (only "navigate")` })
        continue
      }
      const params = binding['params']
      const to = isRecord(params) ? params['to'] : undefined
      if (typeof to !== 'string') {
        issues.push({ ...at, elementKey: key, severity: 'error', code: 'bad_navigate', message: `element "${key}": navigate needs params.to (a screen name)` })
      } else if (!ctx.screenNames.has(to)) {
        issues.push({ ...at, elementKey: key, severity: 'error', code: 'unknown_screen', message: `element "${key}": navigate to "${to}", which is not a screen of this round` })
      }
    }
  }
  return issues
}
