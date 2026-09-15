---
paths:
  - "src/schemas/**"
---

One zod schema per contract shape (`contract`, `check`, `sweep`, `notes`, `approval`, `decisions`, `config`), exported with its inferred type. `.strict()` on objects the package writes; objects the plugin may extend (`approval.journeys[*]` carries `reason`/`at` from `client waive`) use `.passthrough()`. Never a second declaration of a shape elsewhere.
