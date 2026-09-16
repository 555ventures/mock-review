---
name: feedback-radix-select-bugs
description: two Radix Select gotchas in this stack (React 19 + radix-ui) that manifest as an infinite render loop, not a visible warning
metadata:
  type: feedback
---

Two independent Radix `Select` bugs hit while building the reviewer page's theme picker and the
Components-page example picker (both stock shadcn `select.tsx`, `radix-ui` package):

1. Passing `value=""` (an empty string, used as a workaround for `exactOptionalPropertyTypes` not
   liking `value={x ?? undefined}`) makes Radix's internal `SelectItemAlignedPosition` throw
   "Maximum update depth exceeded" the moment the trigger is clicked — the empty string never
   matches any `SelectItem`'s value, and Radix's item-aligned scroll-to-selected logic loops
   retrying forever. **Fix:** never pass `value` at all when nothing is selected yet — conditional
   spread it in: `<Select {...(x ? { value: x } : {})} ...>`.
2. Independently, the *default* `SelectContent` position (`"item-aligned"`, shadcn's own default)
   can loop the same way in this exact React 19 + radix-ui version combo, even with a valid
   `value`. **Fix:** pass `position="popper"` explicitly on every `SelectContent` usage in this
   codebase.

**Why:** both reproduced as click-hangs in Playwright with zero visible console output in a
production build; only visible by rebuilding the page with `define:
{'process.env.NODE_ENV': JSON.stringify('development')}` and `build.minify:false`, which surfaces
"An error occurred in the `<ForwardRef(SelectItemAlignedPosition)>` component" plus "Maximum
update depth exceeded" in the console.

**How to apply:** anywhere a `Select` is added to this reviewer page (or reused from
`src/ui/components/ui/select.tsx`), apply both fixes preemptively rather than rediscovering this.
