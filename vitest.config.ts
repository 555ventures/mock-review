import { defaultExclude, defineConfig } from 'vitest/config'

// D13: `unit` covers everything under tests/** except tests/browser/**; `browser` is
// tests/browser/**, entirely skipped when SKIP_BROWSER=1 so `npm run test` still exits 0 with no
// Playwright browser installed. `npm run test` (bare vitest run) runs both projects. Each
// project's `exclude` must keep vitest's own `defaultExclude` (node_modules, .git) — passing a
// bare custom array replaces it outright, which would let the fixture hosts' symlinked
// `node_modules/zod` test suite leak into `unit`.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: [...defaultExclude, 'tests/browser/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.ts'],
          exclude: process.env.SKIP_BROWSER === '1' ? [...defaultExclude, 'tests/browser/**'] : defaultExclude,
        },
      },
    ],
  },
})
