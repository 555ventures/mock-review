// walkthrough prototype: `npm run walkthrough` — this package is its own root, no host app.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { loadEnvLocal, walkthrough } from './src/server/walkthrough-plugin.js'

const root = path.dirname(fileURLToPath(import.meta.url))
loadEnvLocal(root)

const port = Number(process.env['WALKTHROUGH_PORT'] ?? 5190)

export default defineConfig({
  root,
  appType: 'custom',
  plugins: [walkthrough({ root }), react(), tailwindcss()],
  resolve: {
    alias: { '@': path.join(root, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // today's OPTIMIZE_DEPS_INCLUDE (src/server/plugin.ts D4) + json-render and zod for the frame.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'radix-ui',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'lucide-react',
      'cmdk',
      'react-resizable-panels',
      '@json-render/core',
      '@json-render/react',
      'zod',
    ],
  },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
})
