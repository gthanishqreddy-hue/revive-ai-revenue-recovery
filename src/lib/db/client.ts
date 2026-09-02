// Database client using @neondatabase/serverless for Vercel/Neon PostgreSQL
// Production-ready: serverless-compatible, connection pooling built-in
//
// MIGRATION NOTE: This client auto-translates SQLite-style `?` placeholders
// to PostgreSQL `$1, $2, ...` so that consumer code requires zero changes.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import path from 'path'
import fs from 'fs'

let _sql: NeonQueryFunction<false, false> | null = null

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL environment variable is required. ' +
        'Set it to your Neon PostgreSQL connection string (e.g. postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require)'
      )
    }
    _sql = neon(databaseUrl)
  }
  return _sql
}

// Auto-translate SQLite `?` placeholders to PostgreSQL `$1, $2, ...`
// This allows all existing query code to work without modification.
function translatePlaceholders(sql: string): string {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

// Type-safe query helper — returns rows as typed objects
export async function query<T = Record<string, unknown>>(
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<T[]> {
  const sql_ = getSql()
  const pgSql = translatePlaceholders(sql)
  const rows = await sql_.query(pgSql, args)
  return rows as T[]
}

// Execute a write statement, return affected rows count
export async function execute(
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<{ rowsAffected: number }> {
  const sql_ = getSql()
  const pgSql = translatePlaceholders(sql)
  const result = await sql_.query(pgSql, args)
  return {
    rowsAffected: Array.isArray(result) ? result.length : 0,
  }
}

// Execute multiple statements in sequence (used for schema init)
export async function executeBatch(statements: string[]): Promise<void> {
  const sql_ = getSql()
  for (const stmt of statements) {
    const cleaned = stmt.trim()
    if (!cleaned) continue
    await sql_.query(cleaned)
  }
}

// Initialize database — run PG schema if tables don't exist
export async function initDatabase(): Promise<void> {
  // Try schema.pg.sql first, fall back to schema.sql
  let schemaPath = path.join(process.cwd(), 'database', 'schema.pg.sql')
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), 'database', 'schema.sql')
  }
  if (!fs.existsSync(schemaPath)) {
    throw new Error('Database schema file not found in database/ directory')
  }
  const schema = fs.readFileSync(schemaPath, 'utf-8')

  const sql_ = getSql()

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

    // Skip blank or pragma-only statements (PRAGMAs are SQLite-only)
    if (!cleaned || cleaned.toUpperCase().startsWith('PRAGMA')) continue

    try {
      await sql_.query(cleaned)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Ignore "already exists" errors (CREATE IF NOT EXISTS handles this,
      // but some edge cases may still throw)
      if (msg.includes('already exists')) continue
      console.error('[init] Schema error on statement:', cleaned.slice(0, 120))
      throw err
    }
  }
}
