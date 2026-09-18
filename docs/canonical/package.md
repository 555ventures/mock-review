# Package: `@555-ventures/mock-review` CLI and file layer

Canonical reference for the headless CLI, the reviewer page and its server, the files they read and
write, and the release procedure. Source of truth:
`specs/20260915/01-schemas-cli-and-bare-serve.md` (D1–D19),
`specs/20260915/02-the-reviewer-page.md` (D1–D27) and
`specs/20260917/02-the-story-travels.md` (D1–D13) and
`specs/20260918/01-writes-never-tear-never-lose.md` (D1–D7). The
binding contract is the spec plugin's `spec/templates/mock/contract.json` (contractVersion 2);
every shape below has a zod schema in `src/schemas/`, and `CONTRACT_VERSION` in
`src/schemas/index.ts` is the one place the number lives.

**A journey step carries the client's sentence.** `check --json` accepts and echoes `step.beat`,
`step.state`, `edge.say` and `journey.persona`, all optional and omitted when absent; a step with no
beat is a `beats` warn finding, never a refusal. `GET state` adds one server-only field,
`journey.beats` — the 12-hex sha256 of the journey's story, computed over the steps `check --json`
reports and never over the page-normalised ones. The client's confirm is If-Match on that hash:
`{op:'clientOk', id, beats}` writes `approval.journeys[id] = {client:'ok', beats, at}` and answers
409 when the story moved under them. `approvedAt` is no longer written by anything; the
`approveJourney` op is gone. A note or journey conversation has four statuses — `open`, `answered`,
`approved`, `deferred` — and the narrow `close` op is how a note or journey conversation is ended.

## Verbs

`mock-review <verb> [flags]`. `--json` is accepted at any argv position. JSON verbs write exactly
one `JSON.stringify(result) + "\n"` to stdout; every diagnostic goes to stderr. Each verb module is
loaded lazily, so `contract` never loads Vite or reads the host.

| Verb           | Argv                                                                 | stdout                                                                                                                                                                             | Exit                                                                                                                                       |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `contract`     | `contract --json`                                                    | `{"contractVersion":2,"package":"@555-ventures/mock-review","version":"<package.json version>"}`                                                                                   | 0                                                                                                                                          |
| `check`        | `check [--json]`                                                     | JSON: the `Check` object. Text: one line per finding `<severity> <kind> <file>: <message>`, then `ok` / `not ok`                                                                   | 0 (findings never change the exit)                                                                                                         |
| `check --look` | `check --look <screen> [--state <s>]`                                | one written PNG path per line                                                                                                                                                      | 0; 2 with no running `serve`, without `playwright`, for an unknown screen, for a screen whose module fails to load, or for a bare `--look` |
| `sweep`        | `sweep [--json]`                                                     | JSON: `{contractVersion:2, inventory, queue}`. Text: `queue empty` alone when no open items; else inventory lines, a blank line, then the queue grouped under `## <file>` headings | 0                                                                                                                                          |
| `answer`       | `answer (--note <id> \| --journey <id>) --text <t> [--decision <d>]` | `answered <id>`                                                                                                                                                                    | 0; 2 on usage, unknown id (`no note <id>` / `no conversation for journey <id>`), or an invalid `design/decisions.json`                     |
| `serve`        | `serve`                                                              | first line: the server URL, no trailing slash                                                                                                                                      | runs until SIGINT/SIGTERM, then 0                                                                                                          |
| anything else  | —                                                                    | nothing; stderr `mock-review: unknown verb <verb>`                                                                                                                                 | 2                                                                                                                                          |

Every refusal prints `mock-review: <reason>` on stderr.

`serve` owns its own shutdown: Vite's `createServer()` registers `SIGINT`/`SIGTERM` handlers that
exit with 128+signal before any handler registered later runs, so the CLI removes them as soon as
`createServer()` resolves and installs its own — without that, `design/.serve.json` is never
deleted and the exit code is not 0.

