// MAIN RECOVERY ORCHESTRATOR
// The central pipeline that coordinates all engine modules for a single case
//
// Flow: Event → Diagnosis → Intent → Strategy → Policy → Execute → Outcome → Learn
//
// WHY: A single orchestrator function makes the pipeline auditable, testable,
// and easy to trace. Each step produces structured output that is persisted
// in the database before proceeding.

import { v4 as uuidv4 } from 'uuid'
import { query, execute } from '../db/client'
import { diagnoseTransaction } from './diagnosis'
import { calculateCustomerIntent } from './intent'
import { selectRecoveryStrategy } from './strategy'
import { validateAgainstPolicy, findFallbackAction } from './policy-guard'
import { executeRecoveryAction } from './executor'
import { evaluateStrategyWithAI } from '../ai'
import type { RecoveryAIContext } from '../ai/types'
import { makeIdempotencyKey } from '../utils'
import type {
  Transaction,
  Customer,
  CustomerFeatures,
  Policy,
  RecoveryAttempt,
  RecoveryCase,
  RecoveryAction,
  PaymentMethod,
} from '../types'

export interface OrchestratorResult {
  caseId: string
  action: RecoveryAction
  success: boolean
  recovered: boolean
  amountRecovered: number
  reasoning: string[]
  stages: PipelineStage[]
  modelUsed?: string
  aiUsed?: boolean
  error?: string
}

export interface PipelineStage {
  name: string
  status: 'completed' | 'failed' | 'skipped'
  durationMs: number
  summary: string
  timestamp: string
}

