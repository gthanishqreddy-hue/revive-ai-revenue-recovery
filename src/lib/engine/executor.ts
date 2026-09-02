// ACTION EXECUTOR
// The controlled tool interface — the only way actions reach the payment provider
//
// ARCHITECTURE CRITICAL: All actions pass through this single function.
// Every action is logged. Idempotency prevents double-execution.
// The executor is the firewall between the AI decision engine and real money movement.
//
// WHY: A single execution boundary means a single place to add logging,
// rate limiting, idempotency checks, and circuit breakers.

import { v4 as uuidv4 } from 'uuid'
import type { RecoveryAction, AttemptStatus } from '../types'
import { query, execute } from '../db/client'
import { getPaymentProvider } from '../payment'
import { makeIdempotencyKey } from '../utils'

export interface ExecutionInput {
  transactionId: string
  attemptId: string
  caseId: string
  action: RecoveryAction
  attemptNumber: number
  merchantId: string
  amount: number // paise
  customerId?: string
  customerEmail?: string
  customerPhone?: string
  reason: string // Why this action was chosen (for audit log)
}

export interface ExecutionResult {
  success: boolean
  status: AttemptStatus
  resultCode: string
  resultMessage: string
  amountRecovered?: number
  externalReference?: string
}

export async function executeRecoveryAction(input: ExecutionInput): Promise<ExecutionResult> {
  const idempotencyKey = makeIdempotencyKey(input.caseId, input.transactionId, input.action, input.attemptNumber)

  // ---- IDEMPOTENCY CHECK ----
  // If this exact action has already been executed, return the cached result
  // This prevents double-charging if webhooks arrive twice or network retries occur
  const existing = await query<{
    id: string; status: string; response?: string
  }>(
    'SELECT id, status, response FROM recovery_actions WHERE idempotency_key = ?',
    [idempotencyKey]
  )

  if (existing.length > 0 && existing[0].status !== 'pending') {
    console.log(`[executor] Idempotency hit: action already executed with key ${idempotencyKey}`)
    let parsed: Record<string, unknown> = {}
    try {
      if (existing[0].response) parsed = JSON.parse(existing[0].response)
    } catch {}
    return {
      success: existing[0].status === 'success',
      status: existing[0].status as AttemptStatus,
      resultCode: (parsed.resultCode as string) ?? 'IDEMPOTENT_HIT',
      resultMessage: `[IDEMPOTENT] ${(parsed.resultMessage as string) ?? 'Action previously executed'}`,
    }
  }

  // ---- LOG ACTION START ----
  const actionId = uuidv4()
  await execute(
    `INSERT INTO recovery_actions (id, attempt_id, action_type, payload, status, idempotency_key)
     VALUES (?, ?, ?, ?, 'pending', ?)
     ON CONFLICT DO NOTHING`,
    [actionId, input.attemptId, input.action, JSON.stringify({ reason: input.reason }), idempotencyKey]
  )

  // ---- AUDIT LOG ----
  await execute(
    `INSERT INTO audit_logs (id, merchant_id, actor, event, entity_type, entity_id, details, severity)
     VALUES (?, ?, 'agent', ?, 'recovery_action', ?, ?, 'info')`,
    [
      uuidv4(), input.merchantId,
      `Recovery action initiated: ${input.action}`,
      actionId,
      JSON.stringify({ action: input.action, amount: input.amount, reason: input.reason }),
    ]
  )

  // ---- EXECUTE VIA PROVIDER ----
  let result: ExecutionResult
  try {
    const provider = getPaymentProvider()
    result = await provider.executeAction(input)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown execution error'
    result = {
      success: false,
      status: 'failed',
      resultCode: 'EXECUTION_ERROR',
      resultMessage: errorMsg,
    }
  }

  // ---- UPDATE ACTION RECORD ----
  await execute(
    `UPDATE recovery_actions SET status = ?, response = ?, executed_at = ? WHERE id = ?`,
    [result.status, JSON.stringify(result), new Date().toISOString(), actionId]
  )

  // ---- AUDIT LOG RESULT ----
  await execute(
    `INSERT INTO audit_logs (id, merchant_id, actor, event, entity_type, entity_id, details, severity)
     VALUES (?, ?, 'agent', ?, 'recovery_action', ?, ?, ?)`,
    [
      uuidv4(), input.merchantId,
      `Recovery action ${result.success ? 'succeeded' : 'failed'}: ${input.action}`,
      actionId,
      JSON.stringify(result),
      result.success ? 'info' : 'warning',
    ]
  )

  return result
}