## File layer

All writes go through `writeJsonAtomic`, which writes a per-process, per-write temporary file
(`<path>.<pid>.<hex>.tmp`) and then `rename`s it: the rename makes a write atomic, and the unique
name makes concurrent writes atomic. A failed rename unlinks its temporary file before rethrowing.

The package has three writers of `design/notes.json` and `design/approval.json` — the `serve`
server, the `answer` CLI, and the plugin's `client waive` — and serialises every package write to
those two documents through one exclusive `design/.lock`, held by one process at a time. One lock
covers both documents, because a notes mutation can write approval in the same critical section. A
lock is broken automatically when its holder pid is gone or its mtime is older than ten seconds; a
lock with an empty or unparseable body counts as held. A verb that cannot acquire it within two
seconds refuses with `design/ is locked by pid <N> — another mock-review write is in progress;
retry` rather than waiting — exit 2 from a CLI verb, `503` from a server write. Readers do not take
the lock. `design/.lock` is gitignored and never committed. The plugin's own `client waive` write
does not yet take the lock.

Default documents are created with an exclusive create (`wx`), so two verbs starting together
cannot clobber each other: the loser sees the file already present and writes nothing.

| File                    | Created by                                                                                                        | Written by                                                                                                                                             | Rule                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design/notes.json`     | any host verb (`check`, `sweep`, `answer`, `serve`) when absent: `{"contractVersion":2,"notes":[],"journeys":{}}` | `answer` (applies `{op:'reply', entry:{by:"session",text}}` through the shared reducer, so `status` becomes `"answered"`); the reviewer page (spec 02) | never overwritten when present; the CLI never sets `approved` and never deletes; a present file that does not parse makes a page write answer 409, never a rewrite; a present file at `contractVersion` `1` or `2` is accepted and rewritten at `2` by the first writer that touches it; a read-only verb leaves the file byte-identical |
| `design/approval.json`  | any host verb when absent: `{"contractVersion":2,"screens":{},"journeys":{},"theme":null}`                        | the reviewer page (spec 02); the plugin's `client waive`                                                                                               | the CLI never writes approval state; same 409 rule as `notes.json`; same `1`-or-`2` accept-and-rewrite rule as `notes.json`                                                                                                                                                                                                              |
| `design/decisions.json` | `answer --decision` when absent: `{"contractVersion":2,"decisions":[]}`                                           | `answer --decision` appends `{screen, text, at}`                                                                                                       | a present file that fails to parse or validate is a refusal (exit 2), never replaced; a present file at `contractVersion` `1` or `2` is accepted and rewritten at `2` by the first writer that touches it; a read-only verb leaves the file byte-identical                                                                               |
| `design/.serve.json`    | `serve` after `listen()`: `{url, pid}`                                                                            | `serve`                                                                                                                                                | deleted on SIGINT/SIGTERM/exit; a stale file is overwritten by the next `serve`; gitignored                                                                                                                                                                                                                                              |
| `design/.lock`          | any package write to `notes.json` or `approval.json`: `{pid, at}`                                                 | the writer holding it                                                                                                                                  | present only while a write is in flight; removed on release and by a once-per-module exit handler; broken when its holder pid is gone or its mtime is older than 10 s; gitignored as `design/.lock*`                                                                                                                                     |
| `design/screenshots/`   | `check --look`                                                                                                    | `check --look`                                                                                                                                         | one PNG per screen × state × viewport × scheme, named `<screen>-<state>-<WxH>-<scheme>.png`, the state in its `examples`-key casing                                                                                                                                                                                                      |

Liveness: `check` reports `serve.url` = the portfile's `url` only when
`GET <url>/__mock-review/ping` answers 200 within 500 ms; any error or timeout is `null`.

## Design document reads

`design/notes.json` and `design/approval.json` have one readability verdict:
`readDesignDoc(cwd, kind: 'notes' | 'approval')` in `src/files/json.ts`, beside
`ensureDesignFiles`. It returns `{ok: true, doc}` or `{ok: false, error}` and is THE predicate —
every reader in the package derives from it, then chooses its own policy explicitly; nobody writes
its own `try { readJson(...) } catch`. `readDesignDocOrThrow` is the write path's form of the same
verdict, thrown as `UnparseableDesignFileError` and turned into a 409 by both `POST notes` and
`POST approval`. `ok: false` never means the file is absent — `ensureDesignFiles` runs first in
every host-touching verb and creates both documents when missing — it means the file exists and
cannot be used: malformed JSON, an unknown `contractVersion`, or a shape this package has not
learned.

Five call sites, four deliberate policies, one fact underneath: `buildState` (`GET state`) reports
the outcome and serves the existing `EMPTY_NOTES`/`EMPTY_APPROVAL` value as a documented
**placeholder**, never a claim that the file is actually empty — every other field (`screens`,
`shells`, `journeys`, `themes`, `config`, `inventory`) is built before this read runs and is
unaffected by it failing. Both `POST notes` and `POST approval` refuse 409, file left
byte-identical. `sweep` and `answer` refuse on stderr at exit 2 with
`design/<file> exists but does not parse — refusing to write until it's fixed by hand`, no zod
stack. `check`'s `themeFor` derives from `readDesignDoc` too but deliberately keeps its own
permissive policy on top of it, returning `undefined` on an unreadable or unpicked approval
document — a screenshot capture must never fail over a theme.

