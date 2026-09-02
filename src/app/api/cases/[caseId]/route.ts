// Recovery Case Detail API
// GET /api/cases/[caseId] → full timeline for a specific recovery case

import { NextResponse } from 'next/server'
import { query } from '@/lib/db/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params

    // Case details
    const cases = await query<Record<string, unknown>>(
      `SELECT rc.*, t.amount, t.payment_method, t.failure_code, t.failure_reason,
       t.created_at as tx_created_at, c.name as customer_name, c.email as customer_email,
       c.phone as customer_phone, c.total_payments, c.successful_payments
       FROM recovery_cases rc
       JOIN transactions t ON rc.transaction_id = t.id
       LEFT JOIN customers c ON rc.customer_id = c.id
       WHERE rc.id = ?`,
      [caseId]
    )

    if (!cases[0]) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // Agent decisions
    const decisions = await query<Record<string, unknown>>(
      `SELECT * FROM agent_decisions WHERE case_id = ? ORDER BY created_at ASC`,
      [caseId]
    )

    // Recovery attempts
    const attempts = await query<Record<string, unknown>>(
      `SELECT ra.*, act.action_type, act.payload, act.response, act.executed_at
       FROM recovery_attempts ra
       LEFT JOIN recovery_actions act ON ra.id = act.attempt_id
       WHERE ra.case_id = ?
       ORDER BY ra.attempt_number ASC`,
      [caseId]
    )

    // Agent runs (pipeline stages)
    const runs = await query<Record<string, unknown>>(
      `SELECT * FROM agent_runs WHERE case_id = ? ORDER BY created_at ASC`,
      [caseId]
    )

    // Customer features
    const features = cases[0].customer_id
      ? await query<Record<string, unknown>>(
          `SELECT * FROM customer_features WHERE customer_id = ?`,
          [cases[0].customer_id as string]
        )
      : []

    return NextResponse.json(
      {
        case: cases[0],
        decisions,
        attempts,
        runs,
        features: features[0] ?? null,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    )
  }
}
