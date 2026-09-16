---
name: feedback-usesyncexternalstore-selectors
description: useStore selectors in this codebase's store/store.ts must return stable references, never derive/map inline, or React infinite-loops
metadata:
  type: feedback
---

`useStore(selector)` (src/ui/store/store.ts) wraps `useSyncExternalStore`. Any selector whose body
creates a new array/object every call (e.g. `useStore((s) => s.data?.screens.map((sc) => sc.name) ?? [])`)
makes React believe the snapshot changed on every render, which forces an immediate re-render,
which calls the selector again, which returns another new reference — an infinite loop that
crashes as a *minified* React error #185 ("Maximum update depth exceeded") with no useful stack in
a production build. It reproduces reliably but silently in headless Playwright runs (the whole
`page.goto(..., {waitUntil:'networkidle'})` or a later `expect.poll` just hangs to timeout, no
obvious error unless you capture `pageerror` / build unminified with `define:
{'process.env.NODE_ENV': JSON.stringify('development')}`).

**Why:** discovered while building the spec 02 reviewer page — `Router.tsx`'s
`useStore((s) => s.data?.screens.map(...))` caused every browser test that loaded `#/home` to
hang/crash. Fixed by selecting the raw `data.screens` reference and computing the derived array in
a separate `useMemo` keyed on that reference.

**How to apply:** in any `src/ui/**` component, a `useStore(selector)` call must return either a
primitive, or a property read that is itself stable across unrelated re-renders (`s.data`, `s.ui`,
`s.ui.paletteOpen`). Never `.map()`/`.filter()`/object-literal inside the selector body — memoise
that downstream with `useMemo` in the component instead.