`GET /__mock-review/state` carries the verdict as a required, always-emitted `documents: {notes:
DocOutcome, approval: DocOutcome}`, `DocOutcome = {ok: true} | {ok: false, error: string}`
(`.strict()` on both members — no `error` when `ok: true`, `error` required when `ok: false`). It
is per-document and structured rather than one joined string because a client-page job that wants
to word an error or gate a write **per file** cannot match a string back to a file without
re-parsing it. The page does not read `documents` yet and surfaces no read-failure state — whether
the client ever sees an unreadable document, its wording, and whether it gates the composer are
open questions carried to a later client-page spec; this mechanism only makes the fact available.

Read-back document schemas (`src/schemas/notes.ts`, `src/schemas/approval.ts`) follow one written
rule: **a read-back schema validates only what this package itself reads or writes; everything
else passes through, and `contractVersion` is validated as "known", not "equal".** `Approval.theme`
is `z.string().nullable().default(null)` under this rule, because the plugin's own `defaultApproval`
fixture omits the key entirely. Schema normalisation this way is part of the read verdict, not
drift from it — a document that parses with a default filled in is `ok: true`, and the filled value
is what gets served, not the raw bytes. The rule is hygiene, not a fix: it lowers how often a
document drifts out of readability but does not close the class, because the failure that started
this — a _missing required key_ — is not an unknown key, and no `.passthrough()` ever covers it.
Reportability, not leniency, is what closes it; a future reader must not "fix" this class with
another `.optional()`.

## The reviewer page

`serve` mounts the package's Vite plugin on the host's own dev server. `GET /` — owner,
`?client=<token>` and `?frame=1` alike — answers one HTML document whose single module script is
`/@id/__x00__mock-review:entry`; the plugin resolves that virtual id to one import of the package's
`src/ui/main.tsx`, which loads the reviewer or, when the URL carries `frame`, the mock frame. Both
compile through the host's own Vite pipeline (aliases, `@vitejs/plugin-react`, `@tailwindcss/vite`),
so the package ships its reviewer as source (`files` includes `src/ui`) and no prebuilt page. The
reviewer's stylesheet uses `@import "tailwindcss" source(none)` with `@source "./"`, so its classes
come from `src/ui/` only and the host's stylesheet never scans the package. The plugin is
`apply: 'serve'`: a host that lists `mockReview()` in its `vite.config.ts` builds clean, and such a
host must be an ESM package (`"type": "module"`). Inside `serve` nothing creates a second Vite
server: every host module load goes through the running server's own SSR runner. A one-shot verb
(`check`, `check --look`) keeps its own short-lived server and its own
`node_modules/.vite/mock-review-check` cache, so it can never evict the deps `serve` is serving.