export async function runRecoveryPipeline(
  transactionId: string,
  merchantId: string,
  forceNew = false
): Promise<OrchestratorResult> {
  const stages: PipelineStage[] = []
  const pipelineStart = Date.now()

  // ---- STAGE 0: Load data ----
  const stageStart = Date.now()
  const [txRows, policyRows] = await Promise.all([
    query<Transaction>('SELECT * FROM transactions WHERE id = ? AND merchant_id = ?', [transactionId, merchantId]),
    query<{ id: string; merchant_id: string; max_retries: number; min_retry_interval_mins: number;
            max_notifications_per_day: number; min_recovery_amount_paise: number; allowed_channels: string;
            human_approval_threshold: number; max_recovery_cost_paise: number; auto_abandon_after_hours: number;
            updated_at: string }>(
      'SELECT * FROM policies WHERE merchant_id = ?', [merchantId]
    ),
  ])

  const transaction = txRows[0]
  if (!transaction) throw new Error(`Transaction ${transactionId} not found`)

  const rawPolicy = policyRows[0]
  const policy: Policy | null = rawPolicy
    ? { ...rawPolicy, allowed_channels: JSON.parse(rawPolicy.allowed_channels) as RecoveryAction[], is_demo: false } as unknown as Policy
    : null

  if (!policy) throw new Error(`No policy found for merchant ${merchantId}`)

  // Load customer
  const customerRows = transaction.customer_id
    ? await query<Customer>('SELECT * FROM customers WHERE id = ?', [transaction.customer_id])
    : []
  const customer = customerRows[0] ?? null

  // Load customer features
  const featureRows = customer
    ? await query<CustomerFeatures>('SELECT * FROM customer_features WHERE customer_id = ?', [customer.id])
    : []
  const features = featureRows[0] ?? null

  // Find or create recovery case
  let caseId: string
  let existingCase = await query<RecoveryCase>(
    'SELECT * FROM recovery_cases WHERE transaction_id = ? AND merchant_id = ?',
    [transactionId, merchantId]
  )

  if (existingCase.length === 0 || forceNew) {
    caseId = uuidv4()
    await execute(
      `INSERT INTO recovery_cases (id, merchant_id, transaction_id, customer_id, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [caseId, merchantId, transactionId, customer?.id ?? null]
    )
    existingCase = [{ id: caseId, status: 'open' } as RecoveryCase]
  } else {
    caseId = existingCase[0].id
    // If already recovered, don't re-process
    if (existingCase[0].status === 'recovered' && !forceNew) {
      return {
        caseId, action: 'NO_ACTION', success: false, recovered: true,
        amountRecovered: existingCase[0].actual_recovery ?? 0,
        reasoning: ['Case already recovered'], stages: [],
      }
    }
  }

  stages.push({
    name: 'Data Loading',
    status: 'completed',
    durationMs: Date.now() - stageStart,
    summary: `Loaded transaction, customer, and policy data`,
    timestamp: new Date().toISOString(),
  })

  // ---- STAGE 1: DIAGNOSIS ----
  const diagStart = Date.now()
  await updateCaseStatus(caseId, 'diagnosing')

  const diagnosis = diagnoseTransaction(transaction, customer, features)

  await execute(
    `UPDATE recovery_cases SET failure_category = ?, severity = ?, recoverability_score = ?,
     diagnosis_reason = ?, updated_at = ? WHERE id = ?`,
    [diagnosis.failure_category, diagnosis.severity, diagnosis.recoverability,
     diagnosis.reason, new Date().toISOString(), caseId]
  )

  // Log agent run
  await logAgentRun(caseId, 'diagnosis', 'completed', Date.now() - diagStart)

  // Log agent decision — diagnosis stage
  await execute(
    `INSERT INTO agent_decisions (id, case_id, agent_type, input_summary, decision, confidence, reasoning, model_used, latency_ms)
     VALUES (?, ?, 'diagnosis', ?, ?, ?, ?, 'deterministic-fallback', ?)`,
    [
      uuidv4(), caseId,
      JSON.stringify({ failure_code: transaction.failure_code, payment_method: transaction.payment_method }),
      JSON.stringify({ failure_category: diagnosis.failure_category, severity: diagnosis.severity,
                       recoverability: diagnosis.recoverability, is_permanent: diagnosis.is_permanent }),
      diagnosis.recoverability, // confidence = recoverability score
      diagnosis.reason,
      Date.now() - diagStart,
    ]
  )

  stages.push({
    name: 'Transaction Diagnosis',
    status: 'completed',
    durationMs: Date.now() - diagStart,
    summary: `${diagnosis.failure_category} | Severity: ${diagnosis.severity} | Recoverability: ${Math.round(diagnosis.recoverability * 100)}%`,
    timestamp: new Date().toISOString(),
  })

  // ---- STAGE 2: CUSTOMER INTENT ----
  const intentStart = Date.now()
  const intent = calculateCustomerIntent({
    customer,
    features,
    transactionAmount: transaction.amount,
    failureCategory: diagnosis.failure_category,
  })

  await execute(
    `UPDATE recovery_cases SET intent_score = ?, updated_at = ? WHERE id = ?`,
    [intent.score / 100, new Date().toISOString(), caseId]
  )

  await logAgentRun(caseId, 'intent', 'completed', Date.now() - intentStart)

  // Log agent decision — intent stage
  await execute(
    `INSERT INTO agent_decisions (id, case_id, agent_type, input_summary, decision, confidence, reasoning, model_used, latency_ms)
     VALUES (?, ?, 'intent', ?, ?, ?, ?, 'deterministic-fallback', ?)`,
    [
      uuidv4(), caseId,
      JSON.stringify({ customer_id: customer?.id ?? null, failure_category: diagnosis.failure_category }),
      JSON.stringify({ score: intent.score, high_value: intent.high_value }),
      intent.confidence,
      intent.signals.map(s => `${s.signal}: ${s.value} (${s.positive ? '+' : '-'})`).join(' | '),
      Date.now() - intentStart,
    ]
  )

  stages.push({
    name: 'Customer Intent',
    status: 'completed',
    durationMs: Date.now() - intentStart,
    summary: `Intent score: ${intent.score}/100 | ${intent.high_value ? 'High-value customer' : 'Standard customer'}`,
    timestamp: new Date().toISOString(),
  })

  // ---- STAGE 3: STRATEGY SELECTION (AI-Assisted with Deterministic Safety Floor) ----
  const stratStart = Date.now()

  // Load previous attempts for this case only.
  // IMPORTANT: scoped to caseId (not all cases for the transaction) so that
  // forceNew pipeline re-runs start with a clean attempt count.
  // Policy retry limits apply per recovery engagement (case), not across all
  // historical pipeline executions for the same transaction.
  const previousAttempts = await query<RecoveryAttempt>(
    `SELECT * FROM recovery_attempts WHERE case_id = ? ORDER BY attempt_number ASC`,
    [caseId]
  )

  const deterministicStrategyResult = selectRecoveryStrategy({
    failureCategory: diagnosis.failure_category,
    paymentMethod: transaction.payment_method as 'upi' | 'card' | 'netbanking' | 'wallet',
    amount: transaction.amount,
    recoverability: diagnosis.recoverability,
    intentScore: intent.score,
    previousAttempts: previousAttempts.length,
    allowedActions: policy.allowed_channels,
    waitMinutes: diagnosis.recommended_wait_minutes,
  })

  // Build sanitized context for Gemini AI
  const aiContext: RecoveryAIContext = {
    transactionId: transaction.id,
    amountPaise: transaction.amount,
    currency: transaction.currency,
    paymentMethod: transaction.payment_method as PaymentMethod,
    failureCode: transaction.failure_code,
    failureCategory: diagnosis.failure_category,
    diagnosisReason: diagnosis.reason,
    recoverabilityScore: diagnosis.recoverability,
    isPermanentFailure: diagnosis.is_permanent,
    customerIntentScore: intent.score,
    customerIntentConfidence: intent.confidence,
    customerSignalsSummary: intent.signals.map(s => `${s.signal}: ${s.value}`),
    isHighValueCustomer: intent.high_value,
    customerTotalPayments: customer?.total_payments ?? 0,
    customerSuccessfulPayments: customer?.successful_payments ?? 0,
    previousAttemptsCount: previousAttempts.length,
    previousStrategies: previousAttempts.map(a => a.strategy),
    candidateStrategies: [deterministicStrategyResult.selected, ...deterministicStrategyResult.alternatives].map(s => ({
      action: s.action,
      probabilityOfSuccess: s.probability_of_success,
      actionCostPaise: s.action_cost_paise,
      customerFrictionPenalty: s.customer_friction_penalty,
      expectedRecoveryValuePaise: s.expected_recovery_value,
      reasoning: s.reasoning,
    })),
    policyMaxRetries: policy.max_retries,
    policyAllowedChannels: policy.allowed_channels,
  }

  // Evaluate strategy with Gemini AI (with deterministic fallback and financial safety checks)
  const hybridResult = await evaluateStrategyWithAI(aiContext, deterministicStrategyResult, policy.allowed_channels)

  const selectedStrategy = hybridResult.selected
  const expectedRecovery = selectedStrategy.expected_recovery_value

  await execute(
    `UPDATE recovery_cases SET selected_strategy = ?, expected_recovery = ?, status = 'strategy_selected', updated_at = ?
     WHERE id = ?`,
    [selectedStrategy.action, expectedRecovery, new Date().toISOString(), caseId]
  )

  // Log AI decision with true model name (e.g. gemini-2.5-flash or deterministic-fallback)
  await execute(
    `INSERT INTO agent_decisions (id, case_id, agent_type, input_summary, decision, confidence, reasoning, model_used, latency_ms)
     VALUES (?, ?, 'strategy', ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(), caseId,
      JSON.stringify({
        failure_category: diagnosis.failure_category,
        amount: transaction.amount,
        ai_used: hybridResult.ai_used,
        fallback_reason: hybridResult.fallback_reason,
      }),
      JSON.stringify({ action: selectedStrategy.action, erv: expectedRecovery, ai_decision: hybridResult.ai_decision }),
      hybridResult.confidence,
      selectedStrategy.reasoning.join('\n'),
      hybridResult.model_used,
      hybridResult.latency_ms || (Date.now() - stratStart),
    ]
  )

  await logAgentRun(caseId, 'strategy', 'completed', Date.now() - stratStart)

  const modelTag = hybridResult.ai_used ? ` [AI: ${hybridResult.model_used}]` : ` [Deterministic]`
  stages.push({
    name: 'Strategy Selection',
    status: 'completed',
    durationMs: Date.now() - stratStart,
    summary: `Selected: ${selectedStrategy.action} | ERV: ₹${Math.floor(expectedRecovery / 100)}${modelTag}`,
    timestamp: new Date().toISOString(),
  })

  // ---- STAGE 4: POLICY GUARD ----
  const policyStart = Date.now()

  const notificationsToday = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM recovery_attempts ra
     JOIN recovery_cases rc ON ra.case_id = rc.id
     WHERE rc.merchant_id = ? AND ra.started_at > NOW() - INTERVAL '1 day'
     AND ra.strategy IN ('SEND_WHATSAPP','SEND_EMAIL','VOICE_CALL','GENERATE_PAYMENT_LINK')`,
    [merchantId]
  )

  const policyResult = validateAgainstPolicy({
    policy,
    action: selectedStrategy.action,
    transaction,
    previousAttempts,
    notificationsToday: notificationsToday[0]?.count ?? 0,
    isPermanentFailure: diagnosis.is_permanent,
    proposedByAI: true,
  })

  let finalAction = selectedStrategy.action
  let policyStatus = 'completed'

  if (!policyResult.allowed) {
    // Find a valid fallback
    finalAction = findFallbackAction(selectedStrategy.action, {
      policy, action: selectedStrategy.action, transaction,
      previousAttempts, notificationsToday: notificationsToday[0]?.count ?? 0,
      isPermanentFailure: diagnosis.is_permanent, proposedByAI: true,
    })

    await execute(
      `INSERT INTO audit_logs (id, merchant_id, actor, event, entity_type, entity_id, details, severity)
       VALUES (?, ?, 'agent', 'Policy blocked action — using fallback', 'recovery_case', ?, ?, 'warning')`,
      [uuidv4(), merchantId, caseId, JSON.stringify({ blocked: selectedStrategy.action, fallback: finalAction, violations: policyResult.violations })]
    )
    policyStatus = 'completed' // Guard completed successfully — it just changed the action
  }

  await logAgentRun(caseId, 'policy', policyStatus as 'completed' | 'failed', Date.now() - policyStart)

  // Log agent decision — policy guard stage
  await execute(
    `INSERT INTO agent_decisions (id, case_id, agent_type, input_summary, decision, confidence, reasoning, model_used, latency_ms)
     VALUES (?, ?, 'policy', ?, ?, ?, ?, 'deterministic-fallback', ?)`,
    [
      uuidv4(), caseId,
      JSON.stringify({ proposed_action: selectedStrategy.action, amount: transaction.amount }),
      JSON.stringify({
        allowed:    policyResult.allowed,
        final_action: finalAction,
        violations: policyResult.violations,
        warnings:   policyResult.warnings,
        requires_human_approval: policyResult.requires_human_approval,
      }),
      policyResult.allowed ? 1.0 : 0.0, // confidence: 1 = approved, 0 = blocked
      policyResult.allowed
        ? `Action approved: ${finalAction}`
        : `Action blocked: ${policyResult.violations.join('; ')} → fallback: ${finalAction}`,
      Date.now() - policyStart,
    ]
  )

  stages.push({
    name: 'Policy Guard',
    status: 'completed',
    durationMs: Date.now() - policyStart,
    summary: policyResult.allowed
      ? `✓ Action approved: ${finalAction}`
      : `⚠ Original action blocked — fallback: ${finalAction} | ${policyResult.violations[0] ?? ''}`,
    timestamp: new Date().toISOString(),
  })

  // ---- STAGE 5: ACTION EXECUTION ----
  const execStart = Date.now()
  await updateCaseStatus(caseId, 'executing')

  const attemptNumber = previousAttempts.length + 1
  const attemptId = uuidv4()
  const idempotencyKey = makeIdempotencyKey(caseId, transactionId, finalAction, attemptNumber)

  await execute(
    `INSERT INTO recovery_attempts (id, case_id, attempt_number, strategy, status, started_at, idempotency_key)
     VALUES (?, ?, ?, ?, 'executing', ?, ?)`,
    [attemptId, caseId, attemptNumber, finalAction, new Date().toISOString(), idempotencyKey]
  )

  const executionResult = await executeRecoveryAction({
    transactionId,
    attemptId,
    caseId,
    action: finalAction,
    attemptNumber,
    merchantId,
    amount: transaction.amount,
    customerId: customer?.id,
    customerEmail: customer?.email,
    customerPhone: customer?.phone,
    reason: selectedStrategy.reasoning[0] ?? 'AI-selected optimal strategy',
  })

  await logAgentRun(caseId, 'execution', executionResult.success ? 'completed' : 'failed', Date.now() - execStart)

  stages.push({
    name: 'Action Execution',
    status: executionResult.success ? 'completed' : 'failed',
    durationMs: Date.now() - execStart,
    summary: executionResult.resultMessage,
    timestamp: new Date().toISOString(),
  })

  // ---- STAGE 6: OUTCOME EVALUATION ----
  const outcomeStart = Date.now()
  const finalStatus = executionResult.success ? 'recovered' : 'failed'
  const amountRecovered = executionResult.amountRecovered ?? 0

  await execute(
    `UPDATE recovery_attempts SET status = ?, result_code = ?, result_message = ?,
     amount_recovered = ?, completed_at = ? WHERE id = ?`,
    [executionResult.status, executionResult.resultCode, executionResult.resultMessage,
     amountRecovered, new Date().toISOString(), attemptId]
  )

  await execute(
    `UPDATE recovery_cases SET status = ?, actual_recovery = ?,
     resolved_at = ?, updated_at = ? WHERE id = ?`,
    [finalStatus, executionResult.success ? amountRecovered : null,
     executionResult.success ? new Date().toISOString() : null,
     new Date().toISOString(), caseId]
  )

  // Update customer statistics
  if (executionResult.success && customer) {
    await execute(
      `UPDATE customers SET successful_payments = successful_payments + 1,
       total_payments = total_payments + 1, total_spent = total_spent + ?,
       updated_at = ? WHERE id = ?`,
      [amountRecovered, new Date().toISOString(), customer.id]
    )

    // ── Task 5: Update customer_features after successful recovery ──────────
    // Recalculate recovery_success_rate from actual attempt history,
    // and refresh days_since_last_payment to 0 (payment just succeeded).
    // checkout_attempts_30d is incremented (this recovery attempt counts).
    const attemptStats = await query<{ total: number; successful: number }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN ra.status = 'success' THEN 1 ELSE 0 END) as successful
       FROM recovery_attempts ra
       JOIN recovery_cases rc ON ra.case_id = rc.id
       WHERE rc.customer_id = ?`,
      [customer.id]
    )
    const totalAttempts = attemptStats[0]?.total ?? 1
    const successfulAttempts = attemptStats[0]?.successful ?? 1
    const newRecoverySuccessRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 1.0

    const featuresExist = await query<{ customer_id: string }>(
      'SELECT customer_id FROM customer_features WHERE customer_id = ?',
      [customer.id]
    )

    if (featuresExist.length > 0) {
      await execute(
        `UPDATE customer_features
         SET recovery_success_rate  = ?,
             days_since_last_payment = 0,
             checkout_attempts_30d   = checkout_attempts_30d + 1,
             updated_at              = ?
         WHERE customer_id = ?`,
        [newRecoverySuccessRate, new Date().toISOString(), customer.id]
      )
    } else {
      // No features row yet — create one with what we know
      await execute(
        `INSERT INTO customer_features
           (customer_id, checkout_attempts_30d, recovery_success_rate, days_since_last_payment, high_value_customer, updated_at)
         VALUES (?, 1, ?, 0, ?, ?)`,
        [
          customer.id,
          newRecoverySuccessRate,
          (customer.total_spent ?? 0) > 1000000 ? true : false,
          new Date().toISOString(),
        ]
      )
    }
  } else if (!executionResult.success && customer) {
    // Failed recovery — still increment total_payments and checkout_attempts,
    // but do NOT touch successful_payments or recovery_success_rate.
    await execute(
      `UPDATE customers SET total_payments = total_payments + 1,
       failed_payments = failed_payments + 1,
       updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), customer.id]
    )

    // Recalculate recovery_success_rate (denominator grew, numerator unchanged)
    const attemptStats = await query<{ total: number; successful: number }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN ra.status = 'success' THEN 1 ELSE 0 END) as successful
       FROM recovery_attempts ra
       JOIN recovery_cases rc ON ra.case_id = rc.id
       WHERE rc.customer_id = ?`,
      [customer.id]
    )
    const totalAttempts = attemptStats[0]?.total ?? 1
    const successfulAttempts = attemptStats[0]?.successful ?? 0
    const newRecoverySuccessRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0

    const featuresExist = await query<{ customer_id: string }>(
      'SELECT customer_id FROM customer_features WHERE customer_id = ?',
      [customer.id]
    )
    if (featuresExist.length > 0) {
      await execute(
        `UPDATE customer_features
         SET recovery_success_rate  = ?,
             checkout_attempts_30d   = checkout_attempts_30d + 1,
             updated_at              = ?
         WHERE customer_id = ?`,
        [newRecoverySuccessRate, new Date().toISOString(), customer.id]
      )
    }
  }

  await logAgentRun(caseId, 'outcome', 'completed', Date.now() - outcomeStart)

  stages.push({
    name: 'Outcome Evaluation',
    status: 'completed',
    durationMs: Date.now() - outcomeStart,
    summary: executionResult.success
      ? `✓ Recovered ₹${Math.floor(amountRecovered / 100).toLocaleString('en-IN')}`
      : `✗ Recovery failed — case closed`,
    timestamp: new Date().toISOString(),
  })

  console.log(`[pipeline] Case ${caseId}: ${finalStatus} in ${Date.now() - pipelineStart}ms`)

  return {
    caseId,
    action: finalAction,
    success: executionResult.success,
    recovered: executionResult.success,
    amountRecovered,
    reasoning: selectedStrategy.reasoning,
    stages,
    modelUsed: hybridResult.model_used,
    aiUsed: hybridResult.ai_used,
  }
}

async function updateCaseStatus(caseId: string, status: string): Promise<void> {
  await execute(
    `UPDATE recovery_cases SET status = ?, updated_at = ? WHERE id = ?`,
    [status, new Date().toISOString(), caseId]
  )
}

async function logAgentRun(
  caseId: string,
  stage: string,
  status: 'running' | 'completed' | 'failed' | 'skipped',
  durationMs: number
): Promise<void> {
  await execute(
    `INSERT INTO agent_runs (id, case_id, stage, status, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), caseId, stage, status, durationMs, new Date().toISOString()]
  )
}
