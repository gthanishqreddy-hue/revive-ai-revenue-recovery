// Database initialization API — called once on startup
// GET /api/init → initializes DB schema and seeds demo data

import { NextResponse } from 'next/server'
import { initDatabase, query } from '@/lib/db/client'
import { seedDemoData } from '@/lib/db/seed'

export async function GET() {
  try {
    await initDatabase()
    // Check if already seeded by looking for merchant table
    const merchants = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM merchants"
    ).catch(() => [{ count: 0 }])
    
    if ((merchants[0]?.count ?? 0) === 0) {
      await seedDemoData()
    }
    return NextResponse.json({ ok: true, message: 'Database ready' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[init] Database initialization failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
