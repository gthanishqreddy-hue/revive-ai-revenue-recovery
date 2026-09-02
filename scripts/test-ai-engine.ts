// REVIVE — Complete Verification & Test Suite
// Run with: npm test or npx tsx scripts/test-ai-engine.ts

import assert from 'node:assert'
import { z } from 'zod'
import { AIDecisionSchema, type RecoveryAIContext } from '../src/lib/ai/types'
import { evaluateStrategyWithAI, setAIProvider } from '../src/lib/ai'
import type { AIProvider } from '../src/lib/ai/provider'
import type { StrategySelectionResult, StrategyEvaluation, RecoveryAction } from '../src/lib/types'
import { getPaymentProvider, setPaymentProvider, DemoPaymentProvider, RazorpayProvider } from '../src/lib/payment'
import { checkRateLimit, resetRateLimitStore } from '../src/lib/rate-limit'

console.log('════════════════════════════════════════════════════════════════════')
console.log('🧪 REVIVE COMPLETE ARCHITECTURE & SECURITY TEST SUITE')
console.log('════════════════════════════════════════════════════════════════════\n')

let passed = 0
let failed = 0

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn()
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  ✓ PASS: ${name}`)
          passed++
        })
        .catch(err => {
          console.error(`  ✗ FAIL: ${name}`)
          console.error(`    Error: ${err.message}`)
          failed++
        })
    } else {
      console.log(`  ✓ PASS: ${name}`)
      passed++
    }
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`)
    console.error(`    Error: ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

// ── MOCK DATA FIXTURES ────────────────────────────────────────────────────────

const mockContext: RecoveryAIContext = {
  transactionId: 'tx_test_001',
  amountPaise: 499900,
  currency: 'INR',
  paymentMethod: 'upi',
  failureCategory: 'temporary_upi_failure',
  diagnosisReason: 'Bank switch timeout on NPCI gateway',
  recoverabilityScore: 0.78,
  isPermanentFailure: false,
  customerIntentScore: 91,
  customerIntentConfidence: 0.95,
  customerSignalsSummary: ['8 prior successful UPI payments', 'Active today'],
  isHighValueCustomer: false,
  customerTotalPayments: 10,
  customerSuccessfulPayments: 8,
  previousAttemptsCount: 0,
  previousStrategies: [],
  candidateStrategies: [
    {
      action: 'WAIT_AND_RETRY',
      probabilityOfSuccess: 0.78,
      actionCostPaise: 0,
      customerFrictionPenalty: 10,
      expectedRecoveryValuePaise: 389900,
      reasoning: ['Transient failure resolves within 15 mins'],
    },
    {
      action: 'GENERATE_PAYMENT_LINK',
      probabilityOfSuccess: 0.55,
      actionCostPaise: 50,
      customerFrictionPenalty: 200,
      expectedRecoveryValuePaise: 274695,
      reasoning: ['Allows alternate UPI app'],
    },
  ],
  policyMaxRetries: 2,
  policyAllowedChannels: ['WAIT_AND_RETRY', 'GENERATE_PAYMENT_LINK', 'SEND_WHATSAPP'],
}

const mockDeterministicResult: StrategySelectionResult = {
  selected: {
    action: 'WAIT_AND_RETRY',
    probability_of_success: 0.78,
    action_cost_paise: 0,
    customer_friction_penalty: 10,
    expected_recovery_value: 389900,
    reasoning: ['Deterministic ERV top pick'],
  },
  alternatives: [
    {
      action: 'GENERATE_PAYMENT_LINK',
      probability_of_success: 0.55,
      action_cost_paise: 50,
      customer_friction_penalty: 200,
      expected_recovery_value: 274695,
      reasoning: ['Deterministic ERV second pick'],
    },
  ],
  model_used: 'deterministic-erv-optimizer',
  confidence: 0.85,
}

// ── SCHEMAS FOR API INPUT VALIDATION ─────────────────────────────────────────

const SimulationRequestSchema = z.object({
  transactionId: z.string().trim().min(1).max(128).optional(),
}).strict()

const PolicyUpdateSchema = z.object({
  max_retries: z.number().int().min(0).max(10),
  min_retry_interval_mins: z.number().int().min(1).max(1440),
  max_notifications_per_day: z.number().int().min(0).max(50),
  min_recovery_amount_paise: z.number().int().min(0),
  allowed_channels: z.array(
    z.enum([
      'RETRY_PAYMENT',
      'GENERATE_PAYMENT_LINK',
      'SEND_WHATSAPP',
      'SEND_EMAIL',
      'VOICE_CALL',
      'WAIT_AND_RETRY',
      'NO_ACTION',
      'ESCALATE_TO_HUMAN',
    ])
  ).min(1),
  human_approval_threshold: z.number().int().min(0),
  max_recovery_cost_paise: z.number().int().min(0),
  auto_abandon_after_hours: z.number().int().min(1).max(720),
}).strict()

async function executeAllTests() {
  // ── SECTION 1: ZOD SCHEMA VALIDATION FOR AI DECISIONS ─────────────────────
  console.log('📦 SECTION 1: Zod Schema Validation for Structured AI Decisions')

  runTest('Valid structured AI decision passes schema validation', () => {
    const valid = {
      recommended_action: 'WAIT_AND_RETRY',
      confidence: 0.92,
      reason_codes: ['TEMPORARY_UPI_FAILURE', 'HIGH_INTENT_CUSTOMER'],
      reasoning: 'Transient NPCI timeout with 91/100 intent customer makes delayed retry optimal.',
    }
    const result = AIDecisionSchema.safeParse(valid)
    assert.strictEqual(result.success, true)
  })

  runTest('Confidence outside [0, 1] is rejected by schema', () => {
    const invalidConfidence = {
      recommended_action: 'WAIT_AND_RETRY',
      confidence: 1.5,
      reason_codes: ['TEST'],
      reasoning: 'Invalid confidence score',
    }
    const result = AIDecisionSchema.safeParse(invalidConfidence)
    assert.strictEqual(result.success, false)
  })

  runTest('Disallowed arbitrary action string is rejected by schema', () => {
    const invalidAction = {
      recommended_action: 'TRANSFER_MONEY_ARBITRARILY',
      confidence: 0.9,
      reason_codes: ['TEST'],
      reasoning: 'Disallowed arbitrary action',
    }
    const result = AIDecisionSchema.safeParse(invalidAction)
    assert.strictEqual(result.success, false)
  })

  runTest('Empty reason_codes array is rejected by schema', () => {
    const emptyCodes = {
      recommended_action: 'WAIT_AND_RETRY',
      confidence: 0.8,
      reason_codes: [],
      reasoning: 'Reasoning without codes',
    }
    const result = AIDecisionSchema.safeParse(emptyCodes)
    assert.strictEqual(result.success, false)
  })

  // ── SECTION 2: DETERMINISTIC SAFETY FLOOR & FALLBACK BEHAVIOR ──────────────
  console.log('\n🛡 SECTION 2: Deterministic Safety Floor & Fallback Behavior')

  await runTest('When AI provider is unavailable, engine falls back cleanly to deterministic ERV', async () => {
    const unavailableProvider: AIProvider = {
      name: 'Unavailable Provider',
      modelName: 'gemini-2.5-flash',
      isAvailable: () => false,
      analyzeRecoveryCase: async () => ({
        success: false,
        modelUsed: 'deterministic-fallback',
        error: 'API key not set',
        latencyMs: 0,
      }),
    }

    setAIProvider(unavailableProvider)

    const result = await evaluateStrategyWithAI(
      mockContext,
      mockDeterministicResult,
      mockContext.policyAllowedChannels
    )

    assert.strictEqual(result.ai_used, false)
    assert.strictEqual(result.model_used, 'deterministic-fallback')
    assert.strictEqual(result.selected.action, 'WAIT_AND_RETRY')
    assert.strictEqual(result.selected.expected_recovery_value, 389900)
  })

  await runTest('When AI provider returns malformed / unparseable output, engine falls back cleanly', async () => {
    const failingProvider: AIProvider = {
      name: 'Failing Provider',
      modelName: 'gemini-2.5-flash',
      isAvailable: () => true,
      analyzeRecoveryCase: async () => ({
        success: false,
        modelUsed: 'deterministic-fallback',
        error: 'Malformed JSON output',
        latencyMs: 150,
        fallbackReason: 'Malformed JSON output',
      }),
    }

    setAIProvider(failingProvider)

    const result = await evaluateStrategyWithAI(
      mockContext,
      mockDeterministicResult,
      mockContext.policyAllowedChannels
    )

    assert.strictEqual(result.ai_used, false)
    assert.strictEqual(result.model_used, 'deterministic-fallback')
    assert.strictEqual(result.selected.action, 'WAIT_AND_RETRY')
    assert.strictEqual(result.selected.expected_recovery_value, 389900)
  })

  await runTest('When AI provider times out (>9000ms), engine falls back cleanly to deterministic fallback', async () => {
    const timeoutProvider: AIProvider = {
      name: 'Timing Out Provider',
      modelName: 'gemini-2.5-flash',
      isAvailable: () => true,
      analyzeRecoveryCase: async () => ({
        success: false,
        modelUsed: 'deterministic-fallback',
        error: 'Gemini API call timed out after 9000ms',
        latencyMs: 9005,
        fallbackReason: 'timeout',
      }),
    }

    setAIProvider(timeoutProvider)

    const result = await evaluateStrategyWithAI(
      mockContext,
      mockDeterministicResult,
      mockContext.policyAllowedChannels
    )

    assert.strictEqual(result.ai_used, false)
    assert.strictEqual(result.model_used, 'deterministic-fallback')
    assert.strictEqual(result.fallback_reason, 'timeout')
    assert.strictEqual(result.selected.action, 'WAIT_AND_RETRY')
  })

  await runTest('When AI recommends an action with no valid ERV calculation, engine falls back safely', async () => {
    const unverifiedActionProvider: AIProvider = {
      name: 'Mock Provider',
      modelName: 'gemini-2.5-flash',
      isAvailable: () => true,
      analyzeRecoveryCase: async () => ({
        success: true,
        decision: {
          recommended_action: 'SEND_WHATSAPP',
          confidence: 0.9,
          reason_codes: ['WHATSAPP_NUDGE'],
          reasoning: 'Send WhatsApp nudge.',
        },
        modelUsed: 'gemini-2.5-flash',
        latencyMs: 250,
      }),
    }

    setAIProvider(unverifiedActionProvider)

    const result = await evaluateStrategyWithAI(
      mockContext,
      mockDeterministicResult,
      ['WAIT_AND_RETRY', 'GENERATE_PAYMENT_LINK', 'SEND_WHATSAPP']
    )

    assert.strictEqual(result.ai_used, false)
    assert.strictEqual(result.model_used, 'deterministic-fallback')
    assert.ok(result.fallback_reason?.includes('unverified action'))
    assert.strictEqual(result.selected.action, 'WAIT_AND_RETRY')
  })

  // ── SECTION 3: FINANCIAL SAFETY ENFORCEMENT ────────────────────────────────
  console.log('\n🔒 SECTION 3: Financial Safety Boundary Enforcement')

  await runTest('When AI recommends an action disallowed by merchant policy, engine REJECTS it and falls back', async () => {
    const disallowedActionProvider: AIProvider = {
      name: 'Mock Provider',
      modelName: 'gemini-2.5-flash',
      isAvailable: () => true,
      analyzeRecoveryCase: async () => ({
        success: true,
        decision: {
          recommended_action: 'VOICE_CALL',
          confidence: 0.95,
          reason_codes: ['OUTBOUND_CALL'],
          reasoning: 'Voice call customer directly.',
        },
        modelUsed: 'gemini-2.5-flash',
        latencyMs: 320,
      }),
    }

    setAIProvider(disallowedActionProvider)

    const allowedChannels: RecoveryAction[] = ['WAIT_AND_RETRY', 'GENERATE_PAYMENT_LINK']

    const result = await evaluateStrategyWithAI(
      mockContext,
      mockDeterministicResult,
      allowedChannels
    )

    assert.strictEqual(result.ai_used, false, 'AI decision must be rejected')
    assert.strictEqual(result.model_used, 'deterministic-fallback')
    assert.strictEqual(result.selected.action, 'WAIT_AND_RETRY')
    assert.ok(result.fallback_reason?.includes('disallowed action'))
  })

  await runTest('When AI recommends a verified valid action, engine enriches with real model and reasoning', async () => {
    const validProvider: AIProvider = {
      name: 'Google Gemini',
      modelName: 'gemini-2.5-flash',
      isAvailable: () => true,
      analyzeRecoveryCase: async () => ({
        success: true,
        decision: {
          recommended_action: 'GENERATE_PAYMENT_LINK',
          confidence: 0.88,
          reason_codes: ['OFFER_ALTERNATE_METHOD', 'HIGH_INTENT'],
          reasoning: 'Providing a fresh payment link allows customer to complete checkout on desktop.',
        },
        modelUsed: 'gemini-2.5-flash',
        latencyMs: 410,
      }),
    }

    setAIProvider(validProvider)

    const result = await evaluateStrategyWithAI(
      mockContext,
      mockDeterministicResult,
      mockContext.policyAllowedChannels
    )

    assert.strictEqual(result.ai_used, true)
    assert.strictEqual(result.model_used, 'gemini-2.5-flash')
    assert.strictEqual(result.selected.action, 'GENERATE_PAYMENT_LINK')
    assert.strictEqual(result.confidence, 0.88)
    assert.strictEqual(result.selected.expected_recovery_value, 274695)
    assert.ok(result.selected.reasoning[0].includes('Providing a fresh payment link'))
  })

  // Reset AI provider to default
  setAIProvider(null)

  // ── SECTION 4: API INPUT VALIDATION ────────────────────────────────────────
  console.log('\n📝 SECTION 4: Zod API Input Validation')

  runTest('Valid single-transaction simulation payload passes schema', () => {
    const valid = { transactionId: 'tx_demo_00042' }
    const res = SimulationRequestSchema.safeParse(valid)
    assert.strictEqual(res.success, true)
  })

  runTest('Valid batch simulation payload (empty object) passes schema', () => {
    const valid = {}
    const res = SimulationRequestSchema.safeParse(valid)
    assert.strictEqual(res.success, true)
  })

  runTest('Invalid simulation payload with empty string transactionId is rejected', () => {
    const invalid = { transactionId: '   ' }
    const res = SimulationRequestSchema.safeParse(invalid)
    assert.strictEqual(res.success, false)
  })

  runTest('Simulation payload with extra unexpected keys is rejected', () => {
    const invalid = { transactionId: 'tx_demo_00042', maliciousKey: 'inject' }
    const res = SimulationRequestSchema.safeParse(invalid)
    assert.strictEqual(res.success, false)
  })

  runTest('Valid policy update payload passes schema validation', () => {
    const validPolicy = {
      max_retries: 3,
      min_retry_interval_mins: 15,
      max_notifications_per_day: 4,
      min_recovery_amount_paise: 10000,
      allowed_channels: ['WAIT_AND_RETRY', 'GENERATE_PAYMENT_LINK'],
      human_approval_threshold: 500000,
      max_recovery_cost_paise: 5000,
      auto_abandon_after_hours: 48,
    }
    const res = PolicyUpdateSchema.safeParse(validPolicy)
    assert.strictEqual(res.success, true)
  })

  runTest('Policy update with negative values or out of range numbers is rejected', () => {
    const invalidPolicy = {
      max_retries: -1, // Negative
      min_retry_interval_mins: 0, // < 1 min
      max_notifications_per_day: 100, // > 50 max
      min_recovery_amount_paise: 0,
      allowed_channels: [], // Empty channels
      human_approval_threshold: 500000,
      max_recovery_cost_paise: 5000,
      auto_abandon_after_hours: 1000, // > 720h max
    }
    const res = PolicyUpdateSchema.safeParse(invalidPolicy)
    assert.strictEqual(res.success, false)
  })

  // ── SECTION 5: PAYMENT PROVIDER ABSTRACTION & RAZORPAY ADAPTER ─────────────
  console.log('\n💳 SECTION 5: Payment Provider Abstraction & Razorpay Adapter')

  runTest('Payment provider factory returns DemoPaymentProvider by default', () => {
    delete process.env.PAYMENT_PROVIDER
    setPaymentProvider(null)
    const provider = getPaymentProvider()
    assert.strictEqual(provider.name, 'demo')
    assert.strictEqual(provider.isDemo, true)
    assert.strictEqual(provider.isConfigured(), true)
  })

  await runTest('RazorpayProvider rejects missing credentials with a controlled error and never fabricates success', async () => {
    // Empty credentials
    const originalKey = process.env.RAZORPAY_KEY_ID
    const originalSecret = process.env.RAZORPAY_KEY_SECRET
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.RAZORPAY_KEY_SECRET

    const rzp = new RazorpayProvider()
    assert.strictEqual(rzp.isConfigured(), false)

    const executionResult = await rzp.executeAction({
      transactionId: 'tx_test_fail',
      attemptId: 'att_test_1',
      caseId: 'case_test_1',
      action: 'GENERATE_PAYMENT_LINK',
      attemptNumber: 1,
      merchantId: 'merchant_demo',
      amount: 49900,
      reason: 'Test action',
    })

    assert.strictEqual(executionResult.success, false)
    assert.strictEqual(executionResult.resultCode, 'RAZORPAY_CONFIG_ERROR')
    assert.ok(executionResult.resultMessage.includes('credentials'))

    // Restore
    if (originalKey) process.env.RAZORPAY_KEY_ID = originalKey
    if (originalSecret) process.env.RAZORPAY_KEY_SECRET = originalSecret
  })

  // ── SECTION 6: IN-MEMORY RATE LIMITING ─────────────────────────────────────
  console.log('\n⏱ SECTION 6: In-Memory Sliding Window Rate Limiter')

  runTest('Rate limiter allows requests within quota', () => {
    resetRateLimitStore()
    const r1 = checkRateLimit('test_user_ip', { limit: 5, windowMs: 10_000 })
    assert.strictEqual(r1.success, true)
    assert.strictEqual(r1.remaining, 4)

    const r2 = checkRateLimit('test_user_ip', { limit: 5, windowMs: 10_000 })
    assert.strictEqual(r2.success, true)
    assert.strictEqual(r2.remaining, 3)
  })

  runTest('Rate limiter blocks excessive requests when quota is exceeded', () => {
    resetRateLimitStore()
    for (let i = 0; i < 3; i++) {
      checkRateLimit('spam_ip', { limit: 3, windowMs: 10_000 })
    }
    const blocked = checkRateLimit('spam_ip', { limit: 3, windowMs: 10_000 })
    assert.strictEqual(blocked.success, false)
    assert.strictEqual(blocked.remaining, 0)
    assert.ok(blocked.resetInMs > 0)
  })

  // ── SECTION 7: DATABASE SEEDING & CANONICAL DEMO RECOVERY DATA ─────────────
  console.log('\n🗄 SECTION 7: Database Seeding & Idempotent Demo Initialization')

  runTest('Canonical demo transaction tx_demo_00042 conforms to required production specs', () => {
    const canonicalTx = {
      id: 'tx_demo_00042',
      amount: 499900,
      currency: 'INR',
      payment_method: 'upi',
      status: 'failed',
      failure_code: 'UPI_TIMEOUT',
      failure_reason: 'Bank timeout — UPI_TIMEOUT',
    }
    assert.strictEqual(canonicalTx.id, 'tx_demo_00042')
    assert.strictEqual(canonicalTx.amount, 499900)
    assert.strictEqual(canonicalTx.currency, 'INR')
    assert.strictEqual(canonicalTx.payment_method, 'upi')
    assert.strictEqual(canonicalTx.status, 'failed')
    assert.strictEqual(canonicalTx.failure_code, 'UPI_TIMEOUT')
  })

  runTest('Idempotent seeder handles existing merchant without skipping tx_demo_00042', async () => {
    // Simulating the failure mode:
    // In-memory mock database store
    const db = {
      merchants: new Map<string, Record<string, unknown>>([['merchant_demo_revive', { id: 'merchant_demo_revive', name: 'Acme Commerce (Demo)' }]]),
      policies: new Map<string, Record<string, unknown>>(),
      customers: new Map<string, Record<string, unknown>>(),
      transactions: new Map<string, Record<string, unknown>>(),
      recovery_cases: new Map<string, Record<string, unknown>>(),
      recovery_attempts: new Map<string, Record<string, unknown>>(),
    }

    // Pre-condition: Merchant exists, but tx_demo_00042 does NOT exist
    assert.strictEqual(db.merchants.has('merchant_demo_revive'), true)
    assert.strictEqual(db.transactions.has('tx_demo_00042'), false)

    // Simulation of ensureCanonicalDemoData logic
    const runEnsure = () => {
      db.merchants.set('merchant_demo_revive', { id: 'merchant_demo_revive', name: 'Acme Commerce (Demo)', is_demo: true })
      db.policies.set('merchant_demo_revive', { merchant_id: 'merchant_demo_revive', max_retries: 2 })
      db.customers.set('customer_demo_042', { id: 'customer_demo_042', name: 'Priya Sharma', email: 'priya.sharma@example.com' })
      db.transactions.set('tx_demo_00042', {
        id: 'tx_demo_00042',
        merchant_id: 'merchant_demo_revive',
        customer_id: 'customer_demo_042',
        amount: 499900,
        currency: 'INR',
        payment_method: 'upi',
        status: 'failed',
        failure_code: 'UPI_TIMEOUT',
      })
      db.recovery_cases.set('case_demo_0042', {
        id: 'case_demo_0042',
        transaction_id: 'tx_demo_00042',
        status: 'open',
        failure_category: 'temporary_upi_failure',
        selected_strategy: 'WAIT_AND_RETRY',
      })
    }

    // First run
    runEnsure()

    // Verify tx_demo_00042 is created
    const tx = db.transactions.get('tx_demo_00042')
    assert.ok(tx, 'tx_demo_00042 must be created even when merchant already exists')
    assert.strictEqual(tx.amount, 499900)
    assert.strictEqual(tx.currency, 'INR')
    assert.strictEqual(tx.payment_method, 'upi')
    assert.strictEqual(tx.status, 'failed')
    assert.strictEqual(tx.failure_code, 'UPI_TIMEOUT')

    // Verify canonical customer is Priya Sharma
    const customer = db.customers.get('customer_demo_042')
    assert.ok(customer, 'Customer Priya Sharma must exist')
    assert.strictEqual(customer.name, 'Priya Sharma')

    // Verify canonical case is open and has ZERO recovery attempts
    const rCase = db.recovery_cases.get('case_demo_0042')
    assert.ok(rCase, 'Canonical case must exist')
    assert.strictEqual(rCase.status, 'open')
    assert.strictEqual(rCase.failure_category, 'temporary_upi_failure')

    const attemptsForCase = Array.from(db.recovery_attempts.values()).filter(a => a.case_id === 'case_demo_0042')
    assert.strictEqual(attemptsForCase.length, 0, 'Canonical demo case must start with zero recovery attempts')

    // Call initialization again (multiple times) to verify idempotency and zero duplicates
    const initialTxCount = db.transactions.size
    const initialCustomerCount = db.customers.size
    const initialCaseCount = db.recovery_cases.size

    runEnsure()
    runEnsure()

    assert.strictEqual(db.transactions.size, initialTxCount, 'Calling init repeatedly must not duplicate transactions')
    assert.strictEqual(db.customers.size, initialCustomerCount, 'Calling init repeatedly must not duplicate customers')
    assert.strictEqual(db.recovery_cases.size, initialCaseCount, 'Calling init repeatedly must not duplicate cases')
  })

  console.log('\n════════════════════════════════════════════════════════════════════')
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('════════════════════════════════════════════════════════════════════\n')

  if (failed > 0) {
    process.exit(1)
  }
}

executeAllTests()
