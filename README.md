# @555/mock-review

The mock reviewer for the spec pipeline's mock app: the `mock-review` CLI and the served
reviewer page, satisfying contract v1 (`~/projects/claude-plugins/spec/templates/mock/contract.json`).

## Install

```sh
npm i -D github:555ventures/mock-review#v1
```

`dist/` is committed to the tag, so no build runs on the host.

## Verbs

| Verb | Form | What it does |
|------|------|---------------|
| `contract` | `mock-review contract --json` | Prints `{ contractVersion, package, version }`. Never touches the host filesystem or Vite. |
| `check` | `mock-review check [--json]` | Loads the host through one Vite dev server, reports findings, screens, shells, journeys, themes, config and serve liveness. `check --look` is spec 02's page and refuses here. |
| `sweep` | `mock-review sweep [--json]` | One `react-docgen-typescript` pass over components/shells plus the open-item queue (open journey conversations first, then open notes). |
| `answer` | `mock-review answer (--note <id> \| --journey <id>) --text <t> [--decision <d>]` | Appends to a note's or journey's thread as `by: "session"`, marks it `answered`, optionally records a decision. |
| `serve` | `mock-review serve` | Starts the bare reviewer server, prints its URL, writes `design/.serve.json`, and runs until `SIGINT`/`SIGTERM`. |

Every JSON verb writes exactly one `JSON.stringify(result) + "\n"` to stdout; every diagnostic
goes to stderr as `mock-review: <reason>`. Exit 0 on success, 2 on usage or refusal.

## Host layout

A host app the CLI runs against is discovered by filesystem globbing relative to its cwd:

```
mock.config.ts            # default export: { name, port, targets, theme, client }
src/screens/*.tsx         # one meta + examples export per screen
src/components/*.tsx      # never src/components/ui/**
src/shells/*.tsx
src/records/*.ts
src/themes/*.css
src/journeys.ts           # exports `journeys`
design/notes.json         # created with its empty default when absent
design/approval.json      # created with its empty default when absent
design/decisions.json     # created on the first `answer --decision`
design/.serve.json        # the running `serve`'s portfile — never committed
design/examples/          # never read by this package
```

## Development

```sh
npm run check   # typecheck, lint, tests
```

## Release

```sh
npm run build     # tsc -p tsconfig.build.json
git add dist
git commit
git tag -f v1
git push --tags
```