The package never loads its own copy of Vite. `src/analysis/host-modules.ts` resolves `vite` from the host root (`createRequire(<root>/package.json)`) and imports it dynamically; `check`'s one-shot server and `serve` both use that copy. A host whose vite major is not 8 is refused (`mock-review needs vite 8 in the host; found vite <v> at <dir>`); a host with no vite at all gets the package's own copy plus a stderr warning. The SSR environment is narrowed by shape (`runner.import` is a function, `runnerOf` in `src/analysis/vite-runner.ts`), never with vite's `isRunnableDevEnvironment`, which is an `instanceof` against one copy's class. `serve` probes the runner once before it listens: a runtime that cannot supply a module runner exits 2 with one stderr line and no URL. `serve` still never refuses to start over a bad `mock.config.ts` — that stays a `config` finding / `NULL_CONFIG`.

The plugin owns the HMR boundary between the host and the reviewer with one `hotUpdate` hook,
installed unconditionally and ordered `pre` so it runs ahead of every host plugin in every mount
(`serve` and a host's own `vite.config.ts` alike). In the client environment, any change under
`<root>/design/` (the contract files, their `.tmp` siblings, the drivers' `mocks/*`,
`doctrine.md`, `shell/app.html`, screenshots) returns `[]` and sends nothing, so
`@tailwindcss/vite`'s automatic source detection — which scans `design/**` whenever the host
stylesheet imports Tailwind without `source()` — never full-reloads the page on a save; the SSE
`notes`/`approval` events remain the reviewer's only signal. Any change under `<root>/src/` sends
the custom `mock-review:frame-reload` event (the frame document alone listens and reloads) and
returns `[]`. Everything else, and every non-client environment, keeps Vite's default handling;
Vite's own `full-reload` for an edited `.html` file carries that file's path and is inert for
documents served at `/`. A host may add `@source not "../design";` to its stylesheet as an
optimisation; nothing requires it. `mockReview()` takes no options.

### Server API

All endpoints live under `/__mock-review/`, and every write goes through `writeJsonAtomic` under one
in-process lock, and inside it the cross-process `design/.lock` around the read→apply→write span
only. `buildState` never runs while `design/.lock` is held: a `close` that needs the
journey-existence probe runs it before taking the file lock, and the locked re-read is
authoritative. A write that cannot acquire `design/.lock` answers `503 {error}` with the lock
sentence — retryable, distinct from the `409` an unreadable document answers.

| Route               | Method | Body / answer                                                                                                                                                                                        |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | GET    | 200, no body — the liveness probe `check` uses                                                                                                                                                       |
| `state`             | GET    | `{screens, shells, journeys, themes, config, inventory, violations, notes, approval, role}`; `screens[]` and `inventory[]` each carry their module's `examples` keys                                 |
| `notes`             | POST   | `{op:'add', note} \| {op:'update', id, fields} \| {op:'remove', id} \| {op:'reply', id, entry:{by:'owner'\|'session', text}} \| {op:'close', id, status: 'approved'\|'deferred'}` → the new document |
| `approval`          | POST   | `{op:'approveScreen'\|'unapproveScreen', name} \| {op:'clientOk', id, beats} \| {op:'theme', key}` → the new document                                                                                |
| `events`            | GET    | SSE: `notes`, `approval`, `files` (the last debounced 200 ms, fired for `src/**` and `mock.config.ts`); the page refetches `state` on each                                                           |
| `/r/registry.json`  | GET    | the in-memory shadcn registry of the host's own components                                                                                                                                           |
| `/` and `/?frame=1` | GET    | the entry document (one template for both; `?frame=1` selects the frame branch in `main.tsx`)                                                                                                        |

Refusals: 400 for a body that is not JSON, for a patch that fails its schema, for an `add` carrying
its own `id`, for an `update` whose `fields` carry `status` or `thread` (refused by name), for a `reply` whose trimmed `text` is empty, for approving a screen with no row in the current state (never a written empty hash),
and for `clientOk` against an unknown journey or one whose `beats` is still `null`; 404 for an
`update`, `remove`, `reply` or `close` of an unknown note or journey conversation (checked before any
client-ownership gate); 409 when the target file exists but does not parse, or when a `clientOk`'s
`beats` no longer matches the hash `GET state` would serve now (`design/approval.json` left
byte-identical); 403 by role, and for a client's `close` of a note or journey conversation whose
`thread[0].by` is not `'client'`.

### Roles

A request whose own `?client=<token>` matches `config.client.token` is the **client**, and the answer
sets `mock-review-client=<token>; Path=/; HttpOnly; SameSite=Lax`. A present but mismatched
`?client=` clears that cookie. A request carrying the cookie is the client. Otherwise the request is
the **owner** only when its socket is loopback and it carries none of `X-Forwarded-For`, `Forwarded`
or `Cf-Connecting-Ip`; anything else is refused with 403. The `Referer` is never consulted, and the
frame URL carries no token — the cookie is what reaches the modules the frame itself loads. The
cookie is validated against the config on every request, so it survives a restart and dies when the
token changes; the page then shows one line saying the link is no longer valid. A client may add
notes (stored with `by: 'client'`), reply to any note or journey (the server stores the entry with
`by: 'client'` whatever the wire says — the wire enum has no `'client'`), confirm a journey, and
Approve or Defer a note they raised; approving anything else is the owner's. `ping`, the page's static assets and Vite's own module routes are never gated, so a
client can read the mock's source: that is accepted. Raw TCP forwards (`ssh -L`) present as loopback
and read as owner — HTTP tunnels are the supported way to share a link.

### Frame URL grammar

`/?frame=1[&_theme=<key>]#/<screen>?state=<s>&scheme=<light|dark>`, or `#/__component?name=&example=`
for a catalog preview. A state or scheme change replaces the hash, which never reloads the iframe; a
theme change moves `_theme` in the real query string precisely so the browser does reload it, because
the frame reads its theme once from that parameter at load. `scheme=dark` adds `dark` to the frame's
`<html>`; the reviewer itself is light-only.

One module owns this grammar: `src/ui/frame/frameRoute.ts` (`parseFrameHash`, `buildFrameHash`,
`sameScreenState`, `frameSrc`, `replaceFrameHash`). Every builder (`DeviceFrames`, the catalog
`Preview`, `check --look`) and every parser (the frame entry, the journey guide) goes through it;
values are `encodeURIComponent`-encoded on the way out and read through `URLSearchParams` on the way
in, so `%20` and `+` both mean a space. `src/analysis/look.ts` importing it is the one sanctioned
`analysis → ui` import; the package build therefore emits `dist/ui/frame/frameRoute.js` as the only
compiled file under `dist/ui/`.

### The frame boundary

The reviewer never writes to the frame's document — no attribute, class, inline style, node or
stylesheet, and no mutation of a host control's style. It reads and measures, listens (capture-phase
click, scroll, resize and mutation observers built from the frame's realm), and navigates (hash
replace, `scrollTo`). Anything the reviewer needs to show _on_ the mock — note boxes, pins, the
journey ring — is measured in the frame and drawn in the reviewer document inside the same scaled
wrapper as the iframe, where the frame's own rects are already in local coordinates. The journey ring
is `[data-journey-ring]`, one per found control, hidden when the control is not visible in the frame's
viewport or is clipped by a scrolling ancestor, styled by the reviewer's `index.css`.

