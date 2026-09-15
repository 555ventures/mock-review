import type { Plugin } from 'vite'

/** D8: the exact stub page body for spec 01 — replaced by the real reviewer page in spec 02. */
const STUB_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>mock-review</title>
  </head>
  <body>
    <p>mock-review: reviewer page lands in spec 02</p>
  </body>
</html>
`

/**
 * The reviewer's Vite plugin. Mounts two dev-server routes ahead of Vite's own middlewares:
 * `GET /__mock-review/ping` (liveness, read by `check`'s D8 probe) and `GET /` (the stub page
 * spec 02 replaces with the real reviewer UI).
 */
export function mockReview(): Plugin {
  return {
    name: 'mock-review',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET') {
          next()
          return
        }

        const url = (req.url ?? '').split('?')[0]

        if (url === '/__mock-review/ping') {
          const body = JSON.stringify({ ok: true, pid: process.pid })
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(body)
          return
        }

        if (url === '/') {
          res.statusCode = 200
          res.setHeader('content-type', 'text/html')
          res.end(STUB_HTML)
          return
        }

        next()
      })
    },
  }
}

export default mockReview
