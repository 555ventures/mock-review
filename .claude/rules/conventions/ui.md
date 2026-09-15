---
paths:
  - "src/ui/**"
---

Feature folders: `frame`, `notes`, `journeys`, `catalog`, `shell`. Store: one store module with selectors; components never derive state that a selector can. Sync: `src/ui/sync/` is the only module that talks to the server endpoints, sending per-note patches. Presentational components take props only; `*Container` components read the store. shadcn parts come from the package's own `src/ui/components/ui/` copy, composed as in the official examples. The design is `docs/design/design-reference.md`; match it, never improve it.
