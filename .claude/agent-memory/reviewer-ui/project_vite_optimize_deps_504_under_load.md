---
name: project-vite-optimize-deps-504-under-load
description: AC-15's theme-stylesheet flake root cause — a Vite dev-server "504 Outdated Optimize Dep" aborts the frame's entire script under heavy concurrent load, not a src/ui/** or entry.tsx logic bug
metadata:
  type: project
---

Diagnosed 2026-09-15 per the coordinator's (a)/(b)/(c) questions on AC-20260915-02-15's flake
(`tests/browser/surfaces.test.ts` — theme picked, `approval.theme` reaches `nova` on the server,
but the iframe's document never gets a `themes/nova.css` `<link>` within the poll window).

**Reproduction**: a throwaway script (run from the scratch dir, several `serve` instances +
idle pages held open to reproduce CPU contention, then the actual subject page picks `nova`),
logging every `framenavigated`, the iframe's `src` before/after, every `/__mock-review/state`
response by frame, and frame console errors/`requestfailed` events.

**Answers**:
- **(a) Does the iframe reload with `_theme=nova`?** Yes, every single time, confirmed across
  many repro runs — `src` changes to `/?frame=1&_theme=nova#/home?state=default` and a real
  `framenavigated` event fires for the child frame.
- **(b) Does the frame's own state fetch race the write and see `theme: null`?** No — in every
  run where the reload actually executed, the child frame's own `GET /__mock-review/state` request
  correctly returned `theme: "nova"`. The write is durable well before the reload's own fetch runs
  (the theme pick sequence is `POST approval` (writes synchronously) → `await` → `fetchState()`
  (confirms it) → only then does React change `theme` and thus `src`) — no exploitable race in the
  normal path.
- **(c) Does something (e.g. `replaceFrameHash`) navigate the frame back to a URL without
  `_theme`?** No — only one `framenavigated` per reload was ever observed, `iframe.src` stayed at
  the `_theme=nova` URL for the entire poll window in every run, success or failure.
  `replaceFrameHash`'s effect depends on `[screen, state, frameLoad]` (not `theme`), and once the
  reload lands its `location.hash` already matches `want`, so the early-return (`hash === want`)
  fires and it never re-navigates.

**Actual root cause found (matches neither a/b/c)**: in the one fully-reproduced failure, Vite's
dev server answered a core dependency request
(`/node_modules/.vite/deps/react_jsx-dev-runtime.js?...`) with **504 "Outdated Optimize Dep"**,
which the browser turned into `net::ERR_ABORTED`. Since that module is required to execute *any*
JSX in the frame (including the frame entry itself), the frame's whole script never finishes
running — not even the unconditional first line (`ensureStylesheet('/src/index.css')`) executes,
confirmed by `stylesheets: []` staying empty for the entire 20s window with zero DOM mutation. This
happened identically on the very first (non-theme) frame load in that same run, before any theme
was ever picked — proving it is not specific to the theme-reload mechanism (D18e) at all; it is a
general "any frame (re)load can be dropped by Vite's optimizer under extreme concurrent CPU load"
risk that would affect a plain state switch or screen navigation exactly the same way.

**Why no `src/ui/**` fix was applied**: neither of the coordinator's two fix directions (frame
entry reading `_theme` as a fallback for (b); or a `src/ui/**` navigation-race fix for (c)) applies
— the actual failure is Vite's own optimizer/dep-cache layer aborting a request under CPU
starvation, external to both the reviewer page's code and the frame entry's logic. This machine
was independently under heavy load during diagnosis (`uptime` load average ~10, verified via
`ps`/`free` — other concurrent work, not just this repro's own synthetic load), which reproduces
the identical failure signature (frame content missing across various ACs — AC-13, AC-15, AC-19)
without any theme interaction at all, consistent with a general resource-contention flake rather
than an application defect.

**If asked to harden this further**: the only defensible `src/ui/**`-side mitigation would be a
stuck-frame-load detector in `DeviceFrames.tsx` (e.g., if `onLoad` doesn't fire within N seconds of
setting `src`, force a fresh navigation by re-setting `src` with a cache-busting query param) — not
implemented here since it wasn't asked for and adds real complexity/risk to a shared component for
a problem that is fundamentally about the test environment's CPU headroom, not the shipped code.
