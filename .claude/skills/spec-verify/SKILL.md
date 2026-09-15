---
name: spec-verify
description: "Use to verify the package locally: gate, fixture host, driver run."
allowed-tools:
  - Bash(npm run:*)
  - Bash(npx vitest:*)
  - Bash(node:*)
---

1. `npm run check` — typecheck, lint, tests.
2. `npm run build` — emits `dist/`; `node dist/cli.js contract --json` must print the contract envelope.
3. Fixture host: `tests/fixtures/host` mirrors the plugin's `spec/templates/mock/` copies; run `node dist/cli.js check --json` from it with `cwd` set there.
4. Driver run: `node ~/projects/claude-plugins/spec/scripts/mocks-driver.js --root <scratch host root>` with `<root>/app/node_modules/.bin/mock-review` linked to `dist/cli.js` — the marks must record with the real binary.
