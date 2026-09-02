// Activity feed API
// GET /api/activity → recent agent runs and audit log events

import { NextResponse } from 'next/server'
import { query } from '@/lib/db/client'
import { DEMO_MERCHANT_ID } from '@/lib/db/seed'

export async function GET() {
  try {
    const activity = await query<Record<string, unknown>>(
      `SELECT al.id, al.actor, al.event, al.entity_type, al.entity_id,
       al.details, al.severity, al.created_at
       FROM audit_logs al
       WHERE al.merchant_id = ?
       ORDER BY al.created_at DESC LIMIT 50`,
      [DEMO_MERCHANT_ID]
    )

    const agentRuns = await query<Record<string, unknown>>(
      `SELECT ar.id, ar.case_id, ar.stage, ar.status, ar.duration_ms, ar.created_at,
       rc.transaction_id,
       COALESCE(SUM(rc2.actual_recovery), 0) as amount_recovered
       FROM agent_runs ar
       JOIN recovery_cases rc ON ar.case_id = rc.id
       LEFT JOIN recovery_cases rc2 ON rc2.id = ar.case_id AND rc2.status = 'recovered'
       WHERE rc.merchant_id = ?
       GROUP BY ar.id, rc.transaction_id
       ORDER BY ar.created_at DESC LIMIT 30`,
      [DEMO_MERCHANT_ID]
    )

    return NextResponse.json({ activity, agent_runs: agentRuns })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
