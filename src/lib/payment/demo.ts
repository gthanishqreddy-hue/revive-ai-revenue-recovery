// DEMO PAYMENT PROVIDER
// Simulates payment actions deterministically for the demo/hackathon environment
//
// ARCHITECTURE: implements the same interface as RazorpayProvider.
// Switching to real Razorpay is a single line change: new RazorpayProvider()
//
// WHY: Allows a complete end-to-end demo without real money.
// The demo is clearly labeled — we never claim these are real Razorpay transactions.

import type { RecoveryAction, AttemptStatus } from '../types'
import type { ExecutionInput, ExecutionResult } from '../engine/executor'
import type { PaymentProvider } from './provider'

// Simulated success rates for demo actions — realistic, not 100%
const DEMO_SUCCESS_RATES: Record<RecoveryAction, number> = {
  RETRY_PAYMENT: 0.72,
  WAIT_AND_RETRY: 0.78,
  GENERATE_PAYMENT_LINK: 0.55,
  SEND_WHATSAPP: 0.48,
  SEND_EMAIL: 0.30,
  VOICE_CALL: 0.40,
  NO_ACTION: 0.0,
  ESCALATE_TO_HUMAN: 0.60,
}

// Simulated latency in ms — makes demo feel real
const DEMO_LATENCY: Record<RecoveryAction, number> = {
  RETRY_PAYMENT: 1200,
  WAIT_AND_RETRY: 800,
  GENERATE_PAYMENT_LINK: 400,
  SEND_WHATSAPP: 600,
  SEND_EMAIL: 300,
  VOICE_CALL: 1500,
  NO_ACTION: 100,
  ESCALATE_TO_HUMAN: 200,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class DemoPaymentProvider implements PaymentProvider {
  readonly name = 'demo'
  readonly isDemo = true

  isConfigured(): boolean {
    return true
  }

  async executeAction(input: ExecutionInput): Promise<ExecutionResult> {
    // Simulate realistic latency
    await sleep(DEMO_LATENCY[input.action] ?? 500)

    if (input.action === 'NO_ACTION') {
      return {
        success: false,
        status: 'no_response' as AttemptStatus,
        resultCode: 'NO_ACTION',
        resultMessage: 'No recovery action taken per engine decision',
      }
    }

    // Deterministic result based on transaction ID (not random) so same
    // transaction always produces the same outcome in demo — idempotency friendly
    const hashInput = `${input.transactionId}_${input.action}_${input.attemptNumber}`
    const hash = simpleHash(hashInput)
    const threshold = DEMO_SUCCESS_RATES[input.action] ?? 0.5

    // Special case: the canonical Command Center demo transaction (tx_demo_00042) is
    // guaranteed to succeed on WAIT_AND_RETRY attempt 1. Its hash lands exactly on
    // the boundary (78 % 100 = 78, strict < 78 = false), so without this override
    // it permanently fails and the demo can never show a successful recovery.
    const isCanonicalDemoSuccess =
      input.transactionId === 'tx_demo_00042' &&
      input.action === 'WAIT_AND_RETRY' &&
      input.attemptNumber === 1

    const isSuccess = isCanonicalDemoSuccess || (hash % 100) / 100 < threshold

    if (isSuccess) {
      return {
        success: true,
        status: 'success',
        resultCode: 'DEMO_SUCCESS',
        resultMessage: `[DEMO] ${getSuccessMessage(input.action)}`,
        amountRecovered: input.amount,
        externalReference: `demo_${input.transactionId}_ref`,
      }
    } else {
      return {
        success: false,
        status: 'failed',
        resultCode: 'DEMO_FAILED',
        resultMessage: `[DEMO] ${getFailureMessage(input.action)}`,
      }
    }
  }
}

// Simple deterministic hash — not cryptographic, just for consistent demo outcomes
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit int
  }
  return Math.abs(hash)
}

function getSuccessMessage(action: RecoveryAction): string {
  const messages: Record<RecoveryAction, string> = {
    RETRY_PAYMENT: 'Payment retry succeeded — transaction captured',
    WAIT_AND_RETRY: 'Deferred retry succeeded — payment captured',
    GENERATE_PAYMENT_LINK: 'Payment link generated and sent to customer',
    SEND_WHATSAPP: 'WhatsApp message delivered. Customer clicked payment link.',
    SEND_EMAIL: 'Email delivered successfully',
    VOICE_CALL: 'Customer answered and confirmed payment',
    NO_ACTION: 'No action taken',
    ESCALATE_TO_HUMAN: 'Case escalated to human recovery team',
  }
  return messages[action]
}

function getFailureMessage(action: RecoveryAction): string {
  const messages: Record<RecoveryAction, string> = {
    RETRY_PAYMENT: 'Retry payment failed — will attempt alternative strategy',
    WAIT_AND_RETRY: 'Deferred retry failed — payment still declined',
    GENERATE_PAYMENT_LINK: 'Payment link expired without customer action',
    SEND_WHATSAPP: 'WhatsApp delivery failed — number not registered',
    SEND_EMAIL: 'Email bounced — address may be invalid',
    VOICE_CALL: 'Customer did not answer — will retry via email',
    NO_ACTION: 'No action',
    ESCALATE_TO_HUMAN: 'Escalation failed — no available agent',
  }
  return messages[action]
}
