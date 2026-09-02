// Seed data generator for REVIVE demo mode
// Creates realistic Indian fintech scenario data
// All data is clearly synthetic — never represents real Razorpay customers

import { v4 as uuidv4 } from 'uuid'
import { query, execute } from './client'
import type {
  PaymentMethod,
  TransactionStatus,
  FailureCategory,
  RecoveryCaseStatus,
  RecoveryAction,
  AttemptStatus,
} from '../types'

const DEMO_MERCHANT_ID = 'merchant_demo_revive'
const DEMO_MERCHANT_EMAIL = 'demo@revive.ai'

// Indian names for realistic demo data
const CUSTOMER_NAMES = [
  'Rohit Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Reddy', 'Vikram Singh',
  'Ananya Iyer', 'Rahul Gupta', 'Pooja Nair', 'Karthik Menon', 'Neha Joshi',
  'Arjun Mehta', 'Divya Krishnan', 'Suresh Yadav', 'Meena Pillai', 'Rajesh Shah',
  'Sunita Verma', 'Aakash Tiwari', 'Lakshmi Bhat', 'Manish Agarwal', 'Kavita Soni',
  'Deepak Pandey', 'Ritu Saxena', 'Nikhil Jain', 'Anjali Mishra', 'Sanjay Dubey',
]

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'card', 'netbanking', 'wallet']
const FAILURE_REASONS: { code: string; reason: string; category: FailureCategory; recoverable: boolean }[] = [
  { code: 'UPI_TIMEOUT', reason: 'UPI transaction timed out', category: 'temporary_upi_failure', recoverable: true },
  { code: 'BANK_TIMEOUT', reason: 'Bank server timeout', category: 'bank_timeout', recoverable: true },
  { code: 'CARD_DECLINED', reason: 'Card declined by issuer', category: 'card_declined', recoverable: true },
  { code: 'INSUFFICIENT_BALANCE', reason: 'Insufficient account balance', category: 'insufficient_balance', recoverable: false },
  { code: 'PAYMENT_CANCELLED', reason: 'Payment abandoned at checkout', category: 'checkout_abandoned', recoverable: true },
  { code: 'NETWORK_ERROR', reason: 'Network connectivity issue', category: 'network_error', recoverable: true },
  { code: 'FRAUD_BLOCKED', reason: 'Transaction blocked by fraud engine', category: 'fraud_block', recoverable: false },
  { code: 'UPI_LINK_EXPIRED', reason: 'UPI payment link expired', category: 'payment_link_abandoned', recoverable: true },
  { code: 'BANK_MAINTENANCE', reason: 'Bank under maintenance window', category: 'bank_timeout', recoverable: true },
  { code: 'VPA_INVALID', reason: 'UPI VPA not registered', category: 'temporary_upi_failure', recoverable: true },
]

// Amounts in paise — realistic Indian e-commerce values
const AMOUNTS_PAISE = [
  49900, 99900, 149900, 199900, 299900, 499900, 999900,
  1499900, 1999900, 2499900, 4999900, 9999900, 14999900,
  24900, 74900, 124900, 174900, 349900, 749900,
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function hoursAgo(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() - hours)
  return d.toISOString()
}

