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
| `check` | `mock-review check [--json] [--look <screen> [--state <s>]]` | Loads the host through one Vite dev server, reports findings, screens, shells, journeys, themes, config and serve liveness. `--look` captures screenshots instead (see below). |
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

## The reviewer page

`npx mock-review serve` starts the reviewer page's server and prints its URL. Open it to browse
screens, shells and journeys, draw notes, and approve screens/journeys/theme.

Add `?client=<token>` (matching `mock.config.ts`'s `client.token`) to open the page in the
**client role**: Search, Components and every Delete/Reject/Approve control are hidden, and each
journey panel shows a **Confirm journey** button instead. A wrong or missing token renders the
normal owner page.

### Screenshots (`check --look`)

`mock-review check --look <screen> [--state <s>]` requires a running `serve` and `playwright`
installed in the host (`npm i -D playwright`). It captures the screen at every
`config.targets.viewports × schemes` combination (or just the given `--state`, otherwise every
state) and writes:

```
design/screenshots/<screen>-<state>-<WxH>-<scheme>.png
```

e.g. `design/screenshots/home-Default-1280x800-light.png`. One path is printed per line.

## Development

```sh
npm run check   # typecheck, lint, tests
```

## Release

```sh
npm run build           # tsc -p tsconfig.build.json, vite build, copy frame entry
git add dist
git commit
npm run release:check   # must pass — verifies dist/ is complete, committed and in sync
git tag -f v1
git push --tags
```
