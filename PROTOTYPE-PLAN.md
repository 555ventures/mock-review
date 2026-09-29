# walkthrough prototype — build plan (throwaway)

Branch `proto/walkthrough` in this clone. Never push. Never publish. Secrets live in
`.env.local` (must be git-ignored; add it to `.gitignore` if it is not).

## Goal

Turn this package into a standalone app called walkthrough while keeping the reviewer UI a
Mock Review user already knows (sidebar, top bar, device frames, overlay, notes panel, note
thread dialog, journey pill, journey panel, confirm dialog — everything under `src/ui` that
is self-contained). Only the SOURCE of a screen changes:

- a **wireframe round**: each screen is a json-render spec (`{root, elements}`), drawn gray
  by real `@json-render/react@0.21.0` with our own gray catalog;
- a **screenshots round**: each screen is one PNG per width, view only.

State comes from Postgres (Neon, `DATABASE_URL`), not from a host app's files.

## Non-goals

Login (Better Auth), several projects per client in the UI, hosting, the components catalog
page, the command palette's component group, `check`/`sweep`/`answer`/`approve`/`waive` CLI
verbs. Leave their files in place if untouched; do not wire them into the new app.

## Run shape

`npm run walkthrough` starts ONE Vite dev server (this package is its own root now, no host
app) on `WALKTHROUGH_PORT` with a new Vite plugin `src/server/walkthrough-plugin.ts` that
serves every endpoint below. It loads `.env.local` itself.

URLs:
- `/p/<project>/` — the reviewer (owner on loopback, as today).
- `/p/<project>/?client=<WALKTHROUGH_CLIENT_TOKEN>` — client role, cookie as today.
- `/p/<project>/?frame=1#/<screen>?state=<s>&w=<width>` — the bare screen document.
- The reviewer always shows the project's LATEST round. `?round=<n>` overrides.

## THE SEAM (both agents build against this; do not change it without telling the other)

### A. Database (owner: server agent) — `src/server/db/schema.sql`, applied by `npm run db:push`

```
projects(id text pk, name text)
rounds(project text, n int, kind text check in ('wireframe','screenshots'),
       status text default 'open', viewports jsonb, created_at timestamptz, pk(project,n))
journeys(project text, round int, id text, title text, persona text null,
         steps jsonb, beats text null, pk(project,round,id))
screens(project text, round int, name text, state text, spec jsonb null, pk(project,round,name,state))
images(project text, round int, name text, state text, width int, bytes bytea,
       pk(project,round,name,state,width))
notes(project text, id text, round int, screen text null, state text null,
      anchor jsonb null, status text, thread jsonb, project_note bool default false,
      created_at timestamptz, pk(project,id))
journey_threads(project text, journey text, status text, thread jsonb, pk(project,journey))
approvals(project text, journey text, by text, round int, beats text, at timestamptz,
          reason text null, pk(project,journey))
```

`anchor` (one note model, ADR-0030 e):
- wireframe: `{ "node": "<element key>", "index": <int|null>, "rect": {x,y,w,h}|null, "viewport": "desktop"|"mobile" }`
  (`rect` = the drawn area as a fraction of the node's box; `index` = row number for a
  repeated element)
- screenshots: `{ "x": 0..1, "y": 0..1, "w": 0..1|null, "h": 0..1|null, "width": <px of the picture> }`
- `null` = whole-screen note (or project note when `project_note`).

### B. Reviewer endpoints (owner: server agent; consumer: UI agent) — same paths and shapes
as today so `src/ui/sync/*` and the store change as little as possible, prefixed by project:

