// walkthrough prototype: HTTP helpers shared by the reviewer routes (seam B) and the plugin API
// (seam C). Role logic mirrors src/server/plugin.ts's `roleOf` exactly, with the client token from
// `WALKTHROUGH_CLIENT_TOKEN` and the cookie scoped to `/p/<project>/`.
import type { IncomingMessage, ServerResponse } from 'node:http'

export const API_VERSION = 1 as const

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Seam C's refusal body: `{error:'<kebab-code>', detail, apiVersion:1}`. */
export function sendApiError(res: ServerResponse, status: number, error: string, detail: unknown): void {
  sendJson(res, status, { error, detail, apiVersion: API_VERSION })
}

/** Seam B's refusal body. `error` stays TODAY's human sentence because `src/ui/sync/api.ts`
 * (`refusalOf`) puts `body.error` on screen verbatim; the kebab code rides along as `code`, plus
 * `detail` and `apiVersion`, so the body is still a superset of seam C's. */
export function sendReviewerError(res: ServerResponse, status: number, code: string, sentence: string, detail?: unknown): void {
  sendJson(res, status, { error: sentence, code, detail: detail ?? sentence, apiVersion: API_VERSION })
}

export function readBody(req: IncomingMessage, limit = 25 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function tryParseJson(raw: Buffer | string): unknown {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')) as unknown
  } catch {
    return undefined
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const CLIENT_COOKIE = 'walkthrough-client'
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const TUNNEL_HEADERS = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip'] as const

function isLoopbackOwner(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress
  if (remote === undefined || !LOOPBACK_ADDRESSES.has(remote)) return false
  return !TUNNEL_HEADERS.some((header) => req.headers[header] !== undefined)
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

export type Role = 'owner' | 'client' | 'refused'

/** Same precedence as today's `roleOf` (plugin.ts D24): a matching `?client=` is `client` and sets
 * the cookie; a present-but-wrong `?client=` clears it; a matching cookie is `client`; otherwise
 * `owner` only on loopback with no tunnel header; otherwise `refused`. */
export function roleOf(req: IncomingMessage, res: ServerResponse, project: string): Role {
  const token = process.env['WALKTHROUGH_CLIENT_TOKEN'] ?? ''
  const cookiePath = `/p/${project}/`
  if (token) {
    const url = new URL(req.url ?? '/', 'http://walkthrough.local')
    const own = url.searchParams.get('client')
    if (own !== null) {
      if (own === token) {
        res.setHeader('set-cookie', `${CLIENT_COOKIE}=${encodeURIComponent(token)}; Path=${cookiePath}; HttpOnly; SameSite=Lax`)
        return 'client'
      }
      res.setHeader('set-cookie', `${CLIENT_COOKIE}=; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=0`)
    }
    const cookie = readCookie(req, CLIENT_COOKIE)
    if (cookie !== undefined && cookie === token) return 'client'
  }
  return isLoopbackOwner(req) ? 'owner' : 'refused'
}

/** Seam C: `Authorization: Bearer <WALKTHROUGH_API_TOKEN>`. Refuses everything when unset. */
export function apiAuthorized(req: IncomingMessage): boolean {
  const token = process.env['WALKTHROUGH_API_TOKEN'] ?? ''
  if (!token) return false
  const header = req.headers.authorization ?? ''
  return header === `Bearer ${token}`
}

/** `?round=<n>` → the number, `null` when absent, `undefined` when present but not a positive int. */
export function roundParam(url: URL): number | null | undefined {
  const raw = url.searchParams.get('round')
  if (raw === null || raw === '') return null
  if (!/^\d+$/.test(raw)) return undefined
  const n = Number(raw)
  return n >= 1 ? n : undefined
}
