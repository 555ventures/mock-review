import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

type Portfile = { url: string; pid: number }

/**
 * D8: `check.serve.url` — the portfile's url when `GET <url>/__mock-review/ping` answers 200
 * within 500 ms, else `null`. Any thrown error (a dead port's fetch `TypeError`, a missing or
 * unparsable portfile) counts as dead.
 */
export async function serveUrl(cwd: string): Promise<string | null> {
  const portfilePath = path.join(cwd, 'design', '.serve.json')
  if (!existsSync(portfilePath)) return null

  let portfile: Portfile
  try {
    portfile = JSON.parse(readFileSync(portfilePath, 'utf8')) as Portfile
  } catch {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 500)
  try {
    const res = await fetch(`${portfile.url}/__mock-review/ping`, { signal: controller.signal })
    return res.status === 200 ? portfile.url : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
