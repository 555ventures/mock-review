# Deviations — 01-schemas-cli-and-bare-serve

- AC-20260915-01-24 was resolved by spec ruling D16: it moved to spec 02, and
  `tests/e2e/driver.test.ts` no longer carries a case for it (its hand-written
  `approval.json`/`mock.config.ts` theme writes and `client open` assertions are removed;
  spec 02's served page is the real writer of `approval.json`).
- `tests/fixtures/host/src/components/WalletSummary.tsx` is not named in the spec's D13 file list
  (D13 only names `ConsoleShell.tsx`, `home.tsx`, `account.tsx`, the shadcn `ui/` copies); it is
  added because AC-20260915-01-18 requires a `WalletSummary` component with exactly the doc line
  and props the sweep inventory test asserts. Dispatcher instructions confirmed this explicitly.
- `tests/setup.ts` is not wired into `vitest.config.ts` `setupFiles` (that file is outside this
  worker's tests/** batch); instead every CLI/e2e/schema test file imports `ensureFixtures()` from
  `tests/setup.ts` directly and calls it in its own `beforeAll`. The function is idempotent
  (checks `existsSync` before building/linking), so calling it from many files is safe and no
  vitest.config.ts change was needed.
- CLI tests (check/serve/answer/sweep/schemas/contract) run against a fresh `copyFixtureHost()`
  scratch copy of `tests/fixtures/host` / `host-broken` for every test, rather than mutating the
  checked-in fixtures in place, to keep the fixtures byte-stable across runs and safe under
  parallel test execution. `tests/e2e/driver.test.ts`'s AC-20260915-01-22 case is the one
  exception: it runs `check --json` directly against `tests/fixtures/host` (relying on
  `tests/setup.ts`'s in-place `node_modules` symlink), because that AC is specifically about that
  fixture's own `node_modules` resolving.
- `tsconfig.json` (repo root, not in this worker's File Plan) gained one `exclude` entry —
  `["tests/fixtures/host/**", "tests/fixtures/host-broken/**"]` — because the root project
  tsconfig's `include: ["tests", ...]` was otherwise compiling the fixture hosts' `.tsx` files
  under the *package's* module resolution (no `@/` alias registered there), producing spurious
  `TS2307` errors on every `@/...` import inside the fixtures. The fixtures are type-checked by
  the package's own `ts.createProgram` over each host's *own* `tsconfig.app.json` (D5/D13), never
  by the repo's root `tsconfig.json`; without the exclude, `npm run typecheck` cannot pass once
  these fixtures exist, regardless of `src/` implementation. Minimal, additive, no other worker's
  file touched.
- `.gitignore` was left untouched (outside this worker's batch — the `package.json`/`.gitignore`
  "other" layer belongs to a different worker). `tests/setup.ts` symlinks
  `tests/fixtures/host/node_modules` and `tests/fixtures/host-broken/node_modules` in place per
  D13; until `.gitignore` gains those two entries (D13's own File Plan row already calls for this),
  `git status` will show them as untracked after the first test run.
- `tests/package/install.test.ts` (AC-20260915-01-21) currently passes against the repo's
  as-committed `package.json` — the substrate commit already carries `zod`,
  `react-docgen-typescript`, `typescript ~6.0.0` under `dependencies` and the peer/bin/files shape
  D12 asks for, ahead of this spec's own build waves. Not a stale-assumption fork (nothing in the
  AC contradicts the file), so the test is written verbatim per the AC rather than blocked; flagged
  here only because it is not "red" the way the schema/CLI/e2e tests are.
- `src/schemas/check.ts` `FindingSchema` is a `z.discriminatedUnion` on `severity` (two branches,
  each with a `kind` enum), not on `kind` as the File Plan row reads. The accepted shape is
  identical to the Contracts `Finding` union (error kinds pair with `severity: 'error'`, warn kinds
  with `'warn'`); only the discriminator key differs. Accepted by the orchestrator, not re-dispatched.
- The root `tsconfig.json` `exclude` (D16) was reverted before red-check, which requires every
  non-tests File Plan path to match `diff_base`; it is re-applied in a later wave. Until then
  `npx tsc --noEmit` reports fixture-host errors that are not `src/` defects.
- `src/server/serve.ts` (D8): the literal decision text shows `config.port` already available at
  `createServer({ server: { port: config.port, ... } })` construction time, but the port value can
  only be known by loading `mock.config.ts` through a server that already exists. Implemented as:
  create the server with `server: { strictPort: false, host: '127.0.0.1' }` (no `port` yet), read
  `mock.config.ts`'s default export via `server.ssrLoadModule('/mock.config.ts')` (the compat path
  from D4/spike a, not the Environment-API runner — avoids `DevEnvironment` vs
  `RunnableDevEnvironment` typing friction that also blocks `src/analysis/vite-runner.ts` as of
  this writing), validate it with the shared `ConfigSchema`, then call `server.listen(config.port)`
  explicitly (falling back to `server.listen()` — Vite's own default — when the config can't be
  read or fails validation). `strictPort: false` still applies at listen time, so behavior matches
  D8's intent; only the mechanics of *when* the port number is known differ. Verified against the
  green fixture: `serve` bound to the configured port 5180 and the URL/portfile/ping/stub-page/
  SIGTERM behavior all matched AC-20260915-01-13.
- `src/server/serve.ts`'s `createServer(...)` call adds `appType: 'custom'` — not listed in D8's
  literal object — because the fixture hosts have no `index.html` and Vite's default `appType:
  'spa'` middleware would otherwise try (and fail) to serve one for `GET /` before the
  `mock-review` plugin's stub-page middleware could act. D4 already establishes `appType: 'custom'`
  as this package's convention for a host with no `index.html`; carried over here for the same
  reason, non-blocking.
- Repair (AC-20260915-01-13, `src/server/serve.ts`): `serve` exited 143 on `SIGTERM` instead of 0.
  Traced (per the coordinator's `--trace-exit` finding) to Vite's own `createServer()` installing
  `process.once('SIGINT'/'SIGTERM', ...)` handlers that call `process.exit(<128+signal>)` directly;
  Node fires same-event listeners in registration order, so Vite's handler — registered during
  `createServer()`, before this module's own handlers exist — always ran first and exited the
  process ahead of the portfile-removal/`server.close()` cleanup. Fixed by calling
  `process.removeAllListeners('SIGINT')` / `process.removeAllListeners('SIGTERM')` immediately
  after `createServer()` returns (and before this module registers its own), so `startServe`'s
  `shutdown()` is the sole handler for both signals for the life of the process. This is safe
  because `serve` is a dedicated CLI process (`dist/cli.js serve`) — nothing else in that process
  legitimately owns those signals. Verified: `npm run build && npx vitest run
  tests/cli/serve.test.ts` — all three tests pass, including the `SIGTERM` → exit 0 → portfile
  removed assertion.
- `src/analysis/vite-runner.ts:26` (not in this worker's batch) currently fails `npx tsc --noEmit`
  with `Property 'runner' does not exist on type 'DevEnvironment'` — `server.environments.ssr` is
  typed as the base `DevEnvironment` in vite 8.3.0's `.d.ts`, not `RunnableDevEnvironment` (which
  carries `.runner`), without an explicit `isRunnableDevEnvironment` narrow or a
  `RunnableDevEnvironmentContext`. `src/server/serve.ts` sidesteps this by using
  `server.ssrLoadModule` instead (see above). Flagging for whichever worker owns
  `src/analysis/vite-runner.ts` — this is a stale-assumption-shaped issue in D4's own text (`server.
  environments.ssr.runner.import(<abs path>)`), not something this worker's batch can fix.
- RESOLVED (analysis worker, same wave): `src/analysis/vite-runner.ts` narrows
  `server.environments.ssr` with vite's own exported `isRunnableDevEnvironment(environment):
  environment is RunnableDevEnvironment` type guard before touching `.runner` (throwing a plain
  `Error` — surfaced upstream as `check`'s `vite.config.ts` config finding — when the guard fails).
  `npx tsc --noEmit` is clean under `src/` with this narrowing; D4's literal
  `server.environments.ssr.runner.import(<abs path>)` is implemented as specified, no fallback to
  `ssrLoadModule` was needed on the analysis side. `src/server/serve.ts`'s own use of
  `ssrLoadModule` (its config-loading path) can stay as committed — both approaches are valid per
  spike a — but the underlying typing blocker this note originally flagged no longer exists on
  vite-runner.ts, in case that shapes a later `serve.ts` revision.
- Superseded by D17 (D5 message form applied).
- `src/analysis/screens.ts`: for the module-import-failure path (the whole screen file throws on
  `runner.import`, not a single `examples` entry), there is no example key to prefix per D5's
  `<state>: <error.message>` template. Implemented as `"module failed to load: <error.message>"`
  per D17 (user ruling after a Fable second opinion — a label with no colon an `examples` key
  could collide with). Not covered by any AC in this spec; flagging the literal chosen in case a
  later AC pins a different one.
- BLOCKED-SHAPE (cli worker, foreign file, not edited): `tests/cli/serve.test.ts`'s
  AC-20260915-01-13 case (`SIGTERM` → exit 0, portfile removed) fails reproducibly with exit code
  143, not 0. Root cause traced with `node --trace-exit`: Vite's own dev server installs a
  `process.once('SIGTERM', closeServerAndExit)` handler inside `createServer()` (in
  `node_modules/vite/dist/node/chunks/node.js`) that calls `process.exit(128 + signal)` = 143.
  `src/server/serve.ts`'s own `process.once('SIGTERM', () => shutdown(0))` is registered *after*
  `createServer()` returns, so Vite's handler runs first on the same event and exits the process
  before `src/server/serve.ts`'s handler's `process.exit(0)` ever runs. This is in
  `src/server/serve.ts` (server layer, outside this worker's assigned files) — likely fix is
  `process.removeAllListeners('SIGTERM')`/`'SIGINT'` right after `createServer()` resolves, before
  registering the package's own handler, or passing a Vite option that suppresses its
  auto-exit-on-signal behavior. Not edited per the worker contract (foreign file); reporting for
  the server-layer worker/orchestrator.
- BLOCKED-SHAPE (cli worker, foreign file, not edited): `tests/cli/serve.test.ts`'s
  AC-20260915-01-14 "reports null within 1s when the portfile names a dead port" case is flaky in
  this sandbox — observed once at 2353ms against the test's 2000ms budget, passing on a repeat run.
  `src/analysis/liveness.ts`'s 500ms fetch-timeout budget (D8/A8) is correct per spec; the overrun
  comes from the full `check --json` pipeline's own startup cost (TS program creation + Vite
  runner start, ~1s per the spec's own "Fragile" note) stacking with the 500ms liveness probe under
  this environment's process-spawn latency. Not a defect in any file this worker owns; flagging in
  case the test's margin or the pipeline's parallelism needs revisiting by whoever owns
  `src/analysis/liveness.ts` / `src/analysis/check.ts`.
- BLOCKED-SHAPE (cli worker, foreign file, not edited): `npm run lint` fails on
  `src/analysis/shells.ts:14` (`no-useless-assignment` — the `mod` reassignment inside the `catch`
  block is flagged as unused). Outside this worker's assigned files (analysis layer); not edited.
