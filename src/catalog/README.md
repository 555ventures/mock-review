# Gray catalog — the wireframe vocabulary

A wireframe screen is a json-render spec: `{ root, elements, state? }`. `elements` is a flat map
from a key you choose to `{ type, props, children }`. The key is the node's identity: notes anchor
to it, so keep keys stable between rounds (rename a sentence freely, but not the key).

Rules that are checked when a round is pushed:

- `type` must be one of the 19 components below.
- `props` may only contain the props listed for that component (a typo such as `lable` is refused).
- Every element needs `children`, even when empty: `"children": []`.
- A string/number/boolean prop may be a json-render expression instead of a literal:
  `{"$item": "name"}` inside a repeat, `{"$state": "/user/name"}`, `{"$index": true}`.

One action exists: `navigate`, to go to another screen of the same round by its name. Put it on
the element the person presses; the journey guide rings that element and a click on it advances
the journey:

```json
"continue": {
  "type": "Button",
  "props": { "label": "Continue" },
  "children": [],
  "on": { "press": { "action": "navigate", "params": { "to": "owner-profile" } } }
}
```

Repeat: an element with `"repeat": { "statePath": "/members" }` draws its children once per item
of that state array; the spec's `state` seeds it. Each drawn child gets its row number, so a note
can point at row 2.

## Layout

| Component | Props | Example |
| --- | --- | --- |
| `Stack` | `gap?` number (px, default 12), `padding?` number (px, default 0), `align?` `start`\|`center`\|`end`\|`stretch` | `{"type":"Stack","props":{"gap":16,"padding":24},"children":["title","form"]}` |
| `Row` | `gap?` number, `align?` `start`\|`center`\|`end`\|`stretch` (default `center`), `justify?` `start`\|`center`\|`end`\|`between`, `wrap?` boolean | `{"type":"Row","props":{"justify":"between"},"children":["back","next"]}` |
| `Grid` | `columns?` number (default 2), `gap?` number | `{"type":"Grid","props":{"columns":3},"children":["a","b","c"]}` |
| `Card` | `title?`, `description?` — children go inside | `{"type":"Card","props":{"title":"Plan","description":"Billed monthly"},"children":["price"]}` |
| `Divider` | `label?` | `{"type":"Divider","props":{"label":"or"},"children":[]}` |

## Text

| Component | Props | Example |
| --- | --- | --- |
| `Heading` | `text`, `level?` 1\|2\|3\|4 (default 2) | `{"type":"Heading","props":{"text":"Create your account","level":1},"children":[]}` |
| `Text` | `text`, `size?` `sm`\|`md`\|`lg`, `muted?` boolean | `{"type":"Text","props":{"text":"We will email you a code.","muted":true},"children":[]}` |
| `Badge` | `text` | `{"type":"Badge","props":{"text":"Beta"},"children":[]}` |
| `Alert` | `title`, `text?` | `{"type":"Alert","props":{"title":"Card declined","text":"Try another card."},"children":[]}` |

## Controls

| Component | Props | Example |
| --- | --- | --- |
| `Button` | `label`, `variant?` `primary`\|`secondary`\|`ghost` (default `primary`) | `{"type":"Button","props":{"label":"Save","variant":"secondary"},"children":[]}` |
| `Field` | `label`, `placeholder?`, `value?`, `hint?`, `multiline?` boolean | `{"type":"Field","props":{"label":"Work email","placeholder":"you@company.com"},"children":[]}` |
| `Select` | `options` string[], `label?`, `value?`, `placeholder?` | `{"type":"Select","props":{"label":"Country","options":["Norway","Sweden"]},"children":[]}` |
| `Checkbox` | `label`, `checked?` boolean | `{"type":"Checkbox","props":{"label":"I agree to the terms","checked":true},"children":[]}` |
| `Tabs` | `tabs` string[], `active?` (default the first) — children are the active panel | `{"type":"Tabs","props":{"tabs":["Profile","Billing"],"active":"Billing"},"children":["billing"]}` |
| `Nav` | `brand?`, `items?` string[], `active?`, `vertical?` boolean — children sit at its end | `{"type":"Nav","props":{"brand":"Hearwell","items":["Home","Team"],"active":"Home"},"children":["avatar"]}` |

## Data and pictures

| Component | Props | Example |
| --- | --- | --- |
| `List` | `items?` string[], `ordered?` boolean — children are added as further items | `{"type":"List","props":{"items":["Pick a plan","Invite your team"],"ordered":true},"children":[]}` |
| `Table` | `columns` string[], `rows` string[][] | `{"type":"Table","props":{"columns":["Name","Role"],"rows":[["Ada","Owner"]]},"children":[]}` |
| `Image` | `label?`, `height?` number (px, default 160) — a gray placeholder box | `{"type":"Image","props":{"label":"Clinic photo","height":200},"children":[]}` |
| `Avatar` | `name?` (initials are drawn), `size?` `sm`\|`md`\|`lg` | `{"type":"Avatar","props":{"name":"Ada Lovelace"},"children":[]}` |

## A whole screen

```json
{
  "root": "page",
  "elements": {
    "page": { "type": "Stack", "props": { "gap": 16, "padding": 24 }, "children": ["title", "email", "continue"] },
    "title": { "type": "Heading", "props": { "text": "Create your account", "level": 1 }, "children": [] },
    "email": { "type": "Field", "props": { "label": "Work email", "placeholder": "you@company.com" }, "children": [] },
    "continue": {
      "type": "Button",
      "props": { "label": "Continue" },
      "children": [],
      "on": { "press": { "action": "navigate", "params": { "to": "owner-profile" } } }
    }
  }
}
```

Files: `gray-catalog.ts` (the catalog and `propSchemas`), `gray-registry.tsx` (the drawing),
`proof/render-proof.mjs` (server-renders two specs and prints the HTML:
`node src/catalog/proof/render-proof.mjs`).
