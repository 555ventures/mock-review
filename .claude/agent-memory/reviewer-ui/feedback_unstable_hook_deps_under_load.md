---
name: feedback-unstable-hook-deps-under-load
description: an unstable array/object literal fed into a hook's dependency array is an infinite-render bug that only manifests under CPU load — confirmed root cause of a gate-wide "Maximum update depth exceeded" defect
metadata:
  type: feedback
---

`journey?.edges ?? []` (a fresh `[]` on every render) fed straight into `useJourneyGuide`'s
dependency array, whose effect's first line is `setHints([])`. On a screen with no active journey
this is a true, unconditional, always-present render→effect→setState→render cycle — but it does
**not** reliably show up as a fast, obvious hang. Confirmed by direct reproduction (2026-09-15,
spec 02): at low concurrency (4-6 concurrent pages) it never tripped React's "Maximum update depth
exceeded" guard at all; only at higher concurrency (14 concurrent `serve` + Chromium instances) did
it fire on every page, deterministically. A `console.count()` check on the same component, run in
isolation with no load, showed a small, bounded, settling render count (8, StrictMode-doubled) —
not obviously infinite — which is exactly what makes this class of bug easy to miss in a quick
manual check.

**Why:** the effect only "loops" once per browser paint/microtask cycle (each `setState` schedules
a new render+commit+effect pass, which normally yields to the event loop between iterations); under
light load the browser's natural per-frame throttling masks it as "just a couple of extra renders."
Under heavy CPU contention (many concurrent Vite dev servers + Chromium instances, as the real test
gate runs), React's scheduler can't get regular animation frames, so pending updates queue up and
get flushed back-to-back once CPU is available, tripping the nested-update-count safety net that
normally never gets hit. This reproduced as `tests/server/api.test.ts`'s AC-13, and
`tests/browser/{surfaces,roundtrip}.test.ts`'s AC-15/AC-18/AC-19 — a *different* one timing out each
run — because the browser doing the actual work was pegged at 100% CPU rendering an infinite loop
in a completely unrelated page.

**How to apply:**
1. Any `x ?? []` / `x ?? {}` fallback that is passed into a hook's dependency array (not just used
   for rendering) must be a module-level (or otherwise stable-across-renders) constant instead of
   an inline literal — the inline literal is a *different reference* every render even when the
   value is conceptually "the same empty thing."
2. Any `setState` call at the top of an effect meant to "reset" a value (e.g. `setHints([])`) must
   use the functional-update no-op-check form (`setHints((h) => (h.length ? [] : h))`) so resetting
   an already-empty value doesn't itself trigger a render.
3. Don't trust a quick manual check (single page load, no load) to clear this class of bug — it can
   look completely fine at low concurrency and still be a real, deterministic infinite loop under
   the load the actual CI/gate produces. Reproduce with several concurrent `serve` + browser
   instances (10+) before concluding a render-loop fix actually worked.
4. This generalizes past `edges`: any ResizeObserver/MutationObserver-driven `setState` (this repo
   also had one in `frame/useMeasure.ts` and `frame/DeviceFrames.tsx`'s box-resolution effect) needs
   the same "only setState if the value actually changed" guard, or it becomes the same bug under
   different triggering conditions (see `sameState`/`boxesEqual`-style shallow-compare guards added
   alongside this fix).
