# Deviations — 01-contract-version-2

- package-lock.json updated via `npm install --package-lock-only` (not hand-edited) to sync the
  lockfile's own `version` fields (root + first entry, plus nested self-references) from `1.0.0` to
  `2.0.0` after `package.json`'s version bump (D4). Not in the `other` worker's file list, but
  required so `package-lock.json` does not drift from `package.json`; done through npm per the
  worker contract's instruction, no dependency versions changed.
