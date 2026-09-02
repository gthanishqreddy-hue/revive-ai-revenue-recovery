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
  'Priya Sharma', 'Rohit Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Reddy', 'Vikram Singh',
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

/**
 * Ensures the canonical demo transaction (tx_demo_00042) and all its required
 * dependencies (merchant, policy, Priya Sharma customer record, open recovery case)
 * exist idempotently in the database.
 */
export async function ensureCanonicalDemoData(): Promise<void> {
  const now = new Date().toISOString()
  const created = hoursAgo(2)

  // 1. Demo Merchant
  await execute(
    `INSERT INTO merchants (id, name, email, api_key, is_demo)
     VALUES (?, ?, ?, ?, TRUE)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = TRUE`,
    [DEMO_MERCHANT_ID, 'Acme Commerce (Demo)', DEMO_MERCHANT_EMAIL, 'rzp_test_demo_key']
  )

  // 2. Merchant Policy
  await execute(
    `INSERT INTO policies (id, merchant_id, max_retries, min_retry_interval_mins, max_notifications_per_day,
     min_recovery_amount_paise, allowed_channels, human_approval_threshold, max_recovery_cost_paise, auto_abandon_after_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (merchant_id) DO NOTHING`,
    [
      uuidv4(), DEMO_MERCHANT_ID, 2, 15, 2, 10000,
      JSON.stringify(['RETRY_PAYMENT', 'SEND_EMAIL', 'GENERATE_PAYMENT_LINK', 'WAIT_AND_RETRY', 'SEND_WHATSAPP']),
      1000000, 5000, 48
    ]
  )

  // 3. Canonical Customer: Priya Sharma
  const customerId = 'customer_demo_042'
  await execute(
    `INSERT INTO customers (id, merchant_id, name, email, phone, total_payments, successful_payments, failed_payments, total_spent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone`,
    [customerId, DEMO_MERCHANT_ID, 'Priya Sharma', 'priya.sharma@example.com', '+919876543210', 12, 11, 1, 4500000]
  )

  // 4. Customer Features for Priya Sharma
  await execute(
    `INSERT INTO customer_features (customer_id, avg_transaction_amount, preferred_payment_method,
     checkout_attempts_30d, recovery_success_rate, days_since_last_payment, payment_frequency_score, high_value_customer)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
     ON CONFLICT (customer_id) DO UPDATE SET
       preferred_payment_method = EXCLUDED.preferred_payment_method,
       recovery_success_rate = EXCLUDED.recovery_success_rate,
       high_value_customer = TRUE`,
    [customerId, 375000, 'upi', 3, 0.92, 1, 0.85]
  )

  // 5. Canonical Demo Transaction: tx_demo_00042 (₹4,999, UPI, UPI_TIMEOUT)
  await execute(
    `INSERT INTO transactions (id, merchant_id, customer_id, external_id, amount, currency,
     payment_method, status, failure_code, failure_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'INR', ?, 'failed', ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       amount = EXCLUDED.amount,
       payment_method = EXCLUDED.payment_method,
       status = EXCLUDED.status,
       failure_code = EXCLUDED.failure_code,
       failure_reason = EXCLUDED.failure_reason`,
    [
      'tx_demo_00042',
      DEMO_MERCHANT_ID,
      customerId,
      'pay_demo_tx_demo_00042',
      499900, // ₹4,999
      'upi',
      'UPI_TIMEOUT',
      'Bank timeout — UPI_TIMEOUT',
      created,
      created
    ]
  )

  // 6. Payment Event for tx_demo_00042
  await execute(
    `INSERT INTO payment_events (id, merchant_id, transaction_id, event_type, payload, idempotency_key, processed, source)
     VALUES (?, ?, ?, 'payment.failed', ?, ?, TRUE, 'demo')
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      'evt_demo_tx_demo_00042',
      DEMO_MERCHANT_ID,
      'tx_demo_00042',
      JSON.stringify({ transaction_id: 'tx_demo_00042' }),
      'tx_demo_00042_payment.failed'
    ]
  )

  // 7. Pristine Open Recovery Case for tx_demo_00042 (0 previous attempts)
  await execute(
    `INSERT INTO recovery_cases (id, merchant_id, transaction_id, customer_id, status, failure_category,
     severity, recoverability_score, intent_score, expected_recovery, actual_recovery,
     selected_strategy, diagnosis_reason, created_at, updated_at, resolved_at)
     VALUES (?, ?, ?, ?, 'open', 'temporary_upi_failure', 'medium', 0.85, 0.92, 390921, NULL,
     'WAIT_AND_RETRY', 'Bank timeout — UPI_TIMEOUT', ?, ?, NULL)
     ON CONFLICT (id) DO UPDATE SET
       status = 'open',
       actual_recovery = NULL,
       resolved_at = NULL,
       updated_at = EXCLUDED.updated_at`,
    [
      'case_demo_0042',
      DEMO_MERCHANT_ID,
      'tx_demo_00042',
      customerId,
      created,
      now
    ]
  )

  // 8. Self-heal any uncased failed transactions to strictly maintain 1 failed transaction -> 1 recovery case invariant
  const uncasedFailedTx = await query<{
    id: string
    merchant_id: string
    customer_id: string
    amount: number
    failure_code: string
    failure_reason: string
    created_at: string
  }>(
    `SELECT t.id, t.merchant_id, t.customer_id, t.amount, t.failure_code, t.failure_reason, t.created_at
     FROM transactions t
     LEFT JOIN recovery_cases rc ON t.id = rc.transaction_id
     WHERE t.merchant_id = ? AND t.status = 'failed' AND rc.id IS NULL`,
    [DEMO_MERCHANT_ID]
  )

  for (const t of uncasedFailedTx) {
    const caseId = `case_${t.id}`
    await execute(
      `INSERT INTO recovery_cases (id, merchant_id, transaction_id, customer_id, status, failure_category,
       severity, recoverability_score, intent_score, expected_recovery, actual_recovery,
       selected_strategy, diagnosis_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', 'temporary_upi_failure', 'medium', 0.80, 0.85, ?, NULL,
       'WAIT_AND_RETRY', ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [caseId, t.merchant_id, t.id, t.customer_id, Math.floor(t.amount * 0.68), t.failure_reason || 'Failed payment', t.created_at, new Date().toISOString()]
    )
  }
}

