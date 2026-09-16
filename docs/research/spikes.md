# Executed micro-spikes (2026-09-15)

Seven spikes run against the real toolchain before `/spec:plan`. Scratch lives under
`/tmp/claude-1000/-home-jj-projects-claude-plugins/d0937bb2-6eab-435b-a254-7979b0f4123a/scratchpad/spikes/`
and is disposable; everything load-bearing is transcribed here.

## Installed versions (the versions every result below was observed on)

| | version |
|---|---|
| node | v24.19.0 |
| npm | 11.17.0 |
| vite | 8.3.0 |
| react / react-dom | 19.3.0 |
| typescript (package + host scaffold) | 6.0.3 (`~6`; npm `latest` is 7.0.2) |
| zod | 4.6.5 |
| react-docgen-typescript | 2.4.0 |
| vitest | 5.0.1 |
| eslint / typescript-eslint | 10.10.0 / 8.70.0 |

Host under test: `npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s` — note it creates the
app in a **`app/` subdirectory of the cwd**, not in the cwd itself (`components.json`, `vite.config.ts`,
`tsconfig.{json,app.json,node.json}`, `src/` all land in `<cwd>/app/`).

---

## a) Vite 8 programmatic SSR render

Command (run from the host app dir, because `vite` must resolve from the host's `node_modules`):

```
node a-ssr.mjs
```

```js
const server = await createServer({
  root, configFile: root + '/vite.config.ts',
  logLevel: 'silent', appType: 'custom', server: { middlewareMode: true },
})
await server.ssrLoadModule('/src/screens/Home.tsx')          // path 1
await server.environments.ssr.runner.import('/src/screens/Home.tsx')  // path 2
```

Observed stdout (trimmed; stderr empty, exit 0):

```
{ "vite": "8.3.0",
  "hasSsrLoadModule": true,
  "ssrLoadModule": { "ok": true, "meta": { "name": "Home", "states": ["Default","Empty"] },
    "html": "<div data-component=\"Home\"><h1>Home</h1><button data-slot=\"button\" … >Account (<!-- -->3<!-- -->)</button></div>" },
  "hasEnvRunner": true,
  "envRunner": { "ok": true, "meta": {…}, "html": "<div data-component=\"Home\"><h1>Nothing yet</h1>…" } }
```

The screen imported `@/components/ui/button`; the alias resolved through the host `vite.config.ts`, and
`renderToString` produced the real shadcn markup.

**Stdout purity — the hard requirement.** With `logLevel: 'silent'` removed, the same run printed to
**stdout**, ahead of our JSON:

```
9:33:08 AM [vite] (ssr) connected.
```

That single line breaks `JSON.parse(r.stdout)` in `mock-cli.js:146`. `logLevel: 'silent'` is mandatory on
every JSON verb. A throwing state was also exercised: both paths reject with `Error: boom`, catchable
per-state for a `render` finding (its trace goes to stderr, which is fine).

**Conclusion:** `ssrLoadModule` is **not** deprecated in 8.3.0 (no `@deprecated` tag in `index.d.ts:2562`);
it is a compat shim over `SSRCompatModuleRunner`. Both paths work — use
`server.environments.ssr.runner.import()` (the Environment API, forward-looking), with
`logLevel: 'silent'` and `appType: 'custom'`.

## b) react-docgen-typescript against the host tsconfig

```
node b-docgen.mjs   # withCustomConfig('<host>/tsconfig.app.json', { savePropValueAsString: true,
                    #   shouldExtractLiteralValuesFromEnum: true, propFilter: drop node_modules parents })
```

```
{ "version": "2.4.0", "msConfig": 11, "msParse": 678,
  "docs": [
    { "displayName": "Home", "description": "The console home screen.",
      "props": { "title": { "type": "string", "required": true, "defaultValue": null },
                 "count": { "type": "number | undefined", "required": false, "defaultValue": "0" } } },
    { "displayName": "Button", "description": "",
      "props": { "variant": { "type": "\"default\" | \"outline\" | … | undefined", "defaultValue": "default" },
                 "size":    { "type": "\"default\" | \"xs\" | … | undefined", "defaultValue": "default" },
                 "asChild": { "type": "boolean | undefined", "defaultValue": "false" } } } ] }
```

**Conclusion:** the `/** … */` line lands in `description` and typed props in `props` exactly as the sweep
inventory needs; ~680 ms for two files including program creation, so the sweep must build **one** parser
and parse all files in a single `parse([...])` call. `withCustomConfig` wants `tsconfig.app.json`, not the
solution-style `tsconfig.json` (which has `"files": []`).

## c) TypeScript compiler API diagnostics from the host

```
node c-tsc.mjs   # ts.readConfigFile + ts.parseJsonConfigFileContent(raw.config, ts.sys, HOST, undefined, cfgPath)
                 # ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
                 # ts.getPreEmitDiagnostics(program).filter(d => d.file?.fileName.startsWith(HOST + '/src/'))
```

Clean host: `{ "ts": "6.0.3", "rootNames": 7, "msParseConfig": 11, "msCreateProgram": 438, "msDiagnostics": 413, "configErrors": [], "diagnostics": [] }`

After adding `src/screens/Bad.tsx` with `const n: number = 'not a number'`:

```
{ "rootNames": 8, "msCreateProgram": 444, "msDiagnostics": 442, "diagnostics": [
  { "file": "src/screens/Bad.tsx", "line": 2, "col": 7, "code": 2322,
    "message": "Type 'string' is not assignable to type 'number'." } ] }
```

**Conclusion:** `tsconfig.app.json` is the entry (the root `tsconfig.json` is a references stub with
`"files": []`); `parseJsonConfigFileContent` resolves `include: ["src"]` and the `@/*` paths without a
`baseUrl`; scoping to `src/` is a filename-prefix filter on the pre-emit diagnostics. Budget ~0.9 s per
`check` for the `type` pass on a small host — build the program once and share it with the layer walk.

## d) zod 4.6.5 — `.strict()` and a discriminated union

```
node d-zod.mjs
```

```
{ "zod": "4.6.5", "success": false,
  "issues": [ { "path": "findings.0.severity", "code": "invalid_value",  "message": "Invalid option: expected one of \"error\"|\"warn\"" },
              { "path": "findings.1.kind",     "code": "invalid_union",  "message": "Invalid discriminator value. Expected 'type' | 'twin'" },
              { "path": "",                    "code": "unrecognized_keys", "message": "Unrecognized key: \"extra\"" } ],
  "pretty": [ "✖ Unrecognized key: \"extra\"",
              "✖ Invalid option: expected one of \"error\"|\"warn\"", "  → at findings[0].severity",
              "✖ Invalid discriminator value. Expected 'type' | 'twin'", "  → at findings[1].kind" ] }
```

**Conclusion:** v4 majors confirmed; `z.discriminatedUnion('kind', [...])` + `.strict()` behave as the
schemas need, `error.issues[].path` is an array to `join('.')`, and `z.prettifyError(err)` is the v4
one-call human formatter for stderr.

## e) Install form — committed `dist/` + moving `v1` tag

```
# package repo: git init; git add -A; git commit; git tag -f v1
cd <fixture host> && npm i -D "git+file:///…/pkgrepo#v1"
ls -l node_modules/.bin/mock-review
#   mock-review -> ../@555/mock-review/dist/cli.js   (head -1: #!/usr/bin/env node)
```

Invoked exactly the way `spec/scripts/lib/mock-cli.js:64-78` does (`spawnSync('mock-review', …, { shell: false,
env: { …process.env, PATH: appDir/node_modules/.bin + ':' + PATH } })`):

```
{"status":0,"stdout":"{\"contractVersion\":1,\"package\":\"@555/mock-review\",\"version\":\"1.0.0\"}\n","stderr":""}
{"status":2,"stdout":"","stderr":"mock-review: check not implemented\n"}
```

npm auto-installed the peers into the host: `react@19.3.0`, `react-dom@19.3.0`, `vite@8.3.0`,
`zod@4.6.5`, `typescript@6.0.3`, `react-docgen-typescript@2.4.0`. `playwright` was **not** installed —
`peerDependenciesMeta.playwright.optional` works as the optional-peer ruling requires.

**Conclusion:** committed-`dist` + `#v1` tag install works end to end, no `prepare` script, bin symlink
and shebang intact. Two caveats below (§Surprises 1 and 2).

## f) `serve` liveness — port 0, portfile, ping from another process

Server process (`logLevel: 'silent'`, `server: { port: 0 }`, a plugin mounting `/__mock-review/ping`):

```
await server.listen()
const url = server.resolvedUrls.local[0].replace(/\/$/, '')   // trailing slash MUST be stripped
fs.writeFileSync('design/.serve.json', JSON.stringify({ url, pid: process.pid }))
process.stdout.write(url + '\n')
```

stdout of the serve process: `http://localhost:43941`

Separate node process reading the portfile and pinging with a 500 ms `AbortController`:

```
{ "portfile": { "url": "http://localhost:43941", "pid": 3491490 },
  "ping":     { "status": 200, "body": "{\"ok\":true,\"pid\":3491490}" },
  "deadPing": { "error": "TypeError" } }
```

**Conclusion:** the ruled mechanism works. `resolvedUrls.local[0]` carries a trailing slash — strip it, the
driver concatenates `url + '/?client=' + token`. A dead port fails fast as a fetch `TypeError`
(ECONNREFUSED), not an `AbortError`, so `serve.url: null` must key off *any* thrown error, not only abort.

## g) Screen hash oracle

```
node g/hash.mjs   # createHash('sha256').update(readFileSync(screen)).digest('hex')
before 40b6745b60e88a56
after  9a5d1b485851dd5c    # after changing "Default" to "default" — one character
```

**Conclusion:** a plain sha256 of the screen file's bytes is a sufficient drift oracle for
`check.screens[].hash` / `approval.screens[<n>].hash`.

---

## Surprises the specs must carry

1. **`typescript` is a runtime dependency, not a devDependency.** `react-docgen-typescript` declares
   `peerDependencies: { typescript: ">= 4.3.x" }` and has no dependencies of its own; the `check` `type`
   pass needs `ts.createProgram` too. With `typescript` left in devDependencies, npm resolved the open peer
   range and installed **typescript@7.0.2** (the native port, plus `@typescript/typescript-linux-x64`) into
   the host — against the shadcn scaffold's own `~6`. Pinning `typescript: "~6.0.0"` in `dependencies`
   produced 6.0.3 in the host on the re-run. Same reasoning applies to `zod` and
   `react-docgen-typescript`: they are `dependencies`, not devDependencies, or the committed-`dist` bin
   has no runtime on a fresh host.
2. **`#!/usr/bin/env node` cannot survive a genuinely bare PATH on this machine.** With
   `PATH=<app>/node_modules/.bin:/bin:/usr/bin` (the A2 fallback `mock-cli.js:64-68` uses when the
   inherited PATH is empty) the spawn returned `status: 127`,
   `stderr: "env: 'node': No such file or directory"` — node is not in `/bin` or `/usr/bin` here. It only
   bites a caller that deliberately empties PATH, never a real session, but any plugin-side test that
   simulates an empty PATH will fail against the real binary where it passed against a bash stub.
3. **Default Vite logging writes to stdout.** `[vite] (ssr) connected.` on stdout, not stderr (spike a).
   `logLevel: 'silent'` on every JSON verb is a correctness requirement, not hygiene.
4. **The shadcn scaffold nests.** `… -n app` creates `<cwd>/app/`, so the plugin's `appDir =
   <root>/<status.app>` lines up only if the scaffold is run from the repo root.
5. **The scaffolded `vite.config.ts` uses `__dirname`** and Vite 8 warns (on stderr) that
   `configLoader: 'native'` will not support it. Harmless today; the package must not assume the host
   config loads under the native loader.
6. **`resolvedUrls.local[0]` has a trailing slash** — the contract forbids one on `serve.url`.

---

# Spec 03 spikes (2026-09-15) — collapsing the reviewer onto the host's Vite server

Six spikes from `docs/research/spec-03-collapse-brief.md` §3, run against a working prototype of the
collapse in an isolated worktree, each in **both** package layouts: `linked` (the package outside the
host root, its `.test-dist/cli.js` started from the host) and `installed` (`dist/`, `src/ui/` and
`package.json` materialised under `<host>/node_modules/@555/mock-review/`). Scratch (disposable):
`/tmp/claude-1000/-home-jj-projects-mock-review/477e2897-1422-4206-a64d-f06b63f225aa/scratchpad/spike03/`
(`report-A.md`, `out-spike*.txt`, `spike*.mjs`, `mk-host*.mjs`). Versions: vite 8.3.0,
@vitejs/plugin-react 6.1.1, tailwindcss + @tailwindcss/vite 4.3.3, react 19.3.0, playwright 1.63.

| # | Claim | Result |
|---|---|---|
| 1 | JSX through the host server: a `\0mock-review:entry` virtual id that only `import`s `<pkg>/src/ui/main.tsx` | PASS both layouts. `GET /@id/__x00__mock-review:entry` → 200; served `reviewer.tsx`/`frame/mount.tsx` contain `jsxDEV(` and no raw JSX **even from under `node_modules`** (plugin-react's `node_modules` exclusion governs Fast Refresh wrapping only); sidebar 255 px; iframe renders `ConsoleShell`; no preamble error; frame document has no stylesheet defining `--sidebar`. |
| 2 | CSS leak: `apply: 'serve'` + `@import "tailwindcss" source(none); @source "./"` | PASS. Host build with `[react(), tailwindcss(), mockReview()]`: `dist/index.html` + one JS asset, zero `data-sidebar`/`Geist`/`mock-review` hits after path stripping. Served reviewer CSS 116,931 bytes with `--sidebar-width`. 2b: host-only utilities injected into a screen never reach the reviewer CSS. Double mount (host config + `serve`) benign. **Host must be `"type": "module"`** or Vite bundles its config as CJS and fails to load the ESM-only `@555/mock-review/vite`. |
| 3 | Optimizer, 20 cold starts per cell (`rm -rf node_modules/.vite`) | linked/include 0 504s, 0 reloads, median 2.28 s; installed/include 0/0, 2.28 s. linked/no-include: 15/20 with `504 Outdated Optimize Dep` on `react-resizable-panels`, 20/20 one full reload. installed/no-include: 0/20 rendered (`react-dom/client … does not provide an export named 'createRoot'`, raw CJS; 4 optimized entries instead of 12). `optimizeDeps.include` is load-bearing and exactly sufficient. |
| 4 | HMR: edit a host screen with a pin visible | Pre-image linked: 114 ms, 0 reviewer reloads. Prototype (plain HMR): edited text in 1.2–1.7 s but **the reviewer document full-reloads on every edit** (plugin-react invalidates every screen — `examples` is not a component export — and Vite broadcasts `full-reload` to every client). 4b with a `hotUpdate` hook returning `[]` for host `src/**` in the client environment plus a `mock-review:frame-reload` custom event the frame alone listens to: 149/135 ms (linked), 124/121 ms (installed), 0 reviewer reloads, 1 frame reload, 1 `files` event and a changed hash per edit, pin kept, iframe `src` unchanged. `mock.config.ts` edits get no HMR payload at all (SSR graph only); the `files` SSE is their only signal. Pre-image **installed** layout never renders the frame at all (same CJS `createRoot` failure). |
| 5 | Remote client (every request `X-Forwarded-For`) | PASS both layouts: `GET /` → 403 text; `?client=replace-me` → 200 + `Set-Cookie`; cookie alone → `/`, `/?frame=1`, the entry, its import, `state` (`role: client`), `events` all 200; no/stale cookie → 403; Playwright with the header renders the reviewer, the mock and `Confirm journey`; `?client=wrong` clears the cookie (the carrying request itself still answers 200; the 403 starts on the next). |
| 6 | One React (installed, `resolve.dedupe` on/off) | PASS both ways: one `react-dom_client.js` URL, no Invalid hook call, 0 504s. Dedupe is inert insurance (single realpath); toggling it only changes the optimizer hash. |

Known cosmetic residue: `/src/index.css` 404s on a host without one (the fixture) with a MIME
console line; in the test's symlinked `installed` layout one 403 on the Geist webfont whose realpath
escapes `fs.allow` through the per-entry symlink (a real install keeps it inside the host root).

---

# Executed micro-spikes (2026-09-16) — reviewer reload on design writes

Run for `specs/20260916/01-no-reviewer-reload-on-design-writes.md` against vite 8.3.0,
`@tailwindcss/vite` 4.3.3, `@vitejs/plugin-react` 6.1.1, on a scratch copy of `tests/fixtures/host`
with `design/approval.json` seeded `"theme": "nova"` (without a theme the frame never links the host
stylesheet, Tailwind never scans, and the reload does not exist). Harness: programmatic
`createServer` as `serve.ts` builds it, a raw `WebSocket(url, 'vite-hmr')` recording every frame,
Playwright counting top-level and child-frame navigations plus a `window` marker, an SSE reader.

| run | hook | `design/notes.json` atomic write | `design/shell/app.html` edit | `src/screens/home.tsx` edit |
|---|---|---|---|---|
| baseline | none | 1 path-less `full-reload`, top nav 1, marker gone | 2 frames (path-less + `/design/shell/app.html`), top nav 1 | `full-reload` path `*`, top nav 1, text after 1065 ms |
| patched, plugin last | `{order:'pre'}` | 0 frames, top nav 0, marker kept, `notes` SSE 1 | 1 frame `path: '/design/shell/app.html'`, top nav 0, frame nav 0 | 1 `custom mock-review:frame-reload`, 0 `full-reload`, frame nav 1, text after 198 ms |
| patched, plugin first | same | identical | identical | identical (184 ms) |
| plain function, no `order` | same handler | baseline rows | baseline rows | as patched |

`mocks/status.json` behaves like `notes.json`; `mocks/ledger.md` create/delete sent nothing in any
run. SSR graph: `getModulesByFile` is `undefined` for both the stylesheet and `notes.json` before
and after an SSR import of a screen; `notes.json` is an `asset` module in the client graph only.
