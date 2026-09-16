---
date: 2026-09-16
status: implementing
build_base: main
tier: standard
area: reviewer-page
design: false
breaking: false
depends_on: [specs/20260915/03-collapse-the-reviewer-onto-the-host-server.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-16
open_markers: 0
diff_base: 659ca1e8d792d781530d0b92f0939f9f96c3ef7e
---

# Journey guide honours the frame boundary

## Goal

The journey guide's violet "click here next" ring is visible again, and the guide recognises the
step it is on no matter how the frame's hash is encoded. Both defects come from the reviewer
reaching *into* the mock's document: the guide writes an attribute onto a control inside the iframe
whose only stylesheet is the host's own (spec 03 D2/D3), so the ring rule in the reviewer's CSS never
applies; and it compares a hand-built, unencoded hash string against the browser's percent-encoded
one, so any state with a space, `&`, `/` or `+` never matches. This spec draws the ring in the
reviewer document over the frame (the way note pins already are), makes the reviewer strictly
read-only toward the frame DOM, and gives every builder and parser of the frame's hash one shared,
tested module. Done means the ring shows on the fixture journey in both viewports, tracks the control
through frame scroll and reviewer resize, disappears with the guide toggle, matches an encoded state,
and the package build emits exactly one new module under `dist/ui`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The reviewer never writes to the frame DOM.** No attribute, class, inline style, node or stylesheet is ever set on, added to or removed from the iframe's document by reviewer code; no host control's style is mutated. The reviewer may *read and measure* (`querySelector`, `getBoundingClientRect`, `checkVisibility`, `getComputedStyle`), *listen* (capture-phase click, scroll, `ResizeObserver`/`MutationObserver` constructed from the frame's realm, keydown) and *navigate* (hash replace per rule 16, `win.scrollTo` per rule 25). `useJourneyGuide` loses `setAttribute('data-journey-target')`/`removeAttribute` and the `marked` bookkeeping; the `[data-journey-target]` selector disappears from the package. (AC-20260915-04-4) | The frame's document only ever loads the host's `/src/index.css` plus the picked theme (spec 03 D2/D3, AC-20260915-03-3); anything the reviewer writes into it is styled by nothing and is a leak into the artefact under review. |
| D2 | **One frame-route module: `src/ui/frame/frameRoute.ts`** (DOM-free, no React, no imports). Exports exactly `FrameRoute`, `parseFrameHash`, `buildFrameHash`, `sameScreenState`, `frameSrc` and `replaceFrameHash` with the signatures and bodies in Contracts. `buildFrameHash` encodes every value with `encodeURIComponent` and emits params in the order `state` (screen) / `name`, `example` (component), then `scheme`, so its output is byte-identical to the strings today's three hand-written builders produce. `parseFrameHash` reads the query through `URLSearchParams` (which decodes `%20` and `+` alike), ignores unknown params, returns `undefined` for `''` and `'#/'`, and never throws. `sameScreenState` compares `screen`+`state` (or `name`+`example`) only — never `scheme`, never anything else — with an absent field equal to `''`. (AC-20260915-04-1, AC-20260915-04-2) | The spike proved every tricky state round-trips (28 cases green) and that `URLSearchParams` needs no bespoke `+` branch; one module replaces four divergent copies of the grammar. |
| D3 | **Every builder and parser migrates; `frameHref.ts` is deleted.** `src/ui/frame/frameHref.ts` is removed. `DeviceFrames.tsx` imports `frameSrc`/`replaceFrameHash` from `./frameRoute.js` and passes `{ kind: 'screen', screen, state }` (the dead `scheme` argument of the old `replaceFrameHash` is dropped; no caller ever passed it). `Preview.tsx` builds its `src` with `frameSrc({ kind: 'component', name, example }, theme)`. `mount.tsx` replaces `currentParams`/the segment split with `parseFrameHash(window.location.hash)`; `applyScheme(route)` runs on every parsed route before the kind branch; an `undefined` route renders `null` inside the same `div.p-4`. `src/analysis/look.ts` builds its capture URL as `` `${serveUrl}${frameSrc({ kind: 'screen', screen, state: s, scheme }, theme ?? null)}` `` — the one sanctioned `src/analysis → src/ui` import, byte-identical output. (AC-20260915-04-3, AC-20260915-04-7, AC-20260915-04-10, AC-20260915-04-11) | Four copies of one grammar is how the guide's compare drifted; the package build emits the module under `dist/ui/frame/` without any `package.json`/`tsconfig` change (`exclude` never blocks an imported file — executed, S2). |
| D4 | **The guide is read-only and returns what to ring, not where.** `useJourneyGuide` returns `{ hints: GuideHint[]; ring: string[] }` — `ring` is the ordered list of `[data-to]` labels of this step's outgoing edges that were found in at least one frame, or `[]` when `ring` is off, the guide is disabled, or the step has no found control. Step matching uses `parseFrameHash(win.location.hash)` + `sameScreenState(route, { kind: 'screen', screen: step.screen, state: step.state })` instead of the string compare; the 50 ms/2 s wait (rule 22), the capture-phase click handler (rule 21), hints-with-guide-off (rule 23) and the scroll-into-view of the first found control (rule 25) stay as they are. `ScreenPage` destructures `{ hints, ring }` and passes `ring` to `DeviceFrames`. (AC-20260915-04-4, AC-20260915-04-5) | The hook already knows the labels and already polls for the step; the geometry belongs to the component that owns the scaled wrapper and the tick. |
| D5 | **The ring is drawn by `Device` inside the scaled wrapper.** `DeviceFrames`/`Device` gain a `ring: string[]` prop. A `useLayoutEffect` on `[ring, tick, scale, h]` computes `ringBoxes = resolveRing(root, win, ring, { screen, state })` (Contracts) and stores them with the same reference-stable skip `boxes` uses. `resolveRing` returns `[]` unless `parseFrameHash(win.location.hash)` is `sameScreenState` with the device's own `{ screen, state }` (so a frame still on the previous step never gets a ring); for each label it takes the **first** `[data-to="<CSS.escape(label)>"]` match, skips it when `el.checkVisibility()` is false, when its rect has zero width or height, when the rect does not intersect the frame viewport `(0, 0, win.innerWidth, win.innerHeight)`, or when it does not intersect the `getBoundingClientRect()` of any ancestor whose computed `overflow-x` or `overflow-y` is not `visible`; otherwise it emits the rect as a `Box` in frame-viewport coordinates. Each box renders as `<div data-journey-ring className="pointer-events-none absolute z-5" style={box} />` as a sibling *after* the `<iframe>` and *before* the `showNotes && <Overlay>` block, in the same `div[ref=wrapRef]` — so it is scaled with the frame (rule 30) and sits under note boxes (`z-20`), pins and the marking layer. No coordinate arithmetic: the frame's own rect is already in wrapper-local space. Re-measure is the existing tick (frame scroll in capture phase, `#root` resize, `#root` childList/subtree mutation, double-rAF coalesced, rule 17) plus `scale`/`h` changes; the ~2-frame lag on a continuous scroll is accepted. (AC-20260915-04-4, AC-20260915-04-6, AC-20260915-04-8) | Executed spike S4: ring/target delta ≤ 1 px at every scale, after a 1400 px frame scroll, after a reviewer resize, in both viewports, with zero attributes written into the frame. Floating UI, driver.js, Shepherd, intro.js, react-joyride and @reactour were evaluated and rejected (Rationale). |
| D6 | **Ring style: "ripple".** `src/ui/index.css`'s `[data-journey-target]` rule and `@keyframes journey-ring` are replaced by the `[data-journey-ring]` rules in Contracts (verbatim): a fixed `2px solid oklch(0.606 0.25 292.7)` outline with `outline-offset: 2px` and `border-radius: var(--radius)`, plus `::before`/`::after` echo rings that expand from `inset: -3px` to `inset: -17px` while fading, `2.6s cubic-bezier(0.16, 0.7, 0.3, 1) infinite`, the `::after` delayed `1.3s`; under `prefers-reduced-motion: reduce` the echoes stop and one static echo at `inset: -9px` with 30 % alpha remains. Violet stays the only use of that hue. (AC-20260915-04-4) | JJ chose this variant from four rendered in the prototype (halo, ripple, comet, spotlight); ripple gives more pull than the old pulse without dimming the mock (spotlight) or vanishing on small controls (comet). |
| D7 | **Design reference §8.3 is amended, the atlas is not.** The heading becomes `### 8.3 Guide ring (src/ui/journeys/useJourneyGuide.ts, src/ui/frame/DeviceFrames.tsx, src/ui/index.css)`; the first paragraph is prefixed with **"Prototype:"** and kept verbatim; a new paragraph headed **"Implementation (specs/20260915/04):"** states that the ring is a `[data-journey-ring]` element drawn in the reviewer document inside the scaled device wrapper, positioned from the control's frame rect on the device tick, styled as the ripple in D6, hidden when the control is not visible in the frame's viewport or is clipped by a scrolling ancestor, and that the reviewer never writes into the frame document (D1). Atlas images 38/40/42 keep their captions (one ring, none, two rings); the ring's *look* in 38/42 is the prototype's and the note says so. [no-ac: prose] | The reference is the frozen look; the ring's changed animation is the user's decision recorded here, and the boundary rule needs a home the next session reads. |
| D8 | **Two waves.** Wave 1 (`analysis`): `src/ui/frame/frameRoute.ts` is created and `src/analysis/look.ts` migrates (both by `package-dev`, the module is DOM-free); AC-1/-2/-3/-7 go green. Wave 2 (`ui`): every reviewer caller migrates, `frameHref.ts` is deleted, the guide and the device ring land, the CSS and the design note change. `npm run build` is green after each wave (wave 1 adds the one `dist/ui/frame/frameRoute.*` emission; wave 2 changes nothing under `dist/`). [no-ac: build ordering] | The build stage batches by layer group in order; `look.ts` (analysis) cannot import a module that only exists in the later `ui` wave, so the module's row carries the `analysis` layer even though it lives under `src/ui/frame/`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/ui/frame/frameRoute.ts | CREATE | analysis | D2: the frame hash grammar — `FrameRoute`, `parseFrameHash`, `buildFrameHash`, `sameScreenState`, `frameSrc`, `replaceFrameHash` (Contracts, verbatim); DOM-free; wave 1 so `look.ts` can import it |
| src/analysis/look.ts | MODIFY | analysis | D3: capture URL via `frameSrc({ kind: 'screen', screen, state: s, scheme }, theme ?? null)`; drop the inline `themeParam` line |
| src/ui/frame/frameHref.ts | DELETE | ui | D3: superseded by `frameRoute.ts` |
| src/ui/frame/mount.tsx | MODIFY | ui | D3: `parseFrameHash` replaces `currentParams`; `applyScheme(route)` before the kind branch; `undefined` route renders `null`; the `import.meta.hot` line and everything else unchanged |
| src/ui/frame/DeviceFrames.tsx | MODIFY | ui | D3/D5: import from `./frameRoute.js`; `ring` prop on `DeviceFrames` and `Device`; `resolveRing`; `ringBoxes` layout effect on `[ring, tick, scale, h]`; `[data-journey-ring]` divs between the iframe and the notes overlay |
| src/ui/catalog/Preview.tsx | MODIFY | ui | D3: `src` = `frameSrc({ kind: 'component', name, example }, theme)` |
| src/ui/journeys/useJourneyGuide.ts | MODIFY | ui | D1/D4: no frame writes; route compare via `parseFrameHash`+`sameScreenState`; returns `{ hints, ring }` |
| src/ui/screen/ScreenPage.tsx | MODIFY | ui | D4: destructure `{ hints: guideHints, ring: guideRing }`; pass `ring={guideRing}` to `DeviceFrames` |
| src/ui/index.css | MODIFY | ui | D6: `[data-journey-target]` + `journey-ring` replaced by the `[data-journey-ring]` ripple rules (Contracts) |
| docs/design/design-reference.md | MODIFY | other | D7: §8.3 heading, "Prototype:" prefix, "Implementation (specs/20260915/04):" paragraph |
| tests/unit/frameRoute.test.ts | CREATE | tests | AC-20260915-04-1, AC-20260915-04-2 |
| tests/unit/look.test.ts | MODIFY | tests | AC-20260915-04-3 (tag the existing `folds` test's title; assertions unchanged) |
| tests/package/install.test.ts | MODIFY | tests | AC-20260915-04-7 |
| tests/browser/surfaces.test.ts | MODIFY | tests | AC-20260915-04-4, AC-20260915-04-5, AC-20260915-04-6, AC-20260915-04-8; AC-20260915-04-9 and AC-20260915-04-11 (tag two existing tests' titles; assertions unchanged) |
| tests/server/api.test.ts | MODIFY | tests | AC-20260915-04-10 (tag the existing AC-20260915-03-3 test's title; assertions unchanged) |

## Contracts

```ts
// src/ui/frame/frameRoute.ts — DOM-free; the only module that knows the frame's hash grammar
// (reference §0.2; spec 02 D8 as amended by spec 03 D1/D2; rule 16). Ships as source under
// `src/ui` (package.json `files`) AND compiles into `dist/ui/frame/frameRoute.js` because
// `src/analysis/look.ts` imports it (tsconfig `exclude` never blocks an imported file — S2).
export type FrameRoute =
  | { kind: 'screen'; screen: string; state?: string | undefined; scheme?: string | undefined }
  | { kind: 'component'; name?: string | undefined; example?: string | undefined; scheme?: string | undefined }

function splitFrameHash(hash: string): { path: string; params: URLSearchParams } {
  const withoutHash = hash.replace(/^#\/?/, '')
  const qIndex = withoutHash.indexOf('?')
  const path = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex)
  const query = qIndex === -1 ? '' : withoutHash.slice(qIndex + 1)
  return { path, params: new URLSearchParams(query) }
}

/** `''` and `'#/'` → undefined. Unknown params ignored. Never throws. */
export function parseFrameHash(hash: string): FrameRoute | undefined {
  const { path, params } = splitFrameHash(hash)
  if (!path) return undefined
  const scheme = params.get('scheme')
  const schemeField = scheme !== null ? { scheme } : {}
  if (path === '__component') {
    const name = params.get('name')
    const example = params.get('example')
    return { kind: 'component', ...(name !== null ? { name } : {}), ...(example !== null ? { example } : {}), ...schemeField }
  }
  const state = params.get('state')
  return { kind: 'screen', screen: path, ...(state !== null ? { state } : {}), ...schemeField }
}

/** Inverse of parseFrameHash. Byte-identical to the retired builders: `encodeURIComponent` per
 * value (space → %20, never +), params in the order state | name, example, then scheme. */
export function buildFrameHash(route: FrameRoute): string {
  const sp = new URLSearchParams()
  if (route.kind === 'component') {
    if (route.name !== undefined) sp.set('name', route.name)
    if (route.example !== undefined) sp.set('example', route.example)
  } else if (route.state !== undefined) sp.set('state', route.state)
  if (route.scheme !== undefined) sp.set('scheme', route.scheme)
  const parts: string[] = []
  for (const [key, value] of sp) parts.push(`${key}=${encodeURIComponent(value)}`)
  const query = parts.join('&')
  const path = route.kind === 'component' ? '__component' : route.screen
  return `#/${path}${query ? `?${query}` : ''}`
}

/** Identity only: screen+state or name+example. Ignores scheme and everything else. */
export function sameScreenState(a: FrameRoute, b: FrameRoute): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'component' && b.kind === 'component')
    return (a.name ?? '') === (b.name ?? '') && (a.example ?? '') === (b.example ?? '')
  if (a.kind === 'screen' && b.kind === 'screen') return a.screen === b.screen && (a.state ?? '') === (b.state ?? '')
  return false
}

/** `/?frame=1[&_theme=<key>]<hash>` — `_theme` stays in the real search string (spec 02 D18e). */
export function frameSrc(route: FrameRoute, theme?: string | null): string {
  const themeParam = theme ? `&_theme=${encodeURIComponent(theme)}` : ''
  return `/?frame=1${themeParam}${buildFrameHash(route)}`
}

/** Rule 16: replace with the FULL url (a bare `#…` would load the reviewer inside the frame);
 * no-op when the hash already matches. The old `scheme?: 'dark'` argument is gone. */
export function replaceFrameHash(win: Window, route: FrameRoute): void {
  const hash = buildFrameHash(route)
  if (win.location.hash === hash) return
  win.location.replace(win.location.pathname + win.location.search + hash)
}
```

```ts
// src/ui/journeys/useJourneyGuide.ts — the changed surface only
export type GuideResult = { hints: GuideHint[]; ring: string[] }
export function useJourneyGuide(args: /* unchanged */): GuideResult
// inside `scan`: a root is "on this step" when
//   const route = parseFrameHash(r.ownerDocument.defaultView?.location.hash ?? '')
//   !!route && sameScreenState(route, { kind: 'screen', screen: step.screen, state: step.state })
// `ring` (the returned labels) = outEdges.flatMap((e, i) => e.label && perRoot.some(p => !!p.found[i]) ? [e.label] : [])
//   when the `ring` flag is on, else []; reset to [] (reference-stable when already empty) at the top of the effect.

// src/ui/frame/DeviceFrames.tsx — the changed surface only
export function DeviceFrames(props: /* existing */ & { ring: string[] }): JSX.Element
function resolveRing(root: HTMLElement, win: Window, labels: string[], here: { screen: string; state: string }): Box[]
// Box = { left, top, width, height } in frame-viewport px (src/ui/notes/anchor.ts), same space as note boxes.
// Rules, in order, per label: route guard (sameScreenState(parseFrameHash(win.location.hash), {kind:'screen', ...here}) else [])
//   → el = root.querySelector(`[data-to="${CSS.escape(label)}"]`) (first match) → skip if !el
//   → skip if !el.checkVisibility() → r = el.getBoundingClientRect(); skip if r.width === 0 || r.height === 0
//   → skip if r does not intersect (0, 0, win.innerWidth, win.innerHeight)
//   → for each ancestor a of el up to root: cs = win.getComputedStyle(a); if cs.overflowX !== 'visible' || cs.overflowY !== 'visible',
//       skip if r does not intersect a.getBoundingClientRect()
//   → emit { left: r.left, top: r.top, width: r.width, height: r.height }
// Rendered: {ringBoxes.map((box, i) => <div key={i} data-journey-ring className="pointer-events-none absolute z-5" style={box} />)}
```

```css
/* src/ui/index.css — replaces the `[data-journey-target]` rule and `@keyframes journey-ring` (lines 99-119) verbatim */
/* §8.3: the journey ring — drawn in the reviewer document over the frame (specs/20260915/04 D5), never
 * inside the mock. Violet is used nowhere else (red/yellow/blue are note states), so it always reads
 * as "click here". A fixed outline plus two echo rings that expand outward and fade, staggered so one
 * is always travelling. */
[data-journey-ring] {
  --journey: oklch(0.606 0.25 292.7);
  border-radius: var(--radius);
  outline: 2px solid var(--journey);
  outline-offset: 2px;
}
[data-journey-ring]::before,
[data-journey-ring]::after {
  content: '';
  position: absolute;
  inset: -3px;
  border: 2px solid var(--journey);
  border-radius: calc(var(--radius) + 3px);
  animation: ripple-out 2.6s cubic-bezier(0.16, 0.7, 0.3, 1) infinite;
}
[data-journey-ring]::after {
  animation-delay: 1.3s;
}
@keyframes ripple-out {
  0% {
    inset: -3px;
    border-radius: calc(var(--radius) + 3px);
    opacity: 0;
  }
  12% {
    opacity: 0.55;
  }
  100% {
    inset: -17px;
    border-radius: calc(var(--radius) + 17px);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-journey-ring]::before,
  [data-journey-ring]::after {
    animation: none;
  }
  [data-journey-ring]::before {
    inset: -9px;
    border-radius: calc(var(--radius) + 9px);
    border-color: color-mix(in oklch, var(--journey) 30%, transparent);
    opacity: 1;
  }
  [data-journey-ring]::after {
    display: none;
  }
}
```

Encoding rules the tests derive from (D2): `buildFrameHash({kind:'screen', screen:'account', state:'Low balance'})`
→ `#/account?state=Low%20balance`; `…state:'A&B'` → `#/account?state=A%26B`; `…state:'a/b'` →
`#/account?state=a%2Fb`; `…state:'a+b'` → `#/account?state=a%2Bb`; `…state:'日本語'` →
`#/account?state=%E6%97%A5%E6%9C%AC%E8%AA%9E`; `…state:''` → `#/account?state=`; `{kind:'screen',
screen:'home', state:'Default', scheme:'dark'}` → `#/home?state=Default&scheme=dark`;
`{kind:'component', name:'Wallet Summary', example:'Default'}` →
`#/__component?name=Wallet%20Summary&example=Default`. `parseFrameHash('#/account?state=Low+balance')`
and `parseFrameHash('#/account?state=Low%20balance')` both → `{kind:'screen', screen:'account',
state:'Low balance'}`. `frameSrc({kind:'screen', screen:'home', state:'Default', scheme:'light'}, 'nova')`
→ `/?frame=1&_theme=nova#/home?state=Default&scheme=light` (today's `look.ts` string, byte for byte).

## UI

One visible change, decided by the user: the ring's animation is the ripple in D6 instead of the
prototype's box-shadow pulse. Everything else about the ring — violet, 2 px, offset 2 px, the
reviewer's `--radius`, one ring per found control, none with the guide off — matches §8.3. The ring
now draws *over* the frame rather than *on* the control, so it is not clipped by an `overflow`
container inside the mock (it is hidden instead, D5) and it draws above a sticky header that
overlaps the control; accepted. No other surface changes; the design stage does not run.

## Behavior

A journey step mounts: `ScreenPage` calls `useJourneyGuide`, which (as today) waits until every
visible frame's hash parses to this step's `screen`+`state`, finds each outgoing edge's
`[data-to="<label>"]`, installs the capture-phase click handler, scrolls the first found control into
the frame's view when it is off-screen, and now returns `{ hints, ring: [labels…] }` instead of
marking controls. `DeviceFrames` receives `ring`; each `Device` resolves the labels to boxes on its
own tick, guarded by its own `screen`/`state` against the frame's parsed hash, and renders one
`[data-journey-ring]` per box inside the scaled wrapper. A scroll inside the frame, a resize of the
mock's `#root`, a DOM mutation under it, or a reviewer resize bumps the tick and the ring follows on
the next double-rAF. Guide off (`ui.guideOn === false`) → the hook returns `ring: []` → zero ring
elements (the element is removed, never hidden). Step advance: the guided click sets the reviewer
hash; the frame's hash is replaced (rule 16); until the frame reports the new step, its device's
route guard returns `[]`, so no ring is drawn from the previous step's control. A control that is
`display:none`, zero-sized, scrolled out of the frame's viewport, or scrolled out of an ancestor with
non-`visible` overflow gets no ring.

Frame hash grammar is unchanged for every URL the product emits today; what changes is that one
module now owns it and the parser accepts what any spec-conformant encoder produces.

## Acceptance Criteria

- **AC-20260915-04-1**: WHEN `buildFrameHash` is given a screen route with each of the states `Default`, `Low balance`, `A&B`, `a/b`, `what?`, `a%b`, `a+b`, `日本語` and `''`, and a component route with the same values as `example`, THE SYSTEM SHALL return a string starting `#/` that `parseFrameHash` maps back to a deep-equal route (e.g. `{kind:'screen', screen:'account', state:'Low balance'}` → `#/account?state=Low%20balance` → the same object; `state:'a+b'` → `#/account?state=a%2Bb`), and a screen route with `scheme:'dark'` SHALL round-trip with `scheme` intact → writes tests/unit/frameRoute.test.ts
- **AC-20260915-04-2**: WHEN `parseFrameHash` is given `#/account?state=Low+balance`, `#/account?state=Low%20balance` and `#/account?state=Default&unknown=1&j=first-visit&step=2` THE SYSTEM SHALL return `{kind:'screen', screen:'account', state:'Low balance'}` for the first two and `{kind:'screen', screen:'account', state:'Default'}` for the third; WHEN given `''` or `'#/'` THE SYSTEM SHALL return `undefined`; and `sameScreenState` SHALL return `true` for `parseFrameHash('#/account?state=Low%20balance&scheme=dark')` vs `{kind:'screen', screen:'account', state:'Low balance'}` and vs `parseFrameHash('#/account?state=Low%20balance&scheme=light&extra=1')`, and `false` for state `Default` vs `Keys` and for a screen route vs a component route with the same names → writes tests/unit/frameRoute.test.ts
- **AC-20260915-04-3**: WHEN `look()` runs with `theme: 'nova'`, screen `home`, state `Default`, viewport `1280x800`, scheme `light` THE SYSTEM SHALL CONTINUE TO open exactly `<serveUrl>/?frame=1&_theme=nova#/home?state=Default&scheme=light` → reuses tests/unit/look.test.ts :: folds
- **AC-20260915-04-4** `[env: SKIP_BROWSER]`: WHEN Chromium opens `<url>/#/home?j=first-visit&step=0` on the fixture host and the frame renders `[data-to="Account"]` THE SYSTEM SHALL, within 5 s, have in the reviewer document exactly one `[data-journey-ring]` element per `iframe` (one, in the default single view) placed in the same parent element as its iframe, whose `getBoundingClientRect()` equals the control's rect mapped through the wrapper (`iframeRect.left + ctl.left × scale`, `…top`, `ctl.width × scale`, `ctl.height × scale`, where `scale = wrapper.getBoundingClientRect().width / wrapper.offsetWidth`) within 1 px on every side; its computed `outline` SHALL be `oklch(0.606 0.25 292.7) solid 2px`, `outline-offset` `2px`, `pointer-events` `none`, `animation-name` `none`; `getComputedStyle(ring, '::before').animationName` SHALL be `ripple-out` with `animationDuration` `2.6s`, and `getComputedStyle(ring, '::after').animationDelay` SHALL be `1.3s`; and the frame document SHALL contain zero elements carrying any attribute whose name contains `journey` and zero elements matching `[data-journey-target]` → writes tests/browser/surfaces.test.ts
- **AC-20260915-04-5** `[env: SKIP_BROWSER]`: WHEN a scratch copy of the fixture host has `src/screens/home.tsx` edited so `meta.states` is `['Low balance', 'empty']` and its `examples` key `Default` is renamed `'Low balance'`, and `src/journeys.ts` edited so step 0 is `{ screen: 'home', state: 'Low balance' }`, `serve` runs on it, and Chromium opens `<url>/#/home?state=Low%20balance&j=first-visit&step=0` THE SYSTEM SHALL, within 5 s, have the frame's `location.hash` equal to `#/home?state=Low%20balance`, exactly one `[data-journey-ring]` in the reviewer document, and one hint in the journey pill whose text contains `Account` (pre-image: zero rings and zero hints — the unencoded compare never matches) → writes tests/browser/surfaces.test.ts
- **AC-20260915-04-6** `[env: SKIP_BROWSER]`: WHEN, on the AC-4 page, the test prepends a `1600px`-tall `div` to the frame's `#root` and calls the frame window's `scrollTo(0, 1400)` THE SYSTEM SHALL within 2 s show the one ring again within 1 px of the (moved) control; WHEN the reviewer viewport is then resized to `900×700` (the wrapper scale changes) THE SYSTEM SHALL within 2 s show it within 1 px; WHEN the `Guide` toggle (`aria-label="Guide"`) is clicked THE SYSTEM SHALL within 2 s have zero `[data-journey-ring]` elements, and clicking it again SHALL restore exactly one; and WHEN `sessionStorage.view` is `both`, the viewport is `1800×900` and the page reloads THE SYSTEM SHALL show two iframes and exactly one ring per iframe, each within 1 px of its own control → writes tests/browser/surfaces.test.ts
- **AC-20260915-04-7**: WHEN the test-time build has run (`.test-dist/`, tests/setup.ts — needs a built dist) THE SYSTEM SHALL have under `.test-dist/ui/` exactly the four files `frame/frameRoute.js`, `frame/frameRoute.js.map`, `frame/frameRoute.d.ts`, `frame/frameRoute.d.ts.map` and nothing else, `.test-dist/analysis/look.js` SHALL import `../ui/frame/frameRoute.js`, and `src/ui/frame/frameHref.ts` SHALL not exist → writes tests/package/install.test.ts
- **AC-20260915-04-8** `[env: SKIP_BROWSER]`: WHEN, on the AC-4 page with one ring showing, the test wraps the frame's `[data-to="Account"]` in a new `div` styled `overflow:hidden; height:0` THE SYSTEM SHALL within 2 s have zero `[data-journey-ring]` elements; WHEN the test then unwraps it (moves the control back and removes the div) THE SYSTEM SHALL within 2 s show exactly one ring within 1 px of the control; WHEN the test then calls the frame window's `location.replace(pathname + search + '#/account?state=Default')` while the reviewer stays on `#/home?j=first-visit&step=0` THE SYSTEM SHALL within 2 s have zero rings (the device's route guard: the frame no longer shows this device's screen) → writes tests/browser/surfaces.test.ts
- **AC-20260915-04-9** `[env: SKIP_BROWSER]`: WHEN, on `#/home?j=first-visit&step=0`, the frame's `[data-to="Account"]` is clicked THE SYSTEM SHALL CONTINUE TO navigate the reviewer to `#/account…` carrying `j=first-visit` and `step=1` → reuses tests/browser/surfaces.test.ts :: AC-20260915-02-1 (D4/D21's
- **AC-20260915-04-10** `[env: SKIP_BROWSER]`: WHEN `GET <url>/?frame=1#/home?state=Default` is loaded in Chromium THE SYSTEM SHALL CONTINUE TO render `[data-component="ConsoleShell"]` containing `<button data-to="Account">` with zero `[data-sidebar]`, and WHEN the hash is `#/home?state=Default&scheme=dark` THE SYSTEM SHALL CONTINUE TO have `html.dark` → reuses tests/server/api.test.ts :: AC-20260915-03-3:
- **AC-20260915-04-11** `[env: SKIP_BROWSER]`: WHEN `nova` is chosen in the theme Select THE SYSTEM SHALL CONTINUE TO give the catalog preview iframe a `src` carrying `_theme=nova` and a hash starting `#/__component?name=` → reuses tests/browser/surfaces.test.ts :: AC-20260915-03-10

## Assumptions (escalation triggers)

- A1: `URLSearchParams` decodes both `%20` and `+` to a space, `encodeURIComponent` never emits `+`, and every tricky state round-trips through `buildFrameHash`/`parseFrameHash` — **executed 2026-09-16 (S1)**: `npx vitest run tests/unit/frameRoute.test.ts` in the route spike worktree → `Tests 28 passed (28)` over the states `Default`, `Low balance`, `A&B`, `a/b`, `what?`, `a%b`, `日本語`, `a+b`, `''`, plus `+`-encoded and `%20`-encoded legacy hashes and the unknown-param case — **if false:** STOP, ask the user (D2's whole premise).
- A2: `tsc -p tsconfig.build.json` emits a file under `src/ui/**` when `src/analysis/look.ts` imports it, despite `exclude: ["src/ui/**"]`, and emits nothing else under `ui/` — **executed 2026-09-16 (S2)**: the route spike compiled with `--outDir <scratch>` → exit 0; `find <scratch>/ui -type f` lists exactly `ui/frame/frameRoute.d.ts`, `.d.ts.map`, `.js`, `.js.map` — **if false (more of `src/ui` is pulled in):** move `frameRoute.ts` to `src/analysis/frameRoute.ts` and have the ui callers import it from there; the File Plan gains no row (path swap only), the AC-7 listing becomes "nothing under `.test-dist/ui/`".
- A3: Chromium (Playwright's, 153.0.8010.12 installed) serialises the computed `outline-color` of `oklch(0.606 0.25 292.7)` as exactly `oklch(0.606 0.25 292.7)` and `outline` as `oklch(0.606 0.25 292.7) solid 2px`; `getComputedStyle(el, '::before').animationName` reports a pseudo-element's own keyframe name; `Element.checkVisibility` exists and is `false` for `display:none`; `CSS.escape` exists — **executed 2026-09-16 (S3)**, scratch Playwright page with the D6 rules: `{"outline":"oklch(0.606 0.25 292.7) solid 2px","outlineColor":"oklch(0.606 0.25 292.7)","outlineOffset":"2px","before":"ripple-out","beforeDur":"2.6s","afterDelay":"1.3s","hostAnim":"none","hasCheckVisibility":"function","hiddenVis":false,"cssEscape":"a\\\"b"}` — **if false after a Playwright bump:** compare against a probe element carrying the same declared colour instead of the literal (the prototype's `verify.mjs` did this) and note it in the test.
- A4: A `[data-journey-ring]` div placed inside the scaled wrapper and positioned from the control's in-frame `getBoundingClientRect()` lands on the control with no coordinate math, at every scale, after a frame scroll, after a reviewer resize and in both viewports, with zero attributes written into the frame — **executed 2026-09-16 (S4)**: `SPIKE_MODE=after npx vitest run tests/browser/zz-spike-ring.test.ts` in the ring spike worktree → `Tests 1 passed (1)` with assertions: one ring, `targets` (journey attributes in the frame) `0`, delta ≤ 1 px initially / after a 1600 px spacer + `scrollTo(0,1400)` / after a `900×700` resize, guide off → 0 rings, on → 1, both viewports → `1,1` with delta ≤ 1 each; and the prototype (`proto/ring`, 116 checks, deltas 0.00 px at scale 1 and 0.63) — **if false:** STOP, ask the user.
- A5: The pre-image draws no visible ring on the fixture journey — **executed 2026-09-16** before compaction (the same spike test in `SPIKE_MODE=before` on HEAD `22f62a2`): `[data-journey-target]` present in the frame with computed `outline-style: none`; zero `[data-journey-ring]`; and the live repro on `nikoniko-mocktrial` (`Read a handoff`, step 1 of 2, no ring) — **if false:** nothing changes; the spec still lands the boundary rule.
- A6: The existing tick (`ResizeObserver` on `#root`, `MutationObserver` childList/subtree, capture scroll) fires for AC-6/AC-8's manipulations: a prepended spacer and a wrapping/unwrapping div are childList mutations, `scrollTo` is a scroll, the reviewer resize changes `scale`, and a test-side `location.replace` of the frame hash re-renders `#root`'s children (a mutation) — **executed** for the spacer/scroll/resize cases in S4; the wrap/unwrap and hash-replace cases are the same observer paths — **if false (a case does not tick):** the test triggers a no-op childList mutation after the change (append + remove an empty `span`), and Rationale records the gap; the product's own transitions all go through hash replace → React render → mutation, so users are unaffected.
- A7: The fixture host's `home.tsx` and `journeys.ts` are plain enough that AC-5's two string edits (`states: ['default', 'empty']` → `['Low balance', 'empty']`, `Default:` example key → `'Low balance':`, step 0 gains `state: 'Low balance'`) yield a screen whose first example key is `Low balance` and a journey whose step 0 state is `Low balance` — verified by reading `tests/fixtures/host/src/screens/home.tsx:9,30` and `journeys.ts` (the `Step` type already allows `state?` per spec 02 D4) — **if false:** the test writes a fresh minimal `home.tsx` into the scratch copy instead of editing.

## Rationale

**Why an overlay and not a fix inside the frame.** The prototype-era guide styled the control by
tagging it, which worked when reviewer and mock shared one document. Since spec 03 the mock's
document loads only the host's stylesheet by design, so the tag is inert — and any attempt to make it
work (injecting a stylesheet, an inline style, a class) breaks the property the reviewer exists to
protect: the artefact under review is exactly the host's code and CSS. Note pins already solved the
same problem the right way — measure in the frame, draw in the reviewer inside the scaled wrapper
(rule 30) — so the ring reuses that mechanism and the tick that feeds it.

**Third-party libraries, evaluated and rejected (2026-09-16, sources read from npm).** driver.js
1.8.0, Shepherd 15.3.0 and intro.js 8.5.0 all add classes/ARIA/tabindex to the target element (a D1
violation, and inert here); none uses `ownerDocument`; Shepherd and intro.js are AGPL. react-joyride
3.2.0 and @reactour/tour 3.8.0 leave the target alone but are bound to the parent `document`, so a
target inside the iframe gets a spotlight at iframe-local coordinates with no frame offset or scale.
`@floating-ui/dom` 1.8.0 does walk out of iframes, but it assumes the floating element sits *outside*
the scaled container; measured inside the wrapper at scale 0.63 it lands 13.7 px / 22.2 px off
(it divides by the offsetParent scale and then multiplies by the iframe scale). Radix Popper inherits
that; react-aria has no iframe traversal at all. Design-tool overlays (Storybook, Sanity, Builder,
Vercel toolbar, Plasmic) all inject an agent *into* the framed page. Our arrangement is the simpler
case, not the harder one: the in-frame rect is already in wrapper-local space. Floating UI's
`autoUpdate` would be a reasonable later replacement for the tick (already installed transitively,
ignores mutations that move nothing) but touches the note-pin path too; deferred, not queued as work.

**Why one route module, and why it lives under `src/ui` yet builds in the analysis wave.** The frame's
hash grammar was built in four places (`frameHref.ts`, `look.ts`, `Preview.tsx`, the guide) and parsed
in two (`mount.tsx`, the guide); the guide's parse was the odd one out. The module is owned by the
reviewer conceptually (it is the frame's grammar) and ships as source under `src/ui` anyway, but the
build stage orders waves by layer group, so the row carries `analysis` to land before `look.ts`
imports it. The alternative — a copy of the grammar in `src/analysis` — is the duplication this spec
removes.

**Why the ripple.** The user compared four animations rendered live in a throwaway prototype and
chose the ripple; the design reference's frozen look is amended, not silently changed (D7). The
reduced-motion fallback is part of the rule because the ring is on screen for as long as a step is
pending.

**Clip rule.** The prototype showed that `checkVisibility()` alone still rings a control scrolled out
of an inner `overflow:auto` box or out of the frame's viewport (the ring is a sibling of the iframe,
so nothing clips it). D5's intersection tests against the frame viewport and every non-`visible`
overflow ancestor are pure reads and close that gap; a sticky header *overlapping* the control is not
clipping and is accepted (the ring draws over the header).

**Tier.** Standard: no contract JSON shape, no `package.json` field, no `bin`/`exports`/`files`
change; `dist/` gains one additive module at the next release and `look`'s URL is pinned byte for
byte (AC-3). Not boot-path code.

**Pins.** AC-3, AC-9, AC-10 and AC-11 are `SHALL CONTINUE TO` pins on the four migrated callers'
observable outputs (screenshot URL, guided click, frame render + dark scheme, catalog preview `src`);
every other AC's test expires at close.

**Fragile.** The double-rAF tick means a continuous frame scroll shows the ring ~2 frames behind;
browser tests must poll (≤ 2 s) rather than assert synchronously. Tailwind's `z-5` is a bare numeric
utility (Tailwind 4 accepts `z-<number>`); if the reviewer's CSS ever gains a `--z-*` theme that
disables bare values, use `style={{ ...box, zIndex: 5 }}`.

**Collision closure** (`collision-closure.js --literal frameHref --literal data-journey-target
--literal journey-ring`, 2026-09-16): every in-tree literals hit is a File Plan row —
`src/ui/frame/DeviceFrames.tsx` (frameHref, journey-ring), `src/ui/index.css` and
`src/ui/journeys/useJourneyGuide.ts` (data-journey-target), `docs/design/design-reference.md` (all
three; D7's "Prototype:" paragraph keeps the old names on purpose). Waived: the gitignored spike
worktrees under `.claude/worktrees/agent-a0ddc05f406401ad9` and `agent-a47d175149d07f66b` (throwaway
copies, removed after the build) and the stale `.test-dist/page/assets/*` bundle (a spec 02 build
artefact no test reads since spec 03). No `executes` hits; the three `mentions` hits on the paths leg
are the pinned tests AC-9/-10/-11 name.

## Canonical Delta

`docs/canonical/package.md`:

- "Frame URL grammar": append after the existing paragraph — "One module owns this grammar:
  `src/ui/frame/frameRoute.ts` (`parseFrameHash`, `buildFrameHash`, `sameScreenState`, `frameSrc`,
  `replaceFrameHash`). Every builder (`DeviceFrames`, the catalog `Preview`, `check --look`) and every
  parser (the frame entry, the journey guide) goes through it; values are `encodeURIComponent`-encoded
  on the way out and read through `URLSearchParams` on the way in, so `%20` and `+` both mean a space.
  `src/analysis/look.ts` importing it is the one sanctioned `analysis → ui` import; the package build
  therefore emits `dist/ui/frame/frameRoute.js` as the only compiled file under `dist/ui/`."
- New subsection after "Frame URL grammar", titled "The frame boundary": "The reviewer never writes to
  the frame's document — no attribute, class, inline style, node or stylesheet, and no mutation of a
  host control's style. It reads and measures, listens (capture-phase click, scroll, resize and
  mutation observers built from the frame's realm), and navigates (hash replace, `scrollTo`). Anything
  the reviewer needs to show *on* the mock — note boxes, pins, the journey ring — is measured in the
  frame and drawn in the reviewer document inside the same scaled wrapper as the iframe, where the
  frame's own rects are already in local coordinates. The journey ring is `[data-journey-ring]`, one
  per found control, hidden when the control is not visible in the frame's viewport or is clipped by a
  scrolling ancestor, styled by the reviewer's `index.css`."
