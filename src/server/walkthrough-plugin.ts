// walkthrough prototype: the one Vite plugin (dev server only) behind `npm run walkthrough`.
// Mounts, ahead of Vite's own middleware:
//   seam B — `/p/<project>/` (the reviewer shell, and `?frame=1` the bare screen document),
//            `/p/<project>/__mock-review/{state,notes,approval,events}`,
//            `/p/<project>/__walkthrough/{frame,image/…}`
//   seam C — `/v1…` (bearer WALKTHROUGH_API_TOKEN)
// State lives in Postgres (`DATABASE_URL`); `.env.local` is loaded here.
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import { closePool } from './db/pool.js'
import { handleApi } from './walkthrough/api.js'
import { isRecord, roleOf, sendJson } from './walkthrough/http.js'
import { handleApproval, handleEvents, handleFrame, handleImage, handleNotes, handleState } from './walkthrough/reviewer.js'
import type { PropSchemas } from './walkthrough/validate.js'

const ENTRY_ID = 'walkthrough:entry'
const RESOLVED_ENTRY_ID = '\0walkthrough:entry'
const ENTRY_URL = '/@id/__x00__walkthrough:entry'

/** Today's ENTRY_HTML (src/server/plugin.ts D1), retitled; `main.tsx` switches on `?frame`. */
const ENTRY_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>walkthrough</title></head>' +
  `<body><div id="root"></div><script type="module" src="${ENTRY_URL}"></script></body></html>`

const PROJECT_ROUTE = /^\/p\/([A-Za-z0-9_-]+)(\/.*)?$/

/** The package root: this file is `<root>/src/server/walkthrough-plugin.ts`. */
function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
}

export function loadEnvLocal(root: string): void {
  const file = path.join(root, '.env.local')
  if (existsSync(file)) process.loadEnvFile(file)
}

export type WalkthroughOptions = { root?: string }

export function walkthrough(options: WalkthroughOptions = {}): Plugin {
  const root = options.root ?? packageRoot()
  loadEnvLocal(root)
  const entryModulePath = path.resolve(root, 'src', 'ui', 'main.tsx')
  const catalogPath = path.resolve(root, 'src', 'catalog', 'gray-catalog.ts')
  let warned = ''

  function warnOnce(message: string): void {
    if (warned === message) return
    warned = message
    console.warn(`walkthrough: ${message} — push validation is structure-only (unknown component types are still refused)`)
  }

  /** Seam C/D: the gray catalog's `propSchemas`, loaded fresh through Vite's SSR loader on every
   * push (so a catalog edit applies without a restart). Missing or broken → `null` + one warning. */
  async function loadPropSchemas(server: ViteDevServer): Promise<PropSchemas | null> {
    if (!existsSync(catalogPath)) {
      warnOnce('src/catalog/gray-catalog.ts does not exist yet')
      return null
    }
    try {
      const mod = (await server.ssrLoadModule(catalogPath)) as { propSchemas?: unknown }
      const schemas = mod.propSchemas
      if (!isRecord(schemas) || !Object.values(schemas).every((s) => isRecord(s) && typeof s['safeParse'] === 'function')) {
        warnOnce('src/catalog/gray-catalog.ts has no usable `propSchemas` export')
        return null
      }
      warned = ''
      return schemas as PropSchemas
    } catch (err) {
      warnOnce(`src/catalog/gray-catalog.ts failed to load (${err instanceof Error ? err.message : String(err)})`)
      return null
    }
  }

  async function route(server: ViteDevServer, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://walkthrough.local')
    const method = req.method ?? 'GET'

    if (await handleApi(req, res, url, { loadPropSchemas: () => loadPropSchemas(server) })) return true

    if (method === 'GET' && url.pathname === '/') {
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('walkthrough: open /p/<project>/\n')
      return true
    }

    const m = PROJECT_ROUTE.exec(url.pathname)
    if (!m) return false
    const project = m[1] ?? ''
    const rest = m[2] ?? ''
    const ctx = { req, res, url, project }

    if (rest === '' && method === 'GET') {
      res.statusCode = 302
      res.setHeader('location', `/p/${project}/${url.search}`)
      res.end()
      return true
    }
    if (rest === '/' && method === 'GET') {
      const isFrame = url.searchParams.get('frame') === '1'
      if (roleOf(req, res, project) === 'refused') {
        if (isFrame) {
          sendJson(res, 403, { error: 'client token required', code: 'client-token-required', apiVersion: 1 })
        } else {
          res.statusCode = 403
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end('walkthrough: this link needs its client token')
        }
        return true
      }
      const html = await server.transformIndexHtml(req.url ?? `/p/${project}/`, ENTRY_HTML)
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(html)
      return true
    }

    if (method === 'GET' && rest === '/__mock-review/state') return handleState(ctx).then(() => true)
    if (method === 'POST' && rest === '/__mock-review/notes') return handleNotes(ctx).then(() => true)
    if (method === 'POST' && rest === '/__mock-review/approval') return handleApproval(ctx).then(() => true)
    if (method === 'GET' && rest === '/__mock-review/events') {
      handleEvents(ctx)
      return true
    }
    if (method === 'GET' && rest === '/__mock-review/ping') {
      sendJson(res, 200, { ok: true, pid: process.pid })
      return true
    }
    if (method === 'GET' && rest === '/__walkthrough/frame') return handleFrame(ctx).then(() => true)
    if (method === 'GET' && rest.startsWith('/__walkthrough/image/')) {
      return handleImage(ctx, rest.slice('/__walkthrough/image/'.length)).then(() => true)
    }
    return false
  }

  return {
    name: 'walkthrough',
    apply: 'serve',

    resolveId(id) {
      if (id === ENTRY_ID) return RESOLVED_ENTRY_ID
      return undefined
    },

    load(id) {
      if (id === RESOLVED_ENTRY_ID) return `import ${JSON.stringify(entryModulePath)}\n`
      return undefined
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        route(server, req, res)
          .then((handled) => {
            if (!handled) next()
          })
          .catch((err: unknown) => {
            console.error('walkthrough: request failed', err)
            if (!res.headersSent) sendJson(res, 500, { error: 'internal', detail: err instanceof Error ? err.message : String(err), apiVersion: 1 })
            else res.end()
          })
      })

      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        const port = address && typeof address === 'object' ? address.port : process.env['WALKTHROUGH_PORT']
        console.log(`walkthrough: http://127.0.0.1:${port}/p/<project>/  (API: http://127.0.0.1:${port}/v1)`)
      })
      server.httpServer?.once('close', () => {
        void closePool()
      })
    },
  }
}

export default walkthrough
