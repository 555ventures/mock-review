# Deviations — 01-contract-version-2

- package-lock.json updated via `npm install --package-lock-only` (not hand-edited) to sync the
  lockfile's own `version` fields (root + first entry, plus nested self-references) from `1.0.0` to
  `2.0.0` after `package.json`'s version bump (D4). Not in the `other` worker's file list, but
  required so `package-lock.json` does not drift from `package.json`; done through npm per the
  worker contract's instruction. **Scope corrected at review fix**: besides the root and self `version`
  fields, npm also wrote six nested `"inBundle": true` entries under
  `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules` (@emnapi/core 1.11.1, @emnapi/runtime
  1.11.1, @emnapi/wasi-threads 1.2.2, @napi-rs/wasm-runtime 1.1.4, @tybys/wasm-util 0.10.2,
  tslib 2.8.1). No top-level dependency version changed. `package-lock.json` is now a File Plan row,
  so this is no longer out of plan.
