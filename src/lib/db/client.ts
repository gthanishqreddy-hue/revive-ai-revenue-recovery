// Database client using @libsql/client (pure JS — no native build tools needed)
// Production upgrade path: change LIBSQL_URL to a Turso remote URL
// Full PostgreSQL/Supabase migration path: replace this client with pg driver

import { createClient, type Client, type ResultSet } from '@libsql/client'
import path from 'path'
import fs from 'fs'
import os from 'os'

let _client: Client | null = null

function getDbPath(): string {
  // Store DB in temp dir to avoid Turbopack watching the database files
  // In production: use DATABASE_URL env var for Turso/Postgres connection
  const dbDir = process.env.DATABASE_DIR
    ? process.env.DATABASE_DIR
    : path.join(os.tmpdir(), 'revive')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, 'revive.db')
}

export function getDb(): Client {
  if (!_client) {
    const dbPath = getDbPath()
    _client = createClient({
      url: `file:${dbPath}`,
    })
  }
  return _client
}

// Type-safe query helper — returns rows as typed objects
export async function query<T = Record<string, unknown>>(
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<T[]> {
  const db = getDb()
  const result: ResultSet = await db.execute({ sql, args })
  return result.rows as T[]
}

// Execute a write statement, return last insert rowid or changes count
export async function execute(
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<{ rowsAffected: number; lastInsertRowid?: number | bigint }> {
  const db = getDb()
  const result = await db.execute({ sql, args })
  return {
    rowsAffected: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid,
  }
}

// Execute multiple statements in a batch (used for schema init)
export async function executeBatch(statements: string[]): Promise<void> {
  const db = getDb()
  await db.batch(
    statements.map((sql) => ({ sql, args: [] })),
    'write'
  )
}

// Initialize database — run schema if tables don't exist
export async function initDatabase(): Promise<void> {
  const schemaPath = path.join(process.cwd(), 'database', 'schema.sql')
  if (!fs.existsSync(schemaPath)) {
    throw new Error('Database schema file not found at database/schema.sql')
  }
  const schema = fs.readFileSync(schemaPath, 'utf-8')

  const db = getDb()

  // Run PRAGMA first
  await db.execute('PRAGMA journal_mode=WAL')
  await db.execute('PRAGMA foreign_keys=ON')

  // Parse SQL statements by splitting on semicolons,
  // then cleaning up comments and blank lines
  const rawStatements = schema.split(';')

  for (const raw of rawStatements) {
    // Remove inline -- comments from each line
    const cleaned = raw
      .split('\n')
      .map(line => {
        const commentIdx = line.indexOf('--')
        return commentIdx >= 0 ? line.slice(0, commentIdx) : line
      })
      .join('\n')
      .trim()

    // Skip blank or pragma-only statements
    if (!cleaned || cleaned.toUpperCase().startsWith('PRAGMA')) continue

    try {
      await db.execute(cleaned)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Ignore "already exists" errors (CREATE IF NOT EXISTS is supposed to handle this,
      // but older SQLite versions may still throw on some index variants)
      if (msg.includes('already exists')) continue
      console.error('[init] Schema error on statement:', cleaned.slice(0, 120))
      throw err
    }
  }
}

