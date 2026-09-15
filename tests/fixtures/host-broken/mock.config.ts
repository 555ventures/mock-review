// Broken fixture (D13 red overlay): missing `client`, which must fail ConfigSchema and produce a
// `config` error finding plus a null config report (AC-20260915-01-9).
export default {
  name: 'app',
  port: 5180,
  targets: {
    viewports: ['360x800', '1280x800'],
    schemes: ['light', 'dark'],
  },
  theme: null,
}
