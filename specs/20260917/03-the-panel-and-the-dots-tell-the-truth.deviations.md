# Deviations — 03-the-panel-and-the-dots-tell-the-truth

- AC-20260917-03-21's test was never observed red. The AC was created mid-build by the user
  ruling recorded as D11, after the driver's red-check had already passed for the original
  tests batch. Its implementation (D11 in `src/ui/notes/notes-ui.tsx`) and its test were
  authored concurrently by two workers in the same worktree, and the implementation landed
  first, so the test was green on its first execution. The behaviour it pins was demonstrably
  broken before D11: the pre-existing `tests/browser/roundtrip.test.ts :: AC-20260915-03-5`
  failed with "expected 0 to be greater than 0" on the `Approve screen` button never
  appearing, executed by the orchestrator before the ruling was taken to the user.
