// Dashboard metrics API
// GET /api/dashboard → canonical aggregated metrics for Dashboard and Analytics

import { NextResponse } from 'next/server'
import { query } from '@/lib/db/client'
import { DEMO_MERCHANT_ID } from '@/lib/db/seed'

export async function GET() {
  try {
    const merchantId = DEMO_MERCHANT_ID

    // Revenue at risk — sum of failed transaction amounts
    const atRisk = await query<{ total: number }>(
      `SELECT COALESCE(SUM(t.amount), 0) as total
       FROM transactions t
       WHERE t.merchant_id = ? AND t.status = 'failed'`,
      [merchantId]
    )

    // Recoverable — cases with recoverability > 0.3
    const recoverable = await query<{ total: number }>(
      `SELECT COALESCE(SUM(t.amount), 0) as total
       FROM recovery_cases rc
       JOIN transactions t ON rc.transaction_id = t.id
       WHERE rc.merchant_id = ? AND rc.recoverability_score > 0.3
       AND rc.status NOT IN ('recovered', 'abandoned', 'no_action')`,
      [merchantId]
    )

    // Recovered cases count & total recovered amount
    const recovered = await query<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(actual_recovery), 0) as total, COUNT(*) as count
       FROM recovery_cases
       WHERE merchant_id = ? AND status = 'recovered'`,
      [merchantId]
    )

    // Total recovery cases count
    const totalCasesQuery = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_cases WHERE merchant_id = ?`,
      [merchantId]
    )

    // Open / in-progress cases count
    const openCases = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_cases
       WHERE merchant_id = ? AND status IN ('open', 'diagnosing', 'strategy_selected', 'executing', 'recovering')`,
      [merchantId]
    )

    // Failed / abandoned cases count
    const failedCases = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_cases
       WHERE merchant_id = ? AND status IN ('failed', 'abandoned', 'no_action')`,
      [merchantId]
    )

    // Actions executed count
    const actionsExecuted = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_attempts ra
       JOIN recovery_cases rc ON ra.case_id = rc.id
       WHERE rc.merchant_id = ?`,
      [merchantId]
    )

    // Recovery rate by payment method
    const byMethod = await query<{
      payment_method: string; total: number; recovered: number; recovered_amount: number
    }>(
      `SELECT t.payment_method,
       COUNT(*) as total,
       SUM(CASE WHEN rc.status = 'recovered' THEN 1 ELSE 0 END) as recovered,
       COALESCE(SUM(rc.actual_recovery), 0) as recovered_amount
       FROM recovery_cases rc
       JOIN transactions t ON rc.transaction_id = t.id
       WHERE rc.merchant_id = ?
       GROUP BY t.payment_method`,
      [merchantId]
    )

    // Recovery by failure category
    const byCategory = await query<{
      failure_category: string; total: number; recovered: number
    }>(
      `SELECT failure_category, COUNT(*) as total,
       SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) as recovered
       FROM recovery_cases
       WHERE merchant_id = ? AND failure_category IS NOT NULL
       GROUP BY failure_category
       ORDER BY total DESC LIMIT 6`,
      [merchantId]
    )

    // Recovery by action
    const byAction = await query<{
      strategy: string; total: number; successful: number; recovered_amount: number
    }>(
      `SELECT ra.strategy, COUNT(*) as total,
       SUM(CASE WHEN ra.status = 'success' THEN 1 ELSE 0 END) as successful,
       COALESCE(SUM(ra.amount_recovered), 0) as recovered_amount
       FROM recovery_attempts ra
       JOIN recovery_cases rc ON ra.case_id = rc.id
       WHERE rc.merchant_id = ?
       GROUP BY ra.strategy`,
      [merchantId]
    )

    // Recent agent activity (last 20 events)
    const activity = await query<{
      id: string; actor: string; event: string; severity: string; created_at: string
    }>(
      `SELECT id, actor, event, severity, created_at
       FROM audit_logs
       WHERE merchant_id = ?
       ORDER BY created_at DESC LIMIT 20`,
      [merchantId]
    )

    const totalAtRisk = atRisk[0]?.total ?? 0
    const totalRecoverable = recoverable[0]?.total ?? 0
    const totalRecovered = recovered[0]?.total ?? 0
    const recoveredCount = recovered[0]?.count ?? 0
    const totalCases = totalCasesQuery[0]?.count ?? 0
    const openCount = openCases[0]?.count ?? 0
    const failedCount = failedCases[0]?.count ?? Math.max(0, totalCases - recoveredCount - openCount)

    return NextResponse.json({
      metrics: {
        revenue_at_risk: totalAtRisk,
        recoverable: totalRecoverable,
        recovered: totalRecovered,
        recovery_rate: totalCases > 0 ? Math.round((recoveredCount / totalCases) * 1000) / 10 : 0,
        recovered_cases: recoveredCount,
        open_cases: openCount,
        in_progress_cases: openCount,
        failed_cases: failedCount,
        total_cases: totalCases,
        actions_executed: actionsExecuted[0]?.count ?? 0,
      },
      by_method: byMethod.map((m) => ({
        method: m.payment_method,
        total_cases: m.total,
        recovered_cases: m.recovered,
        recovered_amount: m.recovered_amount,
        recovery_rate: m.total > 0 ? Math.round((m.recovered / m.total) * 100) : 0,
      })),
      by_category: byCategory,
      by_action: byAction.map((a) => ({
        action: a.strategy,
        total_attempts: a.total,
        successful: a.successful,
        success_rate: a.total > 0 ? Math.round((a.successful / a.total) * 100) : 0,
        recovered_amount: a.recovered_amount,
      })),
      activity,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