### Approval semantics

`approveScreen` records the screen's current hash, the ISO time, its states, the configured viewports
and schemes, and any existing screenshots. A new note on a screen, or a note there turning `open`,
deletes that screen's approval — including when an edit moves a note between screens, which
un-approves both. Any reply on a journey reopens it without touching approval. The server owns these
rules, so the CLI and the page cannot disagree.

### One reply, one close

A thread is appended only through `op:'reply'`, which both roles and the `answer` CLI share, and no
thread is ever sent from a browser. The author decides the resulting status from any current status —
a reply by the session answers the note, a reply by anyone else reopens it — and a note reopened by
a reply un-approves its screen. `op:'update'` carries anchor fields only and refuses `status` and
`thread` by name; `op:'journey'` is retired, its two halves being `reply` and `close`. A note is
ended only by `op:'close'`, which the page issues for Approve and for Defer: the client may end a
note they raised (Approve · Defer while it is open or answered), the owner may end any answered note
(Reject · Approve · Defer) and delete an open one. A deferred note renders in its own muted-grey
pin tone, its panel row and dialog title carry the word `Deferred`, and it still counts as closed in
every aggregate dot.

## Check pipeline order

1. Ensure `design/notes.json` and `design/approval.json` exist.
2. Discover the host by filesystem globbing from the cwd: `src/screens/*.tsx`,
   `src/components/*.tsx` (never `src/components/ui/**`, and never a file the shadcn vite scaffold
   itself writes there — currently `theme-provider.tsx`), `src/shells/*.tsx`, `src/records/*.ts`,
   `src/themes/*.css`, `src/journeys.ts`, `mock.config.ts`. `design/examples/` is never read.
