import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// D8/D18c: builds the reviewer page (`src/ui/index.html`) into `dist/page/` (overridable with
// `--outDir`, used by tests/setup.ts to redirect into `.test-dist/page/`). Its own Tailwind 4
// CSS with the reference's tokens — never the host app's CSS or bundle (ADR-0028).
const repoRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(repoRoot, 'src', 'ui'),
  base: '/__mock-review/page/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.join(repoRoot, 'dist', 'page'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(repoRoot, 'src', 'ui', 'index.html'),
    },
  },
})
