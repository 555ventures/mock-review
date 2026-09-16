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

`npx mock-review serve` starts the host's own Vite dev server with the package's Vite plugin
mounted, and prints its URL. Open it to browse screens, shells and journeys, draw notes, and
approve screens/journeys/theme. The reviewer ships as source (`src/ui/`) and compiles through the
host's own Vite pipeline (`@vitejs/plugin-react`, `@tailwindcss/vite`) — there is no prebuilt page.

Add `?client=<token>` (matching `mock.config.ts`'s `client.token`) to open the page in the
**client role**: Search, Components and every Delete/Reject/Approve control are hidden, and each
journey panel shows a **Confirm journey** button instead. A wrong or missing token renders the
normal owner page.

### Mounting in a host

A host can mount `mockReview()` from `@555/mock-review/vite` in its own `vite.config.ts` alongside
`react()` and `tailwindcss()`; the plugin is `apply: 'serve'` so it never affects `vite build`. This
requires the host to be an ESM package (`"type": "module"` in its `package.json`) because
`@555/mock-review/vite` is ESM-only and Vite 8 bundles a CJS-typed host config with `require`. The
host must also provide `@vitejs/plugin-react` and `@tailwindcss/vite` itself — the package relies on
the host's own instances of both rather than declaring or bundling them. Saving notes or approvals
never reloads the page; a host may add `@source not "../design";` to its stylesheet to keep
Tailwind from scanning design files at all, as an optional optimisation, never a requirement.

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
npm run build   # tsc -p tsconfig.build.json && chmod +x dist/cli.js — writes dist/: the compiled CLI and plugin only
git add dist
git commit
git tag -f v1
git push --tags
```

The runtime `dependencies` also carry the reviewer's UI libraries (`radix-ui`, `cmdk`,
`lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `react-resizable-panels`,
`tw-animate-css`, `@fontsource-variable/geist`); `tailwindcss ^4` is a peer; the host provides
`@vitejs/plugin-react` and `@tailwindcss/vite`.