3. Load `mock.config.ts` and validate it with the config schema.
4. Open one silent Vite dev server in middleware mode on the host's `vite.config.ts`, and import
   modules through `server.environments.ssr.runner`.
5. Screens (`meta`, `examples`, `renderToString` per example), shells, and journeys; then close the
   server.
6. TypeScript pre-emit diagnostics from `tsconfig.app.json`, filtered to `src/`.
7. Layer, doc, size and states checks.
8. Liveness.
9. Validate with `CheckSchema`, then print.

A runner failure that is not per-state is one `config` finding on `vite.config.ts`, and the report
still prints with empty screens, shells and journeys.

## Finding kinds

`ok = !findings.some(f => f.severity === 'error')`.

| Kind     | Severity | Fires when                                                                                                                                   | `message`                                                                            |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `type`   | error    | a TypeScript pre-emit diagnostic under `src/`                                                                                                | `TS<code>: <text> at <line>:<col>`                                                   |
| `layer`  | error    | a screen imports anything other than `react`, `react/…`, `@/components/ui/…`, `@/components/…`, `@/shells/…`, `@/records/…` (one per import) | `imports <specifier>`                                                                |
| `doc`    | error    | a component or shell lacks a `/** … */` line above an export, or lacks a named `examples` export                                             | `missing doc line` / `missing examples export`                                       |
| `render` | error    | an `examples` entry throws in `renderToString`                                                                                               | `<examples key>: <error.message>` (e.g. `Broken: boom`)                              |
| `render` | error    | a screen module throws on import (the only finding for that file)                                                                            | `module failed to load: <error.message>`                                             |
| `render` | error    | a loaded screen module has no `meta`                                                                                                         | `meta: missing`                                                                      |
| `config` | error    | `mock.config.ts` is missing, unloadable, or fails the schema                                                                                 | the first line of the zod pretty error                                               |
| `size`   | warn     | a screen over 150 lines                                                                                                                      | `<n> lines`                                                                          |
| `states` | warn     | a `meta.states` entry has no exact and no normalised `examples` key                                                                          | `state <s> has no example`                                                           |
| `states` | warn     | a `meta.states` entry has no exact key and two or more normalised ones                                                                       | `state <s> matches several examples: <k1>, <k2>`                                     |
| `beats`  | warn     | a journey's steps are not all beat-bearing (`src/journeys.ts`, one per affected journey)                                                     | `journey <id> step <n> has no beat — \`--mark journey-drawn\` will refuse this step` |
| `twin`   | warn     | never emitted yet                                                                                                                            | —                                                                                    |

