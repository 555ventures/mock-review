# Fable rulings on the reviewer package plan (2026-09-15)

Grounded in `spec/templates/mock/contract.json`, `spec/scripts/lib/mock-cli.js`, `spec/doctrine/mocks.md` §157–235, ADR-0028 and the rebuild-clean memory (all in `~/projects/claude-plugins`).

1. **Repo + install.** Separate repo `555ventures/mock-review`, package name stays `@555/mock-review`, installed via `npm i -D github:555ventures/mock-review#v1` with a **committed `dist/`** (no `prepare` script — it fails silently on hosts without the build toolchain; the bin must work on a fresh host). Do not npm-publish now. The plugin's remedy strings (`mock-cli.js` lines 82, 97, 163) and the SEED text change to the github form, with the `#v1` tag standing in for `@1`. `package` in contract.json is unchanged. `v1` is a moving major tag re-pointed on each release; `contractVersion` is the real skew guard.

2. **Spec split.** A (CLI) first, but move `serve` — the bare Vite dev server with the reviewer plugin mounted and the portfile written — into A; B is the reviewer page + screenshots. Reason: the driver's SEED→SHELL path already requires `serve.url` and starts `serve` as a tracked task; without a live `serve` the driver never goes green end to end, so A's own exit criterion needs it. A stub reviewer route ("reviewer not built") is acceptable in A.

3. **Render findings.** Vite `createServer({ server: { middlewareMode: true } })` + `ssrLoadModule` + `renderToString` per state. Playwright belongs only behind `check --look` and in B's browser tests; never on the `check --json` path.

4. **`serve.url` liveness.** Portfile `design/.serve.json` `{url, pid}` + one HTTP GET to `/__mock-review/ping` with a 500 ms timeout. Skip the pid check; a live ping is the answer; a stale file with no answer means `serve.url: null`. Gitignored.

5. **Edge shape.** Keep the plugin template `Edge {from, to, label?}` and add optional `via?: {component, text}`. `from/to` is what genesis reads; `via` is what makes `resolved` computable (render `from`, find the element). Edges without `via` report as `unresolved`. The plugin template changes only to add the optional field; no contract bump.

6. **Client attribution.** `by: "client"` on the thread entry; no new field, no contract bump. The session writes `"session"`, the page's client role writes `"client"`. Sweep prints the `by` of the first entry.

7. **Screenshots.** Playwright as an **optional peer**: `check --look` and `approval.screenshots` populate only when `playwright` resolves; otherwise `screenshots: []` and a `look`-kind warning. Approval never blocks on it.

8. **Smells and gaps.**
   - Over-engineering: `twin` findings — ship as a stub returning none in A; a real router for four routes is fine but no route loaders; the "atomic file layer" is one `writeJsonAtomic(tmp + rename)` helper.
   - Will fail the run again if missed: (a) `check --json` must print **only** JSON on stdout — Vite logs to stdout by default; set `logLevel: 'silent'` and route everything else to stderr. (b) `contract --json` must not touch Vite or the host at all — first call on every mark, must succeed in an empty dir. (c) `config.client.token` needs a real default at scaffold time. (d) Pin the Node version; react-docgen-typescript needs the host's `tsconfig.json`. (e) A fixture host under the package's tests that mirrors the plugin's `templates/mock/` exactly, plus a CI job that runs the plugin's driver against it — the only test that catches contract drift between the two repos.
