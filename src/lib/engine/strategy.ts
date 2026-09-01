// RECOVERY STRATEGY ENGINE
// Evaluates all available recovery actions and selects the optimal one
// based on Expected Recovery Value calculation
//
// Expected Recovery Value = (P_success × Amount) - ActionCost - FrictionPenalty
//
// WHY: This is the core differentiator. We don't just pick a strategy —
// we compare all strategies quantitatively and choose the highest-value one
// that also respects policy constraints.

import type {
  RecoveryAction,
  FailureCategory,
  StrategyEvaluation,
  StrategySelectionResult,
  PaymentMethod,
} from '../types'

interface StrategyInput {
  failureCategory: FailureCategory
  paymentMethod: PaymentMethod
  amount: number           // paise
  recoverability: number   // 0-1 from diagnosis
  intentScore: number      // 0-100 from intent engine
  previousAttempts: number
  allowedActions: RecoveryAction[]
  waitMinutes?: number     // recommended wait from diagnosis
}

// Base success probabilities by action type and failure category
// Derived from heuristic fintech knowledge (in production: learned from outcomes)
const ACTION_SUCCESS_PROBS: Record<RecoveryAction, Record<string, number>> = {
  RETRY_PAYMENT: {
    temporary_upi_failure: 0.70,
    bank_timeout: 0.68,
    card_declined: 0.35,
    network_error: 0.72,
    checkout_abandoned: 0.20,
    default: 0.40,
  },
  WAIT_AND_RETRY: {
    temporary_upi_failure: 0.78,
    bank_timeout: 0.75,
    card_declined: 0.40,
    network_error: 0.80,
    bank_maintenance: 0.70,
    default: 0.45,
  },
  GENERATE_PAYMENT_LINK: {
    checkout_abandoned: 0.55,
    payment_link_abandoned: 0.45,
    card_declined: 0.50,
    insufficient_balance: 0.25,
    default: 0.42,
  },
  SEND_WHATSAPP: {
    checkout_abandoned: 0.48,
    payment_link_abandoned: 0.40,
    subscription_failure: 0.45,
    default: 0.35,
  },
  SEND_EMAIL: {
    checkout_abandoned: 0.30,
    payment_link_abandoned: 0.28,
    subscription_failure: 0.32,
    default: 0.22,
  },
  VOICE_CALL: {
    insufficient_balance: 0.35,
    subscription_failure: 0.40,
    default: 0.30,
  },
  NO_ACTION: {
    default: 0.0,
  },
  ESCALATE_TO_HUMAN: {
    fraud_block: 0.15,
    default: 0.25,
  },
}

// Action costs in paise (operational cost to merchant)
const ACTION_COSTS: Record<RecoveryAction, number> = {
  RETRY_PAYMENT: 0,        // No direct cost
  WAIT_AND_RETRY: 0,       // Just time
  GENERATE_PAYMENT_LINK: 50,  // ₹0.50 link generation cost
  SEND_WHATSAPP: 100,      // ₹1 WhatsApp API cost
  SEND_EMAIL: 10,          // ₹0.10 email cost
  VOICE_CALL: 500,         // ₹5 voice call cost
  NO_ACTION: 0,
  ESCALATE_TO_HUMAN: 2000, // ₹20 human agent time
}

// Customer friction penalty — higher means more annoying to the customer
// Friction is converted to a rupee penalty: high friction on a failed recovery
// means we've damaged goodwill for future transactions
const ACTION_FRICTION: Record<RecoveryAction, number> = {
  RETRY_PAYMENT: 50,       // Low friction — transparent to customer
  WAIT_AND_RETRY: 10,      // Very low — customer doesn't even know
  GENERATE_PAYMENT_LINK: 200,  // Medium — requires customer action
  SEND_WHATSAPP: 300,      // Medium-high — interrupts customer
  SEND_EMAIL: 100,         // Low — passive notification
  VOICE_CALL: 800,         // High — very interruptive
  NO_ACTION: 0,
  ESCALATE_TO_HUMAN: 500,
}

function getSuccessProb(action: RecoveryAction, category: FailureCategory): number {
  const probs = ACTION_SUCCESS_PROBS[action]
  return probs[category] ?? probs['default'] ?? 0
}

