# Package: `@555/mock-review` CLI and file layer

Canonical reference for the headless CLI, the files it reads and writes, and the release
procedure. Source of truth: `specs/20260915/01-schemas-cli-and-bare-serve.md` (D1–D19). The
binding contract is the spec plugin's `spec/templates/mock/contract.json` (contractVersion 1);
every shape below has a zod schema in `src/schemas/`.

## Verbs

`mock-review <verb> [flags]`. `--json` is accepted at any argv position. JSON verbs write exactly
one `JSON.stringify(result) + "\n"` to stdout; every diagnostic goes to stderr. Each verb module is
loaded lazily, so `contract` never loads Vite or reads the host.

| Verb           | Argv                                                                 | stdout                                                                                                                                                                             | Exit                                                                                                                   |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `contract`     | `contract --json`                                                    | `{"contractVersion":1,"package":"@555/mock-review","version":"<package.json version>"}`                                                                                            | 0                                                                                                                      |
| `check`        | `check [--json]`                                                     | JSON: the `Check` object. Text: one line per finding `<severity> <kind> <file>: <message>`, then `ok` / `not ok`                                                                   | 0 (findings never change the exit)                                                                                     |
| `check --look` | —                                                                    | nothing; stderr `mock-review: --look lands in spec 02`                                                                                                                             | 2                                                                                                                      |
| `sweep`        | `sweep [--json]`                                                     | JSON: `{contractVersion:1, inventory, queue}`. Text: `queue empty` alone when no open items; else inventory lines, a blank line, then the queue grouped under `## <file>` headings | 0                                                                                                                      |
| `answer`       | `answer (--note <id> \| --journey <id>) --text <t> [--decision <d>]` | `answered <id>`                                                                                                                                                                    | 0; 2 on usage, unknown id (`no note <id>` / `no conversation for journey <id>`), or an invalid `design/decisions.json` |
| `serve`        | `serve`                                                              | first line: the server URL, no trailing slash                                                                                                                                      | runs until SIGINT/SIGTERM, then 0                                                                                      |
| anything else  | —                                                                    | nothing; stderr `mock-review: unknown verb <verb>`                                                                                                                                 | 2                                                                                                                      |

Every refusal prints `mock-review: <reason>` on stderr.

## File layer

All writes go through `writeJsonAtomic` (write `<path>.tmp`, then `rename`).

| File                    | Created by                                                                                                        | Written by                                                                                       | Rule                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `design/notes.json`     | any host verb (`check`, `sweep`, `answer`, `serve`) when absent: `{"contractVersion":1,"notes":[],"journeys":{}}` | `answer` (appends `{by:"session",text}`, sets `status: "answered"`); the reviewer page (spec 02) | never overwritten when present; the CLI never sets `approved` and never deletes             |
| `design/approval.json`  | any host verb when absent: `{"contractVersion":1,"screens":{},"journeys":{},"theme":null}`                        | the reviewer page (spec 02); the plugin's `client waive`                                         | the CLI never writes approval state                                                         |
| `design/decisions.json` | `answer --decision` when absent: `{"contractVersion":1,"decisions":[]}`                                           | `answer --decision` appends `{screen, text, at}`                                                 | a present file that fails to parse or validate is a refusal (exit 2), never replaced        |
| `design/.serve.json`    | `serve` after `listen()`: `{url, pid}`                                                                            | `serve`                                                                                          | deleted on SIGINT/SIGTERM/exit; a stale file is overwritten by the next `serve`; gitignored |

Liveness: `check` reports `serve.url` = the portfile's `url` only when
`GET <url>/__mock-review/ping` answers 200 within 500 ms; any error or timeout is `null`.

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

1. `npm run build` (writes `dist/`).
2. Commit `dist/`. It is committed at release only, never in a build batch.
3. `git tag -f v1`.
4. Push the tags.

Hosts install with `npm i -D github:555ventures/mock-review#v1`. There is no `prepare` script. The
runtime `dependencies` are `zod`, `react-docgen-typescript` and `typescript ~6.0.0`; `vite`, `react`
and `react-dom` are peers, and `playwright` is an optional peer.
