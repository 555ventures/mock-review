# Package: `@555/mock-review` CLI and file layer

Canonical reference for the headless CLI, the reviewer page and its server, the files they read and
write, and the release procedure. Source of truth:
`specs/20260915/01-schemas-cli-and-bare-serve.md` (D1–D19) and
`specs/20260915/02-the-reviewer-page.md` (D1–D27). The
binding contract is the spec plugin's `spec/templates/mock/contract.json` (contractVersion 1);
every shape below has a zod schema in `src/schemas/`.

## Verbs

`mock-review <verb> [flags]`. `--json` is accepted at any argv position. JSON verbs write exactly
one `JSON.stringify(result) + "\n"` to stdout; every diagnostic goes to stderr. Each verb module is
loaded lazily, so `contract` never loads Vite or reads the host.

| Verb           | Argv                                                                 | stdout                                                                                                                                                                             | Exit                                                                                                                                       |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `contract`     | `contract --json`                                                    | `{"contractVersion":1,"package":"@555/mock-review","version":"<package.json version>"}`                                                                                            | 0                                                                                                                                          |
| `check`        | `check [--json]`                                                     | JSON: the `Check` object. Text: one line per finding `<severity> <kind> <file>: <message>`, then `ok` / `not ok`                                                                   | 0 (findings never change the exit)                                                                                                         |
| `check --look` | `check --look <screen> [--state <s>]`                                | one written PNG path per line                                                                                                                                                      | 0; 2 with no running `serve`, without `playwright`, for an unknown screen, for a screen whose module fails to load, or for a bare `--look` |
| `sweep`        | `sweep [--json]`                                                     | JSON: `{contractVersion:1, inventory, queue}`. Text: `queue empty` alone when no open items; else inventory lines, a blank line, then the queue grouped under `## <file>` headings | 0                                                                                                                                          |
| `answer`       | `answer (--note <id> \| --journey <id>) --text <t> [--decision <d>]` | `answered <id>`                                                                                                                                                                    | 0; 2 on usage, unknown id (`no note <id>` / `no conversation for journey <id>`), or an invalid `design/decisions.json`                     |
| `serve`        | `serve`                                                              | first line: the server URL, no trailing slash                                                                                                                                      | runs until SIGINT/SIGTERM, then 0                                                                                                          |
| anything else  | —                                                                    | nothing; stderr `mock-review: unknown verb <verb>`                                                                                                                                 | 2                                                                                                                                          |

Every refusal prints `mock-review: <reason>` on stderr.

## File layer

All writes go through `writeJsonAtomic` (write `<path>.tmp`, then `rename`).

| File                    | Created by                                                                                                        | Written by                                                                                       | Rule                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `design/notes.json`     | any host verb (`check`, `sweep`, `answer`, `serve`) when absent: `{"contractVersion":1,"notes":[],"journeys":{}}` | `answer` (appends `{by:"session",text}`, sets `status: "answered"`); the reviewer page (spec 02) | never overwritten when present; the CLI never sets `approved` and never deletes; a present file that does not parse makes a page write answer 409, never a rewrite |
| `design/approval.json`  | any host verb when absent: `{"contractVersion":1,"screens":{},"journeys":{},"theme":null}`                        | the reviewer page (spec 02); the plugin's `client waive`                                         | the CLI never writes approval state; same 409 rule as `notes.json`                                                                                                 |
| `design/decisions.json` | `answer --decision` when absent: `{"contractVersion":1,"decisions":[]}`                                           | `answer --decision` appends `{screen, text, at}`                                                 | a present file that fails to parse or validate is a refusal (exit 2), never replaced                                                                               |
| `design/.serve.json`    | `serve` after `listen()`: `{url, pid}`                                                                            | `serve`                                                                                          | deleted on SIGINT/SIGTERM/exit; a stale file is overwritten by the next `serve`; gitignored                                                                        |
| `design/screenshots/`   | `check --look`                                                                                                    | `check --look`                                                                                   | one PNG per screen × state × viewport × scheme, named `<screen>-<state>-<WxH>-<scheme>.png`, the state in its `examples`-key casing                                |