A state resolves to an example key by one rule, `resolveStates` in `src/ui/frame/stateKey.ts`, used
by `check`, the reviewer's state list, journey steps and the frame: an exact key first, otherwise
the one key whose `stateKey` (lowercase, strip `[^a-z0-9]`) equals the state's; each key binds to at
most one state, and an ambiguous state binds to nothing.

Journey edges never produce findings. An edge resolves when the default example's rendered HTML
contains `data-to="<edge.label>"`. Otherwise it lands in `journeys[].unresolved` with reason
`edge has no label`, `step <from> names unknown screen <s>`, or
`no control with data-to="<label>" on <screen>`.

## Tests and builds

Tests never write the committed `dist/`. `tests/setup.ts` compiles `tsconfig.build.json` into the
gitignored `.test-dist/` with `tsc` alone, rebuilding whenever `src/**` is newer, under a lock; the
reviewer needs no build. Browser tests run both layouts: the linked package (the repo's
`.test-dist`) and a package materialised under a scratch host's `node_modules/@555-ventures/mock-review/`.

`tests/package/two-vite-copies.test.ts` runs the host's own `vite` binary with `mockReview()` mounted from `.test-dist/vite.js`, plus `check` and `serve` from the bin, against a scratch host whose `node_modules/vite` is a physical copy of the repo's (a different realpath — the `npm link` layout without the network), and runs `serve`/`check` against a fake vite 9. Spawn `node_modules/vite/bin/vite.js` directly there: `node_modules/.bin/vite` in a per-entry-symlinked host points back at the repo's copy. `tests/package/vite-imports.test.ts` bans runtime `vite` imports under `src/` outside `src/analysis/host-modules.ts`.

## Release procedure

1. `npm run build` (writes `dist/`: the compiled CLI and plugin only).
2. Commit `dist/`. It is committed at release only, never in a build batch.
3. `git tag -f v2`.
4. Push the tags.

Hosts install with `npm i -D github:555ventures/mock-review#v2`. The package major equals the contract
version, so a contract bump is a major bump and the install tag moves with it. There is no `prepare` script. The
runtime `dependencies` are `zod`, `react-docgen-typescript` and `typescript ~6.0.0`; `vite`, `react`
and `react-dom` are peers, and `playwright` is an optional peer. The runtime `dependencies` also
carry the reviewer's UI libraries (`radix-ui`, `cmdk`, `lucide-react`, `class-variance-authority`,
`clsx`, `tailwind-merge`, `react-resizable-panels`, `tw-animate-css`, `@fontsource-variable/geist`);
`tailwindcss ^4` is a peer; the host provides `@vitejs/plugin-react` and `@tailwindcss/vite`.

## Note scope and the status dots

A note is one of exactly two kinds. A **project note** carries `project: true` and no screen,
state, component, key or snippet; it is a product-wide request that belongs to no screen. A
**screen note** carries a real `screen` and no `project` marker. The write path enforces the pair
— `POST notes` answers 400 for an `add`, or an `update` whose merged result, that claims one kind
while carrying the other's fields. The read-back schemas stay permissive on purpose, so a
document written by an older build always loads.

The reviewer page's notes panel shows exactly two groups: the notes on the screen being viewed,
and the project's own notes. A note anchored to another screen is never listed; it is reached
through that screen's sidebar entry.

A status dot reports where its own item sits in the review lifecycle, over its own notes only:
red when any note is open, yellow when none is open and any is answered, blue when it has notes
and every one is approved, and no dot at all when nothing has been raised. A screen with no notes
shows blue only when the owner used the separate "Approve screen" control. Journeys derive their
dot from their own conversation and never from the screens their steps visit.
