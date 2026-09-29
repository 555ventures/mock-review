# walkthrough server (prototype)

## Run

```
npm run db:push        # applies src/server/db/schema.sql to DATABASE_URL (idempotent)
npm run walkthrough    # one Vite dev server on 127.0.0.1:$WALKTHROUGH_PORT (strictPort)
npm run prove:server   # HTTP-only proof against the running server (fresh project id each run)
```

Both load `.env.local` themselves (`DATABASE_URL`, `WALKTHROUGH_API_TOKEN`,
`WALKTHROUGH_CLIENT_TOKEN`, `WALKTHROUGH_PORT`). `npm run walkthrough` runs
`vite --config vite.walkthrough.config.ts --configLoader runner` (the runner loader lets the config
import the plugin's `.ts` sources with their `.js` specifiers).

## Files

| File | What |
|---|---|
| `src/server/db/schema.sql` | seam A tables |
| `src/server/db/pool.ts` | the pg pool, `inTransaction` |
| `src/server/walkthrough-plugin.ts` | the Vite plugin: routes, virtual entry, `.env.local`, catalog loading |
| `src/server/walkthrough/http.ts` | JSON/refusal helpers, `roleOf` (today's rules), bearer check |
| `src/server/walkthrough/data.ts` | SQL reads/writes; rows ⇄ today's `Notes`/`Approval`/`ServerState` |
| `src/server/walkthrough/writes.ts` | notes + approval write paths (today's check order, today's reducers) |
| `src/server/walkthrough/reviewer.ts` | seam B handlers |
| `src/server/walkthrough/api.ts` | seam C handlers |
| `src/server/walkthrough/validate.ts` | push validation (json-render `validateSpec` + prop check + navigate) |
| `src/server/walkthrough/events.ts` | in-process SSE fan-out per project |
| `vite.walkthrough.config.ts` | react + tailwind + this plugin, `@` → `src`, root = package dir |
| `scripts/db-push.mjs`, `scripts/prove-server.mjs` | the two scripts |

## Endpoints

Seam B (reviewer; role = `owner` on loopback without forwarding headers, `client` by
`?client=<WALKTHROUGH_CLIENT_TOKEN>` → cookie `walkthrough-client`, `Path=/p/<project>/`):

- `GET /p/<p>/` — the reviewer shell (virtual entry `walkthrough:entry` → `src/ui/main.tsx`);
  `?frame=1` gets the same document. `GET /p/<p>` redirects to the slash form.
- `GET /p/<p>/__mock-review/state[?round=n]` — today's `ServerState` + `round:{n,kind,status}|null`.
- `POST /p/<p>/__mock-review/notes[?round=n]` — today's `NotesPatch`; answers the whole `Notes` doc.
- `POST /p/<p>/__mock-review/approval[?round=n]` — `clientOk` (and owner `waive`); answers the `Approval` doc.
- `GET /p/<p>/__mock-review/events` — SSE `notes` | `approval` | `files`.
- `GET /p/<p>/__walkthrough/frame?screen=&state=&round=` —
  `{kind:'wireframe', round, screen, state, spec}` or
  `{kind:'screenshots', round, screen, state, images:[{width, url}]}` (widths descending).
- `GET /p/<p>/__walkthrough/image/<round>/<name>/<state>/<width>.png`.

Seam C (`Authorization: Bearer <WALKTHROUGH_API_TOKEN>`; `GET /v1` is open):

- `GET /v1` → `{apiVersion:1}`
- `POST /v1/projects/<p>/rounds` → 201 `{apiVersion, round, kind, status, viewports, screens, journeys:[{id, beats}]}`;
  a journey may carry `actor` (≤ 60 chars) and `variantOf` (another journey id of the same push,
  not itself a variant); both are served on `state.journeys[]` only when pushed;
  screenshots `screens[]` carry `upload` (the PUT path). 409 `round-exists`; 400 `bad-request`,
  `bad-journey`, `beats-mismatch`, `unknown-variant-of` (a journey's `variantOf` names no journey
  of the push), `chained-variant` (it names a journey that is itself a variant, or itself), `bad-spec` (`detail: {propCheck:'gray-catalog'|'structure-only', issues:[{screen,state,elementKey?,severity,code,message}]}`).
- `PUT /v1/projects/<p>/rounds/<n>/images/<name>--<state>--<width>` (raw PNG) →
  `{apiVersion, round, name, state, width, bytes, remaining, status}`; 400 `not-png`, 404
  `unknown-round` / `unknown-picture`, 409 `not-screenshots`.
- `GET /v1/projects/<p>/notes[?round=n]` → `{apiVersion, notes:[{id, round, screen, state, anchor, status, text, author, thread, at, project?}], journeys}`
- `POST /v1/projects/<p>/notes/<id>/reply` `{text}` → `{apiVersion, note}` (or `{apiVersion, journey}` for a journey id)
- `GET /v1/projects/<p>/approvals` → `{apiVersion, approvals:[{journey, by, round, beats, at, reason?}]}`
- `POST /v1/projects/<p>/rounds/<n>/mark` `{status}` → `{apiVersion, round, status}`; 409 `round-uploading`.

## Deviations from PROTOTYPE-PLAN.md, and why

1. **`notes.extra jsonb`** (added column). Today's Note carries page-owned passthrough fields
   (`snippet`, `whole`, `rect`, `viewport`, …) that the plan's columns have no place for; without
   them outdated-anchor detection (`snippet`) and whole-screen notes would silently change.
2. **`journeys.ord`, `screens.ord`** (added columns): push order for the sidebar and a screen's
   default (first) state. Postgres has no insertion order.
3. **`images.bytes` null = declared, not yet arrived.** This is how "hidden until every declared
   picture arrived" is tracked; no extra table.
4. **Seam B refusal bodies** keep today's human sentence in `error` (the page's `refusalOf` shows
   `body.error` verbatim) and add `code` (the kebab code), `detail`, `apiVersion`. Seam C uses
   `{error:'<kebab>', detail, apiVersion}` exactly.
5. **Push validation does more than the plan names:** only the `navigate` action is accepted, and
   its `params.to` must be a screen of the same round (`unknown_action`, `unknown_screen`); a journey
   step must name a pushed screen/state (`bad-journey`); the journey's `beats` is recomputed with
   `src/analysis/beats.ts` and must match when sent (`beats-mismatch`); the stored `beats` is always
   the server's hash. Names/states/journey ids are limited to `[A-Za-z0-9_.-]` without `--` so the
   `<name>--<state>--<width>` path is unambiguous.
6. **Screenshots-round viewports** default to the pushed widths as `"<w>x0"` (the page only reads
   the width); a push may send `viewports` explicitly.
7. **Notes are per project, not per round.** `state.notes` holds every note of the project (each with
   its `round`), so a round-1 note still shows on round 2 (acceptance 5). A new note's round is the
   note's own `round` field if the page sends one, else the `?round=` of the POST, else the latest
   visible round.
8. **Anchor** (amended by docs/design/client-view.md): `{node, index}` on a wireframe, `{x, y, width}`
   on a picture, or null — no `rect`, `w`, `h` or `viewport` any more. A sent anchor is validated
   against those two shapes (400 `bad-anchor` otherwise); without one it is derived from
   `component/key`. Older rows are served in the new shape (`normalizeAnchor` drops the drag-area
   fields; a node-less area reads as a whole-screen note).
13. **`pickedText`** (≤ 40 chars, stored in `notes.extra`) rides on every served note and on
    `GET /v1 …/notes`; a row written before it existed falls back to its `snippet`.
14. **`state.changes`** = `{since, screens:[{screen, state, change:'new'|'changed'|'same'}],
    journeys:[{id, change, steps:[i…]}]}` against the previous visible round (deep-equal specs;
    md5 of picture bytes per width); `since: null` on a first round. **`state.projectName`** =
    `projects.name`. `GET state` runs its reads in parallel (each is a network round-trip).
9. **`approveScreen`** answers 400 `unsupported-op` (no screen approvals in walkthrough). Owner
   `waive` works and is stored with `by:'owner'` and its `reason`.
10. **Approvals are per project+journey** (seam A's key); `approval.journeys[id]` also carries the
    `round` it was given on. Staleness = its `beats` differs from the shown round's journey `beats`.
11. **`/`** answers a plain-text hint; **`/__mock-review/ping`** exists under each project prefix.
12. **Catalog loading** goes through Vite's `ssrLoadModule` on every push (so edits apply without a
    restart); missing/broken → structure-only + one logged warning, unknown types still refused
    against the plan's 19 component names.

## Not done

- No automated tests (vitest) for these modules; `scripts/prove-server.mjs` is the only proof.
- `vite.walkthrough.config.ts` is outside `tsconfig.json`'s `include`, so `npm run typecheck`
  does not cover it (checked separately with `tsc` flags).
- No retention/cleanup of proof projects in the database.
