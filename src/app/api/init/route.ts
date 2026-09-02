// Database initialization API — called on startup or on demand
// GET /api/init → initializes DB schema and seeds demo data idempotently

import { NextResponse } from 'next/server'
import { initDatabase } from '@/lib/db/client'
import { seedDemoData, ensureCanonicalDemoData } from '@/lib/db/seed'

export async function GET() {
  try {
    await initDatabase()
    await ensureCanonicalDemoData()
    await seedDemoData()

    return NextResponse.json({ ok: true, message: 'Database ready' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[init] Database initialization failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
