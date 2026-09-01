// Dashboard metrics API
// GET /api/dashboard → aggregated metrics for the main dashboard

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

    // Recovered
    const recovered = await query<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(actual_recovery), 0) as total, COUNT(*) as count
       FROM recovery_cases
       WHERE merchant_id = ? AND status = 'recovered'`,
      [merchantId]
    )

    // Total at-risk count
    const totalFailed = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_cases WHERE merchant_id = ?`,
      [merchantId]
    )

    // Actions executed
    const actionsExecuted = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_attempts ra
       JOIN recovery_cases rc ON ra.case_id = rc.id
       WHERE rc.merchant_id = ?`,
      [merchantId]
    )

    // Open cases
    const openCases = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM recovery_cases
       WHERE merchant_id = ? AND status NOT IN ('recovered', 'failed', 'abandoned', 'no_action')`,
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
    const totalCases = totalFailed[0]?.count ?? 0

    return NextResponse.json({
      metrics: {
        revenue_at_risk: totalAtRisk,
        recoverable: totalRecoverable,
        recovered: totalRecovered,
        recovery_rate: totalCases > 0 ? Math.round((recoveredCount / totalCases) * 1000) / 10 : 0,
        actions_executed: actionsExecuted[0]?.count ?? 0,
        open_cases: openCases[0]?.count ?? 0,
        total_cases: totalCases,
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
