# Deviations — 04-journey-guide-honours-the-frame-boundary

- D3 requires `mount.tsx` to import `parseFrameHash` from `./frameRoute.js` (verbatim: "`mount.tsx`
  replaces `currentParams`/the segment split with `parseFrameHash(window.location.hash)`"). Vite
  dev serves this as its own unbundled ES module request, so the frame document's resource timing
  now carries a third `src/ui/` URL (`src/ui/frame/frameRoute.ts`) alongside `main.tsx` and
  `frame/mount.tsx`. `tests/server/api.test.ts`'s AC-20260915-04-10 row says "assertions unchanged",
  but its existing assertion (`tests/server/api.test.ts:476`) requires *zero* `src/ui/` URLs other
  than those two, so it now fails — not a regression in the migrated code, a direct and unavoidable
  consequence of applying D3 verbatim. `tests/server/api.test.ts` is outside this worker's assigned
  batch (owned by test-owner); the fix is to allow `src/ui/frame/frameRoute.ts` in that URL set,
  e.g. `expect(srcUiUrls.filter((u) => !u.endsWith('src/ui/main.tsx') && !u.endsWith('src/ui/frame/mount.tsx') && !u.endsWith('src/ui/frame/frameRoute.ts'))).toEqual([])`.
  Resolved by the orchestrator as D9 (Decisions table): AC-20260915-04-10 now states the
  three-URL set and the api.test.ts assertion allows exactly one `src/ui/frame/frameRoute.ts`.
