// walkthrough prototype: the one Postgres pool (Neon dev branch, `DATABASE_URL` from .env.local).
import pg from 'pg'

let pool: pg.Pool | undefined

/** pg 8.23 warns that `sslmode=require` is currently treated as `verify-full`; say so explicitly so
 * the behaviour is the same and the warning does not bury the server's own output. */
export function normaliseSslMode(url: string): string {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, '$1sslmode=verify-full')
}

export function getPool(): pg.Pool {
  if (pool) return pool
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('walkthrough: DATABASE_URL is not set (expected in .env.local)')
  pool = new pg.Pool({ connectionString: normaliseSslMode(url), max: 12, idleTimeoutMillis: 30_000 })
  pool.on('error', (err) => {
    // an idle client dropped by Neon — the pool replaces it on the next checkout
    console.warn(`walkthrough: pg idle client error: ${err.message}`)
  })
  return pool
}

export type Db = pg.Pool | pg.PoolClient

/** Runs `fn` inside one transaction on a dedicated client. */
export async function inTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return
  const p = pool
  pool = undefined
  await p.end()
}
