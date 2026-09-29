// The gray catalog (PROTOTYPE-PLAN.md seam D): the whole vocabulary a wireframe spec may use.
// `propSchemas` is exported on its own so the server can check every element's props when a round
// is pushed — json-render's own `validateSpec`/`catalog.validate` only checks component type names.
// Every schema is `.strict()` so a misspelled prop is refused at push time instead of silently
// drawing nothing. A string/number prop also accepts a json-render expression object (`{"$item":
// "name"}`, `{"$state": "/user/name"}`, `{"$index": true}`) so repeated rows can bind their data.
import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'

/** A json-render dynamic value: an object whose keys all start with `$`. */
const Expr = z.record(z.string().regex(/^\$/), z.unknown())
const text = z.union([z.string(), Expr])
const num = z.union([z.number(), Expr])
const bool = z.union([z.boolean(), Expr])
const texts = z.union([z.array(text), Expr])

const align = z.enum(['start', 'center', 'end', 'stretch'])

export const propSchemas = {
  Stack: z.object({ gap: num.optional(), padding: num.optional(), align: align.optional() }).strict(),
  Row: z
    .object({
      gap: num.optional(),
      align: align.optional(),
      justify: z.enum(['start', 'center', 'end', 'between']).optional(),
      wrap: bool.optional(),
    })
    .strict(),
  Grid: z.object({ columns: num.optional(), gap: num.optional() }).strict(),
  Heading: z.object({ text, level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional() }).strict(),
  Text: z.object({ text, size: z.enum(['sm', 'md', 'lg']).optional(), muted: bool.optional() }).strict(),
  Card: z.object({ title: text.optional(), description: text.optional() }).strict(),
  Button: z.object({ label: text, variant: z.enum(['primary', 'secondary', 'ghost']).optional() }).strict(),
  Field: z
    .object({
      label: text,
      placeholder: text.optional(),
      value: text.optional(),
      hint: text.optional(),
      multiline: bool.optional(),
    })
    .strict(),
  Select: z.object({ label: text.optional(), options: texts, value: text.optional(), placeholder: text.optional() }).strict(),
  Checkbox: z.object({ label: text, checked: bool.optional() }).strict(),
  List: z.object({ items: texts.optional(), ordered: bool.optional() }).strict(),
  Table: z.object({ columns: texts, rows: z.union([z.array(texts), Expr]) }).strict(),
  Image: z.object({ label: text.optional(), height: num.optional() }).strict(),
  Badge: z.object({ text }).strict(),
  Divider: z.object({ label: text.optional() }).strict(),
  Tabs: z.object({ tabs: texts, active: text.optional() }).strict(),
  Nav: z
    .object({ brand: text.optional(), items: texts.optional(), active: text.optional(), vertical: bool.optional() })
    .strict(),
  Avatar: z.object({ name: text.optional(), size: z.enum(['sm', 'md', 'lg']).optional() }).strict(),
  Alert: z.object({ title: text, text: text.optional() }).strict(),
} satisfies Record<string, z.ZodObject>

export type GrayComponent = keyof typeof propSchemas

const CONTAINERS: ReadonlySet<GrayComponent> = new Set<GrayComponent>(['Stack', 'Row', 'Grid', 'Card', 'List', 'Nav', 'Tabs'])

const DESCRIPTIONS: Record<GrayComponent, string> = {
  Stack: 'Vertical column of children.',
  Row: 'Horizontal row of children.',
  Grid: 'Children laid out in equal columns.',
  Heading: 'A title line.',
  Text: 'A paragraph of text.',
  Card: 'A bordered box with an optional title, holding children.',
  Button: 'A button. Put `on.press` = navigate to move to another screen.',
  Field: 'A labelled text input.',
  Select: 'A labelled dropdown.',
  Checkbox: 'A checkbox with a label.',
  List: 'A bulleted list of items (or of children).',
  Table: 'A table with a header row.',
  Image: 'A gray placeholder box for a picture.',
  Badge: 'A small pill label.',
  Divider: 'A horizontal rule, optionally labelled.',
  Tabs: 'A tab strip; children are the active panel.',
  Nav: 'A navigation bar; children sit at its end.',
  Avatar: 'A round placeholder with initials.',
  Alert: 'A bordered notice with a title.',
}

const components = Object.fromEntries(
  (Object.keys(propSchemas) as GrayComponent[]).map((name) => [
    name,
    {
      props: propSchemas[name],
      slots: CONTAINERS.has(name) ? ['default'] : [],
      description: DESCRIPTIONS[name],
    },
  ]),
) as { [K in GrayComponent]: { props: (typeof propSchemas)[K]; slots: string[]; description: string } }

export const navigateParams = z.object({ to: z.string() }).strict()

export const catalog = defineCatalog(schema, {
  components,
  actions: {
    navigate: { params: navigateParams, description: 'Go to another screen by name.' },
  },
})

export const COMPONENT_NAMES = Object.keys(propSchemas) as GrayComponent[]
