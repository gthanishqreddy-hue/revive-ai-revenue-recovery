// Recovery Cases API
// GET /api/cases → list all recovery cases with canonical summary metrics

import { NextResponse } from 'next/server'
import { query } from '@/lib/db/client'
import { DEMO_MERCHANT_ID } from '@/lib/db/seed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const merchantId = DEMO_MERCHANT_ID

    // Canonical metric counts directly from database
    const totalCasesQuery = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_cases WHERE merchant_id = ?`,
      [merchantId]
    )

    const recoveredQuery = await query<{ count: number; total_recovered: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(actual_recovery), 0) as total_recovered
       FROM recovery_cases
       WHERE merchant_id = ? AND status = 'recovered'`,
      [merchantId]
    )

    const inProgressQuery = await query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM recovery_cases
       WHERE merchant_id = ? AND status IN ('open', 'diagnosing', 'strategy_selected', 'executing', 'recovering')`,
      [merchantId]
    )

    const failedQuery = await query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM recovery_cases
       WHERE merchant_id = ? AND status IN ('failed', 'abandoned', 'no_action')`,
      [merchantId]
    )

    const total = Number(totalCasesQuery[0]?.count ?? 0)
    const recovered = Number(recoveredQuery[0]?.count ?? 0)
    const inProgress = Number(inProgressQuery[0]?.count ?? 0)
    const failed = Number(failedQuery[0]?.count ?? Math.max(0, total - recovered - inProgress))
    const totalRecovered = Number(recoveredQuery[0]?.total_recovered ?? 0)
    const recoveryRate = total > 0 ? Math.round((recovered / total) * 1000) / 10 : 0

    // Full case list joined with transaction and customer data
    const cases = await query<Record<string, unknown>>(
      `SELECT
         rc.id, rc.transaction_id, rc.status, rc.failure_category, rc.severity,
         rc.recoverability_score, rc.intent_score, rc.expected_recovery,
         rc.actual_recovery, rc.selected_strategy, rc.diagnosis_reason,
         rc.created_at, rc.updated_at,
         COALESCE(c.name, 'Unknown') as customer_name,
         COALESCE(c.email, '') as customer_email,
         t.amount as tx_amount, t.payment_method as tx_method,
         t.failure_code as tx_failure_code, t.failure_reason as tx_failure_reason
       FROM recovery_cases rc
       JOIN transactions t ON rc.transaction_id = t.id
       LEFT JOIN customers c ON rc.customer_id = c.id
       WHERE rc.merchant_id = ?
       ORDER BY rc.created_at DESC`,
      [merchantId]
    )

    return NextResponse.json(
      {
        summary: {
          total_cases: total,
          recovered_cases: recovered,
          in_progress_cases: inProgress,
          open_cases: inProgress,
          failed_cases: failed,
          total_recovered: totalRecovered,
          recovery_rate: recoveryRate,
        },
        cases,
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
