// SEED copies this file to app/mock.config.ts verbatim (specs/20260914/01 D4). Every field but
// `theme` is set once at SEED and left alone; THEME sets `theme` to the picked candidate's key
// once it is recorded on the served page (D8) — the only line of this file a session ever edits.
export default {
  name: 'app',
  port: 5180,
  targets: {
    viewports: ['360x800', '1280x800'],
    schemes: ['light', 'dark'],
  },
  theme: null,
  client: {
    token: 'replace-me',
  },
}
