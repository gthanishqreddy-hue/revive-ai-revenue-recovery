// Simulation API — runs the full recovery demo
// POST /api/simulation → processes a batch of failed transactions through the recovery pipeline

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, execute } from '@/lib/db/client'
import { runRecoveryPipeline } from '@/lib/engine/orchestrator'
import { checkRateLimit } from '@/lib/rate-limit'
import { DEMO_MERCHANT_ID } from '@/lib/db/seed'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 60 // 60 second timeout for simulation

// ── Zod Schema for Simulation Request Validation ────────────────────────────

const SimulationRequestSchema = z.object({
  transactionId: z
    .string()
    .trim()
    .min(1, 'transactionId must not be empty')
    .max(128, 'transactionId exceeds maximum length of 128 characters')
    .optional(),
}).strict()

export async function POST(req: Request) {
  // ── RATE LIMITING ──────────────────────────────────────────────────────────
  // Protects simulation API against runaway execution loops.
  // PRODUCTION NOTE: Multi-instance deployments should use distributed Redis/Upstash token bucket.
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'localhost'
  const rateLimit = checkRateLimit(`sim_${clientIp}`, { limit: 60, windowMs: 60_000 })

  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please wait before triggering more simulations.',
        retryAfterMs: rateLimit.resetInMs,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rateLimit.resetInMs / 1000)),
        },
      }
    )
  }

  // ── INPUT VALIDATION ───────────────────────────────────────────────────────
  let rawBody: unknown = {}
  try {
    const text = await req.text()
    if (text && text.trim().length > 0) {
      rawBody = JSON.parse(text)
    }
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload in request body' },
      { status: 400 }
    )
  }

  const parsed = SimulationRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    const details = parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join(', ')
    return NextResponse.json(
      {
        error: 'Invalid simulation payload',
        details,
      },
      { status: 400 }
    )
  }

  try {
    const singleTx = parsed.data.transactionId
    const merchantId = DEMO_MERCHANT_ID

    if (singleTx) {
      // Single transaction recovery — used by demo command center
      const result = await runRecoveryPipeline(singleTx, merchantId, true)
      return NextResponse.json({ success: true, result })
    }

    // Full batch simulation — process up to 50 pending cases
    const pendingCases = await query<{ id: string; transaction_id: string }>(
      `SELECT rc.id, rc.transaction_id FROM recovery_cases rc
       WHERE rc.merchant_id = ? AND rc.status IN ('open', 'diagnosing', 'strategy_selected')
       LIMIT 50`,
      [merchantId]
    )

    if (pendingCases.length === 0) {
      // Reset a subset of failed cases to re-simulate
      const resetable = await query<{ id: string }>(
        `SELECT id FROM recovery_cases
         WHERE merchant_id = ? AND status = 'failed'
         LIMIT 30`,
        [merchantId]
      )
      for (const c of resetable) {
        await execute(
          `UPDATE recovery_cases SET status = 'open', actual_recovery = NULL, resolved_at = NULL,
           selected_strategy = NULL, updated_at = ? WHERE id = ?`,
          [new Date().toISOString(), c.id]
        )
      }
    }

    // Re-fetch after potential reset
    const toProcess = await query<{ id: string; transaction_id: string }>(
      `SELECT rc.id, rc.transaction_id FROM recovery_cases rc
       WHERE rc.merchant_id = ? AND rc.status IN ('open', 'diagnosing', 'strategy_selected')
       LIMIT 50`,
      [merchantId]
    )

    const results: { caseId: string; action: string; recovered: boolean; amount: number }[] = []
    let totalRecovered = 0
    let successCount = 0

    for (const c of toProcess) {
      try {
        const result = await runRecoveryPipeline(c.transaction_id, merchantId)
        results.push({
          caseId: result.caseId,
          action: result.action,
          recovered: result.recovered,
          amount: result.amountRecovered,
        })
        if (result.recovered) {
          successCount++
          totalRecovered += result.amountRecovered
        }
      } catch (err) {
        console.error(`[sim] Failed to process case ${c.id}:`, err)
      }
    }

    // Log simulation run
    await execute(
      `INSERT INTO audit_logs (id, merchant_id, actor, event, details, severity)
       VALUES (?, ?, 'system', 'Simulation completed', ?, 'info')`,
      [
        uuidv4(), merchantId,
        JSON.stringify({
          processed: toProcess.length,
          recovered: successCount,
          total_recovered: totalRecovered,
        }),
      ]
    )

    return NextResponse.json({
      success: true,
      summary: {
        processed: toProcess.length,
        recovered: successCount,
        failed: toProcess.length - successCount,
        total_recovered: totalRecovered,
        recovery_rate: toProcess.length > 0
          ? Math.round((successCount / toProcess.length) * 100)
          : 0,
      },
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[simulation] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