function evaluateAction(
  action: RecoveryAction,
  input: StrategyInput
): StrategyEvaluation {
  const { failureCategory, amount, recoverability, intentScore, previousAttempts } = input

  // Base probability from action × category combination
  let baseProb = getSuccessProb(action, failureCategory)

  // Adjust by recoverability score from diagnosis
  baseProb = baseProb * (0.5 + recoverability * 0.5)

  // Adjust by customer intent (0-100 → 0.6-1.1 multiplier)
  const intentMultiplier = 0.6 + (intentScore / 100) * 0.5
  baseProb = baseProb * intentMultiplier

  // Diminishing returns with each attempt
  if (previousAttempts > 0) {
    baseProb = baseProb * Math.pow(0.75, previousAttempts)
  }

  // Clamp
  const probability = Math.min(0.95, Math.max(0.01, baseProb))

  const cost = ACTION_COSTS[action]
  const friction = ACTION_FRICTION[action]

  // Expected Recovery Value = (P × Amount) - Cost - Friction
  const expectedRecoveryValue = Math.max(0, (probability * amount) - cost - friction)

  const reasoning = buildStrategyReasoning(action, failureCategory, probability, expectedRecoveryValue)

  return {
    action,
    probability_of_success: Math.round(probability * 100) / 100,
    action_cost_paise: cost,
    customer_friction_penalty: friction,
    expected_recovery_value: Math.round(expectedRecoveryValue),
    reasoning,
    estimated_wait_minutes: action === 'WAIT_AND_RETRY' ? (input.waitMinutes ?? 15) : undefined,
  }
}

function buildStrategyReasoning(
  action: RecoveryAction,
  category: FailureCategory,
  probability: number,
  expectedValue: number
): string[] {
  const reasons: string[] = []

  const actionDescriptions: Record<RecoveryAction, string> = {
    RETRY_PAYMENT: 'Immediate payment retry via same method',
    WAIT_AND_RETRY: 'Retry after recommended wait period to allow transient issues to resolve',
    GENERATE_PAYMENT_LINK: 'Generate fresh payment link — allows customer to use any preferred method',
    SEND_WHATSAPP: 'Send personalized WhatsApp message with payment link',
    SEND_EMAIL: 'Send email reminder with secure payment link',
    VOICE_CALL: 'Outbound voice call to assist with payment',
    NO_ACTION: 'No recovery action — failure type indicates recovery is unlikely',
    ESCALATE_TO_HUMAN: 'Escalate to human agent for manual intervention',
  }

  reasons.push(actionDescriptions[action])
  reasons.push(`Success probability: ${Math.round(probability * 100)}% for ${category}`)
  reasons.push(`Expected recovery value: ₹${Math.floor(expectedValue / 100).toLocaleString('en-IN')}`)

  if (action === 'WAIT_AND_RETRY') {
    reasons.push('Waiting increases success probability for transient failures')
  }
  if (action === 'VOICE_CALL') {
    reasons.push('High friction — only recommended for high-value transactions')
  }

  return reasons
}

export function selectRecoveryStrategy(input: StrategyInput): StrategySelectionResult {
  const { allowedActions } = input

  // Evaluate all allowed actions
  const evaluations: StrategyEvaluation[] = allowedActions.map((action) =>
    evaluateAction(action, input)
  )

  // Sort by expected recovery value — highest first
  evaluations.sort((a, b) => b.expected_recovery_value - a.expected_recovery_value)

  const selected = evaluations[0]
  const alternatives = evaluations.slice(1)

  // Confidence is derived from the gap between first and second best
  let confidence = 0.8
  if (alternatives.length > 0) {
    const gap = selected.expected_recovery_value - (alternatives[0]?.expected_recovery_value ?? 0)
    const relativeGap = gap / (selected.expected_recovery_value || 1)
    confidence = Math.min(0.99, 0.6 + relativeGap * 0.4)
  }

  return {
    selected,
    alternatives,
    model_used: 'deterministic-erv-optimizer',
    confidence: Math.round(confidence * 100) / 100,
  }
}
