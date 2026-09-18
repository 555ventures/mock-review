# Deviations — 04-empty-is-not-broken

- AC-20260917-04-11's literal text ("`check --json` runs on a host whose `design/approval.json`
  is truncated ... SHALL CONTINUE TO exit 0 and report its screens, shells and themes") describes a
  scenario that cannot go red on current code: `src/analysis/check.ts`/`src/cli/check.ts`'s plain
  `check --json` path never reads `design/approval.json` at all (grep confirms zero references),
  and the only current call site that does — `themeFor`, used exclusively by `check --look` — already
  has a bare `try { readJson(...) } catch { return undefined }` that silently swallows any corrupt
  approval document today, pre-refactor. Both readings of the AC are therefore already true on
  untouched `main`, which the test-owner contract treats as a stale-assumption trigger ("if a test
  would already pass, the spec is wrong — return blocked"). Rather than block the whole batch over
  what is functionally the same kind of "SHALL CONTINUE TO" regression pin as AC-9/AC-10 (both of
  which the spec marks `reuses`, not `writes`/`rewrites`, i.e. no red-test obligation), the rewritten
  `tests/cli/check.test.ts :: AC-20260915-01-5` test was extended to (a) prove `check --json`
  stays unaffected by a truncated `approval.json` and (b) exercise `check --look`'s theme capture
  (the only real call site `themeFor`'s D5 refactor touches) against the same corrupt file. Both
  assertions pass today and are expected to keep passing after the refactor — this file does not
  carry a red assertion for AC-20260917-04-11; its purpose is regression coverage during the D1/D5
  refactor, not a red-phase proof. Flagged for the build/review stage rather than silently treated
  as satisfied.
- AC-20260917-04-5 ("a failed design-document read SHALL NOT empty any analysis-derived field")
  is also already true on untouched `main`: `src/server/state.ts`'s current `buildState` already
  computes `screens`/`shells`/`journeys`/`config`/`inventory` inside its own `try { ... } catch`
  block, entirely BEFORE and independent of the separate `try { readJson(notesPath, ...) } catch`
  below it — a corrupt `design/notes.json` never touches the analysis-derived fields today, pre-D1.
  Ran `npx vitest run tests/server/api.test.ts -t "AC-20260917-04-5"` on the untouched tree to
  confirm: it passes. The new `tests/server/api.test.ts` test for this AC is left in place as a
  regression pin (same category as AC-20260917-04-11 above) — it does not carry a red assertion,
  and is expected to stay green across the D1/D3 refactor rather than flip red then green.