export async function seedDemoData(): Promise<void> {
  // Always guarantee the canonical demo transaction first
  await ensureCanonicalDemoData()

  // Check if broader transaction dataset already exists
  const existingTx = await query<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions WHERE merchant_id = ?',
    [DEMO_MERCHANT_ID]
  )

  if ((existingTx[0]?.count ?? 0) >= 50) {
    console.log('[seed] Demo dataset already exists, canonical tx ensured.')
    return
  }

  console.log('[seed] Seeding demo dataset for dashboard & metrics...')

  // 1. Create 25 customers
  const customerIds: string[] = ['customer_demo_042']
  for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
    const id = `customer_demo_${String(i).padStart(3, '0')}`
    if (id === 'customer_demo_042') continue // already seeded as Priya Sharma
    customerIds.push(id)
    const totalPayments = randomInt(2, 30)
    const successfulPayments = randomInt(Math.floor(totalPayments * 0.6), totalPayments)
    const failedPayments = totalPayments - successfulPayments
    const totalSpent = randomInt(100000, 5000000) // ₹1k to ₹50k
    const name = CUSTOMER_NAMES[i]
    const firstName = name.split(' ')[0].toLowerCase()
    await execute(
      `INSERT INTO customers (id, merchant_id, name, email, phone, total_payments, successful_payments, failed_payments, total_spent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [id, DEMO_MERCHANT_ID, name, `${firstName}@example.com`, `+9198${randomInt(10000000, 99999999)}`,
       totalPayments, successfulPayments, failedPayments, totalSpent]
    )

    // Customer features
    await execute(
      `INSERT INTO customer_features (customer_id, avg_transaction_amount, preferred_payment_method,
       checkout_attempts_30d, recovery_success_rate, days_since_last_payment, payment_frequency_score, high_value_customer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (customer_id) DO NOTHING`,
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

  // 2. Generate 1000 transactions — mix of successful + failed
  const failedTransactions: { txId: string; customerId: string; amount: number; method: string; failure: typeof FAILURE_REASONS[0]; created: string }[] = []

  // Insert in batches of 50 for fast PostgreSQL execution
  const BATCH_SIZE = 50
  for (let batchStart = 0; batchStart < 1000; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, 1000)
    const placeholders: string[] = []
    const args: (string | number | null | boolean)[] = []

    for (let i = batchStart; i < batchEnd; i++) {
      const txId = `tx_demo_${String(i).padStart(5, '0')}`
      if (txId === 'tx_demo_00042') continue // already seeded as canonical demo tx

      const customerId = randomItem(customerIds)
      const hoursBack = randomInt(0, 72)
      const created = hoursAgo(hoursBack)

      const isFailed = Math.random() < 0.247
      const status: TransactionStatus = isFailed ? 'failed' : 'captured'
      const failure = isFailed ? randomItem(FAILURE_REASONS) : null
      const amount = randomItem(AMOUNTS_PAISE)
      const method = randomItem(PAYMENT_METHODS)

      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      args.push(
        txId, DEMO_MERCHANT_ID, customerId, `pay_demo_${txId}`,
        amount, 'INR', method, status,
        failure?.code ?? null, failure?.reason ?? null, created, created
      )

      if (isFailed && failure) {
        failedTransactions.push({ txId, customerId, amount, method, failure, created })
      }
    }

    if (placeholders.length > 0) {
      await execute(
        `INSERT INTO transactions (id, merchant_id, customer_id, external_id, amount, currency,
         payment_method, status, failure_code, failure_reason, created_at, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        args
      )
    }
  }

  // 3. Create payment events & recovery cases for failed transactions
  const strategies: RecoveryAction[] = ['RETRY_PAYMENT', 'WAIT_AND_RETRY', 'GENERATE_PAYMENT_LINK', 'SEND_WHATSAPP', 'SEND_EMAIL']
  let recoveredCount = 0
  let totalRecovered = 0

  for (let i = 0; i < failedTransactions.length; i++) {
    const { txId, customerId, amount, failure, created } = failedTransactions[i]
    const caseId = `case_${txId}`

    // Payment event
    const eventId = `evt_demo_${uuidv4().slice(0, 8)}`
    await execute(
      `INSERT INTO payment_events (id, merchant_id, transaction_id, event_type, payload, idempotency_key, processed, source)
       VALUES (?, ?, ?, 'payment.failed', ?, ?, TRUE, 'demo')
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [eventId, DEMO_MERCHANT_ID, txId, JSON.stringify({ transaction_id: txId }), `${txId}_payment.failed`]
    )

    const recoverabilityScore = failure.recoverable ? randomInt(40, 92) / 100 : randomInt(5, 25) / 100
    const intentScore = randomInt(45, 98) / 100
    const expectedRecovery = Math.floor(amount * recoverabilityScore * intentScore)

    // Status distribution: ~45% recovered, ~25% failed, ~20% executing, ~10% open
    const rand = Math.random()
    let caseStatus: RecoveryCaseStatus
    let actualRecovery: number | null = null
    let resolvedAt: string | null = null

    if (rand < 0.45) {
      caseStatus = 'recovered'
      actualRecovery = amount
      recoveredCount++
      totalRecovered += amount
      resolvedAt = new Date(new Date(created).getTime() + randomInt(5, 120) * 60 * 1000).toISOString()
    } else if (rand < 0.70) {
      caseStatus = 'failed'
      resolvedAt = new Date(new Date(created).getTime() + randomInt(60, 2880) * 60 * 1000).toISOString()
    } else if (rand < 0.85) {
      caseStatus = 'executing'
    } else if (rand < 0.92) {
      caseStatus = 'strategy_selected'
    } else {
      caseStatus = 'open'
    }

    const selectedStrategy = failure.recoverable ? randomItem(strategies) : 'NO_ACTION'

    await execute(
      `INSERT INTO recovery_cases (id, merchant_id, transaction_id, customer_id, status, failure_category,
       severity, recoverability_score, intent_score, expected_recovery, actual_recovery,
       selected_strategy, diagnosis_reason, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [caseId, DEMO_MERCHANT_ID, txId, customerId, caseStatus, failure.category,
       recoverabilityScore > 0.7 ? 'high' : recoverabilityScore > 0.4 ? 'medium' : 'low',
       recoverabilityScore, intentScore, expectedRecovery, actualRecovery ?? null,
       selectedStrategy, failure.reason,
       created, new Date().toISOString(), resolvedAt ?? null]
    )

    // Create recovery attempts for non-open cases
    if (!['open', 'diagnosing'].includes(caseStatus)) {
      const attemptId = `attempt_demo_${uuidv4().slice(0, 8)}`
      const attemptStatus: AttemptStatus = caseStatus === 'recovered' ? 'success' : caseStatus === 'failed' ? 'failed' : 'pending'
      const idempotencyKey = `${txId}_${selectedStrategy}_1`

      await execute(
        `INSERT INTO recovery_attempts (id, case_id, attempt_number, strategy, status,
         amount_recovered, started_at, completed_at, idempotency_key)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [attemptId, caseId, selectedStrategy, attemptStatus,
         actualRecovery ?? null, created,
         resolvedAt ?? null, idempotencyKey]
      )

      // Agent decision record
      const decisionId = `decision_demo_${uuidv4().slice(0, 8)}`
      const reasoning = generateReasoning(failure.category, recoverabilityScore, intentScore)
      await execute(
        `INSERT INTO agent_decisions (id, case_id, agent_type, input_summary, decision, confidence, reasoning, model_used)
         VALUES (?, ?, 'strategy', ?, ?, ?, ?, 'deterministic-fallback')
         ON CONFLICT (id) DO NOTHING`,
        [decisionId, caseId,
         JSON.stringify({ failure_category: failure.category, amount }),
         JSON.stringify({ action: selectedStrategy }),
         recoverabilityScore * intentScore,
         reasoning]
      )
    }
  }

  console.log(`[seed] Created ${failedTransactions.length} recovery cases`)
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
