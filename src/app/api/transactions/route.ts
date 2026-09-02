// Transactions API — at-risk transactions table
// GET /api/transactions → list failed transactions with recovery context

import { NextResponse } from 'next/server'
import { query } from '@/lib/db/client'
import { DEMO_MERCHANT_ID } from '@/lib/db/seed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const merchantId = DEMO_MERCHANT_ID

    const rows = await query<{
      tx_id: string; tx_amount: number; tx_method: string; tx_status: string;
      tx_failure_code: string; tx_failure_reason: string; tx_created_at: string;
      customer_name: string; customer_email: string;
      case_id: string; case_status: string; failure_category: string;
      severity: string; recoverability_score: number; intent_score: number;
      expected_recovery: number; actual_recovery: number; selected_strategy: string;
      diagnosis_reason: string; case_updated_at: string;
    }>(
      `SELECT
         t.id as tx_id, t.amount as tx_amount, t.payment_method as tx_method,
         t.status as tx_status, t.failure_code as tx_failure_code,
         t.failure_reason as tx_failure_reason, t.created_at as tx_created_at,
         COALESCE(c.name, 'Unknown') as customer_name,
         COALESCE(c.email, '') as customer_email,
         rc.id as case_id, rc.status as case_status,
         rc.failure_category, rc.severity, rc.recoverability_score,
         rc.intent_score, rc.expected_recovery, rc.actual_recovery,
         rc.selected_strategy, rc.diagnosis_reason, rc.updated_at as case_updated_at
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN recovery_cases rc ON t.id = rc.transaction_id
       WHERE t.merchant_id = ? AND t.status = 'failed'
       ORDER BY t.created_at DESC`,
      [merchantId]
    )

    return NextResponse.json(
      { transactions: rows },
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
