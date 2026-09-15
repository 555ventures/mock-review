// D8: `@555/mock-review/vite` — the package's Vite plugin entry point, re-exported from the
// server layer so a host's `vite.config.ts` can `import { mockReview } from '@555/mock-review/vite'`.
export { mockReview, default } from './server/plugin.js'