export async function seedDemoData(): Promise<void> {
  // Check if already seeded
  const existing = await query<{ count: number }>(
    'SELECT COUNT(*) as count FROM merchants WHERE id = ?',
    [DEMO_MERCHANT_ID]
  )
  if (existing[0]?.count > 0) {
    console.log('[seed] Demo data already exists, skipping.')
    return
  }

  console.log('[seed] Seeding demo data...')

  // 1. Create demo merchant
  await execute(
    `INSERT INTO merchants (id, name, email, api_key, is_demo) VALUES (?, ?, ?, ?, ?)`,
    [DEMO_MERCHANT_ID, 'Acme Commerce (Demo)', DEMO_MERCHANT_EMAIL, 'rzp_test_demo_key', true]
  )

  // 2. Create merchant policy
  await execute(
    `INSERT INTO policies (id, merchant_id, max_retries, min_retry_interval_mins, max_notifications_per_day,
     min_recovery_amount_paise, allowed_channels, human_approval_threshold, max_recovery_cost_paise, auto_abandon_after_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(), DEMO_MERCHANT_ID, 2, 15, 2, 10000,
      JSON.stringify(['RETRY_PAYMENT', 'SEND_EMAIL', 'GENERATE_PAYMENT_LINK', 'WAIT_AND_RETRY', 'SEND_WHATSAPP']),
      1000000, 5000, 48
    ]
  )

  // 3. Create 25 customers
  const customerIds: string[] = []
  for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
    const id = `customer_demo_${String(i).padStart(3, '0')}`
    customerIds.push(id)
    const totalPayments = randomInt(2, 30)
    const successfulPayments = randomInt(Math.floor(totalPayments * 0.6), totalPayments)
    const failedPayments = totalPayments - successfulPayments
    const totalSpent = randomInt(100000, 5000000) // ₹1k to ₹50k
    const name = CUSTOMER_NAMES[i]
    const firstName = name.split(' ')[0].toLowerCase()
    await execute(
      `INSERT INTO customers (id, merchant_id, name, email, phone, total_payments, successful_payments, failed_payments, total_spent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, DEMO_MERCHANT_ID, name, `${firstName}@example.com`, `+9198${randomInt(10000000, 99999999)}`,
       totalPayments, successfulPayments, failedPayments, totalSpent]
    )

    // Customer features
    await execute(
      `INSERT INTO customer_features (customer_id, avg_transaction_amount, preferred_payment_method,
       checkout_attempts_30d, recovery_success_rate, days_since_last_payment, payment_frequency_score, high_value_customer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id,
       Math.floor(totalSpent / (successfulPayments || 1)),
       randomItem(PAYMENT_METHODS),
       randomInt(1, 8),
       Math.round((successfulPayments / totalPayments) * 100) / 100,
       randomInt(0, 30),
       Math.round(Math.random() * 100) / 100,
       totalSpent > 1000000 ? true : false]
    )
  }

  // 4. Create 1000 transactions — mix of successful + failed
  const failedTransactionIds: string[] = []
  for (let i = 0; i < 1000; i++) {
    const txId = `tx_demo_${String(i).padStart(5, '0')}`
    const customerId = randomItem(customerIds)
    const hoursBack = randomInt(0, 72)
    const created = hoursAgo(hoursBack)

    // ~25% failure rate — realistic; ensure tx_demo_00042 is the canonical demo transaction
    const isSpecialDemoTx = i === 42
    const isFailed = isSpecialDemoTx ? true : Math.random() < 0.247
    const status: TransactionStatus = isFailed ? 'failed' : 'captured'
    const failure = isSpecialDemoTx
      ? { code: 'UPI_TIMEOUT', reason: 'Bank timeout — UPI_TIMEOUT', category: 'temporary_upi_failure' as FailureCategory, recoverable: true }
      : (isFailed ? randomItem(FAILURE_REASONS) : null)
    const amount = isSpecialDemoTx ? 499900 : randomItem(AMOUNTS_PAISE)
    const method = isSpecialDemoTx ? 'upi' : randomItem(PAYMENT_METHODS)

    await execute(
      `INSERT INTO transactions (id, merchant_id, customer_id, external_id, amount, currency,
       payment_method, status, failure_code, failure_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?)`,
      [txId, DEMO_MERCHANT_ID, customerId, `pay_demo_${txId}`,
       amount, method, status,
       failure?.code ?? null, failure?.reason ?? null, created, created]
    )

    if (isFailed) {
      failedTransactionIds.push(txId)
    }
  }

  // 5. Create payment events for failed transactions
  for (const txId of failedTransactionIds) {
    const eventId = `evt_demo_${uuidv4().slice(0, 8)}`
    await execute(
      `INSERT INTO payment_events (id, merchant_id, transaction_id, event_type, payload, idempotency_key, processed, source)
       VALUES (?, ?, ?, 'payment.failed', ?, ?, TRUE, 'demo')`,
      [eventId, DEMO_MERCHANT_ID, txId, JSON.stringify({ transaction_id: txId }), `${txId}_payment.failed`]
    )
  }

  // 6. Create recovery cases for failed transactions (with realistic mix of outcomes)
  let recoveredCount = 0
  let totalRecovered = 0

  for (let i = 0; i < failedTransactionIds.length; i++) {
    const txId = failedTransactionIds[i]
    const caseId = `case_demo_${String(i).padStart(4, '0')}`

    // Get the transaction
    const txRows = await query<{ customer_id: string; amount: number; failure_code: string; payment_method: string; created_at: string }>(
      'SELECT customer_id, amount, failure_code, payment_method, created_at FROM transactions WHERE id = ?',
      [txId]
    )
    if (!txRows[0]) continue
    const tx = txRows[0]

    const failureInfo = FAILURE_REASONS.find(f => f.code === tx.failure_code) ?? FAILURE_REASONS[0]
    const recoverabilityScore = failureInfo.recoverable ? randomInt(40, 92) / 100 : randomInt(5, 25) / 100
    const intentScore = randomInt(45, 98) / 100
    const expectedRecovery = Math.floor(tx.amount * recoverabilityScore * intentScore)

    // Status distribution: ~45% recovered, ~25% failed, ~20% executing, ~10% open
    const rand = Math.random()
    let caseStatus: RecoveryCaseStatus
    let actualRecovery: number | null = null
    let resolvedAt: string | null = null

    if (txId === 'tx_demo_00042') {
      caseStatus = 'open' // Pristine open case for Command Center demo (0 previous attempts)
    } else if (rand < 0.45) {
      caseStatus = 'recovered'
      actualRecovery = tx.amount
      recoveredCount++
      totalRecovered += tx.amount
      resolvedAt = new Date(new Date(tx.created_at).getTime() + randomInt(5, 120) * 60 * 1000).toISOString()
    } else if (rand < 0.70) {
      caseStatus = 'failed'
      resolvedAt = new Date(new Date(tx.created_at).getTime() + randomInt(60, 2880) * 60 * 1000).toISOString()
    } else if (rand < 0.85) {
      caseStatus = 'executing'
    } else if (rand < 0.92) {
      caseStatus = 'strategy_selected'
    } else {
      caseStatus = 'open'
    }

    const strategies: RecoveryAction[] = ['RETRY_PAYMENT', 'WAIT_AND_RETRY', 'GENERATE_PAYMENT_LINK', 'SEND_WHATSAPP', 'SEND_EMAIL']
    const selectedStrategy = failureInfo.recoverable ? randomItem(strategies) : 'NO_ACTION'

    await execute(
      `INSERT INTO recovery_cases (id, merchant_id, transaction_id, customer_id, status, failure_category,
       severity, recoverability_score, intent_score, expected_recovery, actual_recovery,
       selected_strategy, diagnosis_reason, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [caseId, DEMO_MERCHANT_ID, txId, tx.customer_id, caseStatus, failureInfo.category,
       recoverabilityScore > 0.7 ? 'high' : recoverabilityScore > 0.4 ? 'medium' : 'low',
       recoverabilityScore, intentScore, expectedRecovery, actualRecovery ?? null,
       selectedStrategy, failureInfo.reason,
       tx.created_at, new Date().toISOString(), resolvedAt ?? null]
    )

    // Create recovery attempts for non-open cases
    if (!['open', 'diagnosing'].includes(caseStatus)) {
      const attemptId = `attempt_demo_${uuidv4().slice(0, 8)}`
      const attemptStatus: AttemptStatus = caseStatus === 'recovered' ? 'success' : caseStatus === 'failed' ? 'failed' : 'pending'
      const idempotencyKey = `${txId}_${selectedStrategy}_1`

      await execute(
        `INSERT INTO recovery_attempts (id, case_id, attempt_number, strategy, status,
         amount_recovered, started_at, completed_at, idempotency_key)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        [attemptId, caseId, selectedStrategy, attemptStatus,
         actualRecovery ?? null, tx.created_at,
         resolvedAt ?? null, idempotencyKey]
      )

      // Agent decision record
      const decisionId = `decision_demo_${uuidv4().slice(0, 8)}`
      const reasoning = generateReasoning(failureInfo.category, recoverabilityScore, intentScore)
      await execute(
        `INSERT INTO agent_decisions (id, case_id, agent_type, input_summary, decision, confidence, reasoning, model_used)
         VALUES (?, ?, 'strategy', ?, ?, ?, ?, 'deterministic-fallback')`,
        [decisionId, caseId,
         JSON.stringify({ failure_category: failureInfo.category, amount: tx.amount }),
         JSON.stringify({ action: selectedStrategy }),
         recoverabilityScore * intentScore,
         reasoning]
      )
    }
  }

  console.log(`[seed] Created ${failedTransactionIds.length} recovery cases`)
  console.log(`[seed] ${recoveredCount} recovered, ₹${Math.floor(totalRecovered / 100).toLocaleString('en-IN')} recovered`)
  console.log('[seed] Demo seed complete.')
}

function generateReasoning(category: FailureCategory, recoverability: number, intent: number): string {
  const bullets: string[] = []

  if (category === 'temporary_upi_failure') {
    bullets.push('Failure indicates temporary UPI infrastructure issue')
    bullets.push('Customer UPI VPA is valid and registered')
    bullets.push('Bank servers typically recover within 10–15 minutes')
  } else if (category === 'bank_timeout') {
    bullets.push('Bank timeout is a transient error with no permanent decline signal')
    bullets.push('Historical recovery rate for bank timeouts is 71%')
    bullets.push('Recommended wait period: 15 minutes before retry')
  } else if (category === 'card_declined') {
    bullets.push('Card decline may indicate temporary authorization hold')
    bullets.push('Customer has previous successful card payments')
    bullets.push('Payment link alternative preferred to avoid retry friction')
  } else if (category === 'checkout_abandoned') {
    bullets.push('Customer initiated but did not complete checkout')
    bullets.push('Checkout abandonment often indicates price sensitivity or distraction')
    bullets.push('Targeted payment link with urgency signal recommended')
  } else {
    bullets.push('Failure reason indicates potential recoverability')
  }

  if (recoverability > 0.7) bullets.push(`Recoverability score is high (${Math.round(recoverability * 100)}%) — priority case`)
  if (intent > 0.8) bullets.push(`Customer intent score is strong (${Math.round(intent * 100)}/100) — customer likely wants to pay`)
  if (intent < 0.4) bullets.push('Customer intent is uncertain — less aggressive approach preferred')

  return bullets.join('\n')
}

export { DEMO_MERCHANT_ID, DEMO_MERCHANT_EMAIL }
