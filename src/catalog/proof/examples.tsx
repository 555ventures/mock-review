// Two example specs rendered to static HTML with the real gray registry (used by
// `render-proof.mjs`). Not shipped; not imported by the app.
import { renderToStaticMarkup } from 'react-dom/server'
import type { Spec } from '@json-render/core'
import { GrayScreen } from '../gray-registry.js'
import { catalog, propSchemas, type GrayComponent } from '../gray-catalog.js'

export const signIn: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Stack', props: { gap: 16, padding: 24 }, children: ['title', 'email', 'terms', 'continue'] },
    title: { type: 'Heading', props: { text: 'Create your account', level: 1 }, children: [] },
    email: { type: 'Field', props: { label: 'Work email', placeholder: 'you@company.com' }, children: [] },
    terms: { type: 'Checkbox', props: { label: 'I agree to the terms', checked: true }, children: [] },
    continue: {
      type: 'Button',
      props: { label: 'Continue' },
      children: [],
      on: { press: { action: 'navigate', params: { to: 'owner-profile' } } },
    },
  },
}

export const team: Spec = {
  root: 'page',
  state: { members: [{ name: 'Ada Lovelace' }, { name: 'Alan Turing' }] },
  elements: {
    page: { type: 'Stack', props: { gap: 12, padding: 24 }, children: ['nav', 'members', 'table'] },
    nav: { type: 'Nav', props: { brand: 'Hearwell', items: ['Home', 'Team'], active: 'Team' }, children: [] },
    members: { type: 'Stack', props: { gap: 8 }, repeat: { statePath: '/members' }, children: ['member'] },
    member: { type: 'Avatar', props: { name: { $item: 'name' }, size: 'sm' }, children: [] },
    table: { type: 'Table', props: { columns: ['Name', 'Role'], rows: [['Ada', 'Owner'], ['Alan', 'Member']] }, children: [] },
  },
}

function propIssues(spec: Spec): string[] {
  const out: string[] = []
  for (const [key, el] of Object.entries(spec.elements)) {
    const schema = propSchemas[el.type as GrayComponent]
    if (!schema) {
      out.push(`${key}: unknown type ${el.type}`)
      continue
    }
    const r = schema.safeParse(el.props)
    if (!r.success) out.push(`${key}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  }
  return out
}

export function renderAll(): { name: string; html: string; propIssues: string[]; catalogValid: unknown }[] {
  return [
    ['signIn', signIn],
    ['team', team],
  ].map(([name, spec]) => {
    const s = spec as Spec
    return {
      name: name as string,
      html: renderToStaticMarkup(<GrayScreen spec={s} />),
      propIssues: propIssues(s),
      catalogValid: catalog.validate(s),
    }
  })
}

/** A deliberately wrong spec, to show the prop check refuses a typo. */
export function badPropIssues(): string[] {
  return propIssues({
    root: 'b',
    elements: { b: { type: 'Button', props: { lable: 'Oops' }, children: [] } },
  })
}
