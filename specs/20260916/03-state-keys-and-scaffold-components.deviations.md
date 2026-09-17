# Deviations — 03-state-keys-and-scaffold-components

- tests/server/api.test.ts: the File Plan's api.test.ts row (AC-20260916-03-10, AC-20260916-03-11)
  didn't list the pre-existing AC-20260915-03-3/-04-10 browser test's `src/ui/` URL allowlist, but
  D10 (mount.tsx's `pickExample` now imports `./stateKey.js`) forces that test's frame module graph
  to legitimately load one extra `src/ui/frame/stateKey.ts` URL. Added `'src/ui/frame/stateKey.ts'`
  to the test's `allowed` list and a matching `toHaveLength(1)` expectation, and extended its
  comment to name D10 — confirmed by running the test un-skipped (real browser) before the fix,
  which showed the sole extra URL was exactly `src/ui/frame/stateKey.ts`.