Liveness: `check` reports `serve.url` = the portfile's `url` only when
`GET <url>/__mock-review/ping` answers 200 within 500 ms; any error or timeout is `null`.

## The reviewer page

`serve` mounts the package's Vite plugin on the host's own dev server and serves the reviewer page,
prebuilt into `dist/page/` and resolved relative to the compiled server module (so a test build in
`.test-dist/` serves its own page). The mock itself renders in an iframe through the host's Vite
pipeline: the frame document loads `dist/frame/entry.tsx` over Vite's `/@fs/` route, which is why
the frame compiles with the host's aliases, CSS and plugins. When either file is missing, `serve`
logs one line to stderr naming it and the affected route answers 503 rather than a blank 200.

Inside `serve` nothing creates a second Vite server: every host module load goes through the running
server's own SSR runner. A one-shot verb (`check`, `check --look`) keeps its own short-lived server
and its own `node_modules/.vite/mock-review-check` cache, so it can never evict the deps `serve` is
serving.

### Server API

All endpoints live under `/__mock-review/`, and every write goes through `writeJsonAtomic` under one
in-process lock.

| Route               | Method | Body / answer                                                                                                                                                        |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping`              | GET    | 200, no body — the liveness probe `check` uses                                                                                                                       |
| `state`             | GET    | `{screens, shells, journeys, themes, config, inventory, violations, notes, approval, role}`; `screens[]` and `inventory[]` each carry their module's `examples` keys |
| `notes`             | POST   | `{op:'add', note} \| {op:'update', id, fields} \| {op:'remove', id} \| {op:'journey', id, status?, entry?}` → the new document                                       |
| `approval`          | POST   | `{op:'approveScreen'\|'unapproveScreen', name} \| {op:'approveJourney'\|'clientOk', id} \| {op:'theme', key}` → the new document                                     |
| `events`            | GET    | SSE: `notes`, `approval`, `files` (the last debounced 200 ms, fired for `src/**` and `mock.config.ts`); the page refetches `state` on each                           |
| `/r/registry.json`  | GET    | the in-memory shadcn registry of the host's own components                                                                                                           |
| `/` and `/?frame=1` | GET    | the prebuilt page; the frame document                                                                                                                                |

Refusals: 400 for a body that is not JSON, for a patch that fails its schema, for an `add` carrying
its own `id`, and for approving a screen with no row in the current state (never a written empty
hash); 404 for an `update` or `remove` of an unknown note; 409 when the target file exists but does
not parse; 403 by role.

### Roles

A request whose own `?client=<token>` matches `config.client.token` is the **client**, and the answer
sets `mock-review-client=<token>; Path=/; HttpOnly; SameSite=Lax`. A present but mismatched
`?client=` clears that cookie. A request carrying the cookie is the client. Otherwise the request is
the **owner** only when its socket is loopback and it carries none of `X-Forwarded-For`, `Forwarded`
or `Cf-Connecting-Ip`; anything else is refused with 403. The `Referer` is never consulted, and the
frame URL carries no token — the cookie is what reaches the modules the frame itself loads. The
cookie is validated against the config on every request, so it survives a restart and dies when the
token changes; the page then shows one line saying the link is no longer valid. A client may add
notes (stored with `by: 'client'`), reply to journeys and confirm one; approving anything else is
the owner's. `ping`, the page's static assets and Vite's own module routes are never gated, so a
client can read the mock's source: that is accepted. Raw TCP forwards (`ssh -L`) present as loopback
and read as owner — HTTP tunnels are the supported way to share a link.

### Frame URL grammar

`/?frame=1[&_theme=<key>]#/<screen>?state=<s>&scheme=<light|dark>`, or `#/__component?name=&example=`
for a catalog preview. A state or scheme change replaces the hash, which never reloads the iframe; a
theme change moves `_theme` in the real query string precisely so the browser does reload it, because
the frame reads its theme once from that parameter at load. `scheme=dark` adds `dark` to the frame's
`<html>`; the reviewer itself is light-only.

### Approval semantics

`approveScreen` records the screen's current hash, the ISO time, its states, the configured viewports
and schemes, and any existing screenshots. A new note on a screen, or a note there turning `open`,
deletes that screen's approval — including when an edit moves a note between screens, which
un-approves both. Any reply on a journey reopens it without touching approval. The server owns these
rules, so the CLI and the page cannot disagree.

## Check pipeline order

1. Ensure `design/notes.json` and `design/approval.json` exist.
2. Discover the host by filesystem globbing from the cwd: `src/screens/*.tsx`,
   `src/components/*.tsx` (never `src/components/ui/**`), `src/shells/*.tsx`, `src/records/*.ts`,
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

| Kind     | Severity | Fires when                                                                                                                                   | `message`                                               |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `type`   | error    | a TypeScript pre-emit diagnostic under `src/`                                                                                                | `TS<code>: <text> at <line>:<col>`                      |
| `layer`  | error    | a screen imports anything other than `react`, `react/…`, `@/components/ui/…`, `@/components/…`, `@/shells/…`, `@/records/…` (one per import) | `imports <specifier>`                                   |
| `doc`    | error    | a component or shell lacks a `/** … */` line above an export, or lacks a named `examples` export                                             | `missing doc line` / `missing examples export`          |
| `render` | error    | an `examples` entry throws in `renderToString`                                                                                               | `<examples key>: <error.message>` (e.g. `Broken: boom`) |
| `render` | error    | a screen module throws on import (the only finding for that file)                                                                            | `module failed to load: <error.message>`                |
| `render` | error    | a loaded screen module has no `meta`                                                                                                         | `meta: missing`                                         |
| `config` | error    | `mock.config.ts` is missing, unloadable, or fails the schema                                                                                 | the first line of the zod pretty error                  |
| `size`   | warn     | a screen over 150 lines                                                                                                                      | `<n> lines`                                             |
| `states` | warn     | a `meta.states` entry has no case-insensitively equal `examples` key                                                                         | `state <s> has no example`                              |
| `twin`   | warn     | never emitted yet                                                                                                                            | —                                                       |

Journey edges never produce findings. An edge resolves when the default example's rendered HTML
contains `data-to="<edge.label>"`. Otherwise it lands in `journeys[].unresolved` with reason
`edge has no label`, `step <from> names unknown screen <s>`, or
`no control with data-to="<label>" on <screen>`.

## Tests and builds

Tests never write the committed `dist/`. `tests/setup.ts` compiles `tsconfig.build.json` into the
gitignored `.test-dist/`, rebuilding whenever `src/**` is newer, under a lock. Every CLI test spawns
`.test-dist/cli.js`.

## Release procedure

1. `npm run build` (writes `dist/`: the compiled CLI, `dist/page/` from `vite.page.config.ts`, and a
   copy of the frame entry at `dist/frame/entry.tsx`).
2. Commit `dist/`. It is committed at release only, never in a build batch.
3. `npm run release:check` — it must pass. It asserts that every `dist/` entry the plugin serves
   exists, is git-tracked with a clean `dist/`, that the copied frame entry matches its source, that
   no commit after the last `dist/` commit touched `src/`, `vite.page.config.ts` or
   `tsconfig.build.json`, and that the built page references its own asset base. It never runs under
   `npm run check`, because `dist/` is stale by design between releases.
4. `git tag -f v1`.
5. Push the tags.

Hosts install with `npm i -D github:555ventures/mock-review#v1`. There is no `prepare` script. The
runtime `dependencies` are `zod`, `react-docgen-typescript` and `typescript ~6.0.0`; `vite`, `react`
and `react-dom` are peers, and `playwright` is an optional peer.
