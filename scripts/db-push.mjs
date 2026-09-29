#!/usr/bin/env node
// walkthrough prototype: applies src/server/db/schema.sql to DATABASE_URL (idempotent — every
// statement is IF NOT EXISTS). Loads .env.local itself.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env.DATABASE_URL
if (!url) {
  console.error('db:push: DATABASE_URL is not set (expected in .env.local)')
  process.exit(2)
}

const sql = readFileSync(path.join(root, 'src', 'server', 'db', 'schema.sql'), 'utf8')
// same rewrite as src/server/db/pool.ts normaliseSslMode: pg 8.23 already treats `require` as
// `verify-full`; saying so explicitly silences its deprecation warning without changing behaviour.
const connectionString = url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, '$1sslmode=verify-full')
const client = new pg.Client({ connectionString })
try {
  await client.connect()
  await client.query(sql)
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  )
  console.log(`db:push: schema applied — tables: ${rows.map((r) => r.table_name).join(', ')}`)
} catch (err) {
  console.error(`db:push: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
} finally {
  await client.end()
}