- `GET  /p/<project>/__mock-review/state` → today's `ServerState` with these differences:
  - `screens[]`: `{name, states[], examples[]}` derived from the round's `screens` rows
    (`examples` = the state keys); `file`, `shell`, `hash`, `lines` filled with harmless
    constants.
  - `journeys[]`: from the `journeys` table; `edges` derived from consecutive steps whose
    screens differ (`{from, to, label: <to screen name>}`); `resolved`/`unresolved` computed
    by looking for an element whose `on.press.params.to` equals the edge label in the
    from-screen's spec (screenshots rounds: every edge is unresolved and the UI must not
    show the red `(control not found)` for them — see UI rule U5).
  - `config`: `{name, port, targets:{viewports, schemes:['light']}, theme:null, client:{token:''}}`;
    `viewports` from the round row (wireframe default `['1280x800','390x844']`).
  - `notes`: today's Notes document shape built from the `notes` + `journey_threads` tables;
    each note keeps today's fields (`id, screen, state, component, key, snippet, status,
    thread, project?, rect?, viewport?, whole?`) PLUS `anchor` as stored. Mapping:
    `component = anchor.node ?? '__screen'`, `key = String(anchor.index ?? 0)`.
  - `approval`: today's shape; `journeys[id] = {client:'ok'|'waived', beats, at, reason?}`.
  - new top-level `round: {n, kind, status}`.
  - `shells: [], themes: [], inventory: [], violations: []`.
- `POST /p/<project>/__mock-review/notes` — today's `NotesPatch` ops (`add`, `update`,
  `remove`, `reply`, `close`), same role rules, same status transitions.
- `POST /p/<project>/__mock-review/approval` — `clientOk {id, beats}` with today's three
  refusals (unknown journey 400, no beats 400, beats mismatch 409).
- `GET  /p/<project>/__mock-review/events` — SSE; emit `notes`/`approval` after a write and
  `files` after a new round is pushed.
- `GET  /p/<project>/__walkthrough/frame?screen=&state=&round=` →
  `{kind:'wireframe', spec}` or `{kind:'screenshots', images:[{width, url}]}`.
- `GET  /p/<project>/__walkthrough/image/<round>/<name>/<state>/<width>.png` → the bytes.

### C. Plugin API (owner: server agent) — bearer `WALKTHROUGH_API_TOKEN`, version in the path

- `GET  /v1` → `{apiVersion:1}`
- `POST /v1/projects/<p>/rounds` body `{round:<n chosen by the caller>, kind, journeys:[{id,title?,persona?,beats,steps:[{beat,screen,state}]}], screens:[{name,state,spec?|width?}], viewports?}`
  → 201 `{round, kind, screens}`; 409 `round-exists` if `<n>` is taken; 400 `bad-spec` with
  the json-render `validateSpec` issues PLUS our own per-component prop check against the gray
  catalog (the library does not check props).
  A screenshots round stays `status:'uploading'` and hidden from the reviewer until every
  declared picture has arrived; then it becomes `open`.
- `PUT  /v1/projects/<p>/rounds/<n>/images/<name>--<state>--<width>` raw PNG bytes.
- `GET  /v1/projects/<p>/notes?round=<n>` → `{apiVersion, notes:[{id, round, screen, state, anchor, status, text, author, thread, at}]}`
  (`text`/`author` = first thread entry).
- `POST /v1/projects/<p>/notes/<id>/reply` body `{text}` → appends `by:'session'`, status `answered`.
- `GET  /v1/projects/<p>/approvals` → `{apiVersion, approvals:[{journey, by, round, beats, at}]}`
- `POST /v1/projects/<p>/rounds/<n>/mark` body `{status:'open'|'answered'|'closed'}`

Refusal body everywhere: `{error:'<kebab-code>', detail, apiVersion:1}`.

### D. The gray catalog (owner: UI agent; the server agent imports its prop schemas)

`src/catalog/gray-catalog.ts` exports `catalog` (json-render `defineCatalog`) and
`propSchemas: Record<string, ZodObject>`; `src/catalog/gray-registry.tsx` exports the React
components. Components (keep it this small): `Stack, Row, Grid, Heading, Text, Card, Button,
Field, Select, Checkbox, List, Table, Image, Badge, Divider, Tabs, Nav, Avatar, Alert`. One
action: `navigate {to: <screen name>}`. Every component root element carries
`data-node="<key>"` AND `data-component="<key>"` (the second makes today's `anchor.ts` resolve
to the node with no rewrite); a Button (or any element) whose `on.press` is `navigate` also
carries `data-to="<to>"` so today's journey guide ring and click-to-advance keep working.
The element key is not given to components by the library: copy it into props before
rendering (`props.__node`, plus `props.__to` for navigate). Gray only: no colour, neutral
borders, system font, no product CSS.

## UI rules (owner: UI agent)

- U1. Keep every self-contained file under `src/ui` byte-identical where possible. Change
  only what the new screen source forces. A Mock Review user must recognise the page.
- U2. `src/ui/frame/mount.tsx` is replaced by a frame that fetches seam B's `frame` endpoint
  and renders either the json-render spec (one `JSONUIProvider` per screen) or, for a
  screenshots round, the `<img>` whose width matches `w`.
- U3. Drag-to-mark stays (it is how today's users leave a note). On a wireframe the saved
  note also records which node it landed on (today's `anchorFor` does this through
  `data-component`). Additionally a plain click on an element in marking mode selects that
  whole node (rect = null). On a screenshot the anchor is the picture fraction + the picture
  width.
- U4. After the client presses `Confirm journey`, the page must SHOW it: the button becomes a
  confirmed state (`Confirmed · <date>`) and the journey's sidebar dot turns blue. Today the
  confirm is invisible; that is a known defect, fix it here.
- U5. In a screenshots round the journey pill shows `Back` / `Next` only (no guide ring, no
  red `(control not found)`), the Mark/Pins controls still work on the picture, and the View
  toggle offers the widths that were pushed.
- U6. The top bar shows `Round <n> · wireframe|screenshots` so nobody wonders which version
  they are looking at.
- U7. Owner-only surfaces that need a host (Components page, palette component group) are
  hidden, not broken.
- U8. Entry: `/p/<project>/` — read the project from the path; every fetch goes to that
  project's endpoints.

## Acceptance (the orchestrator runs this at the end)

1. `npm run db:push && npm run walkthrough` starts clean; `GET /v1` answers.
2. The plugin client pushes the hearwell owner-onboarding journey (4 beats, 4 screens) as a
   wireframe round; the reviewer page shows it with Mock Review's chrome, drawn gray by
   json-render.
3. In a real browser: walk the journey with the guide ring, mark an area on one element, save
   a note, see the pin; as client confirm the journey and SEE it confirmed.
4. The plugin client pulls the note (anchor names the node) and the approval (beats match),
   replies to the note, and the reply appears in the thread on the page.
5. A second round with one sentence changed: the old approval is shown as stale, the note
   pin still sits on the same node.
6. A screenshots round with real PNGs at two widths: notes on a picture carry its width.
7. `npm run typecheck` passes for every file the prototype touches or adds.
