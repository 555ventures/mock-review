// Server-renders two example specs with the gray registry and prints the HTML plus which of the
// anchoring attributes appear. Run: node <abs>/src/catalog/proof/render-proof.mjs
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
})
try {
  const mod = await server.ssrLoadModule('/src/catalog/proof/examples.tsx')
  for (const r of mod.renderAll()) {
    console.log(`\n===== ${r.name} =====`)
    console.log(r.html.replace(/ style="[^"]*"/g, ''))
    for (const attr of ['data-node', 'data-component', 'data-to', 'data-index']) {
      const hits = r.html.match(new RegExp(`${attr}="[^"]*"`, 'g')) ?? []
      console.log(`${attr}: ${hits.length} -> ${[...new Set(hits)].join(' ')}`)
    }
    console.log(`prop check issues: ${JSON.stringify(r.propIssues)}`)
    console.log(`catalog.validate: ${JSON.stringify(r.catalogValid)}`)
  }
  console.log(`\n===== deliberate typo {lable:'Oops'} =====\n${JSON.stringify(mod.badPropIssues())}`)
} finally {
  await server.close()
}
