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
