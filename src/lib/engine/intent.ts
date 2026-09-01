// CUSTOMER INTENT ENGINE
// Calculates how likely a customer is to successfully pay if given another chance
// Fully deterministic — based on behavioral signals only
//
// WHY: Not all failures are worth chasing. High-intent customers need
// a nudge. Low-intent customers will waste recovery budget and damage
// customer relationship if over-pursued.

import type { Customer, CustomerFeatures, IntentResult, IntentSignal } from '../types'

interface IntentInput {
  customer: Customer | null
  features: CustomerFeatures | null
  transactionAmount: number // paise
  failureCategory: string
}

export function calculateCustomerIntent(input: IntentInput): IntentResult {
  const { customer, features, transactionAmount, failureCategory } = input
  const signals: IntentSignal[] = []
  let totalWeight = 0
  let weightedScore = 0

  // ---- SIGNAL: Payment history ----
  if (customer && customer.total_payments > 0) {
    const successRate = customer.successful_payments / customer.total_payments
    const score = successRate * 100
    const weight = 25
    signals.push({
      signal: 'Payment success rate',
      value: `${Math.round(successRate * 100)}% (${customer.successful_payments}/${customer.total_payments} payments)`,
      weight,
      positive: successRate > 0.6,
    })
    weightedScore += score * weight
    totalWeight += weight
  }

  // ---- SIGNAL: Recent checkout attempts ----
  if (features?.checkout_attempts_30d !== undefined) {
    const attempts = features.checkout_attempts_30d
    const score = Math.min(100, attempts * 15 + 30) // 1 attempt = 45, 5+ = 100
    const weight = 20
    signals.push({
      signal: 'Checkout attempts (30d)',
      value: attempts,
      weight,
      positive: attempts >= 2,
    })
    weightedScore += score * weight
    totalWeight += weight
  }

  // ---- SIGNAL: Transaction amount relative to avg ----
  if (features?.avg_transaction_amount && features.avg_transaction_amount > 0) {
    const ratio = transactionAmount / features.avg_transaction_amount
    // If this transaction is near or below their typical spend, likely to retry
    const score = ratio <= 1.5 ? 80 : ratio <= 2.5 ? 60 : 40
    const weight = 15
    signals.push({
      signal: 'Amount vs. avg spend',
      value: ratio <= 1 ? 'Below average' : ratio <= 1.5 ? 'Near average' : 'Above average',
      weight,
      positive: ratio <= 1.5,
    })
    weightedScore += score * weight
    totalWeight += weight
  }

  // ---- SIGNAL: Recency of last payment ----
  if (features?.days_since_last_payment !== undefined) {
    const days = features.days_since_last_payment
    const score = days === 0 ? 100 : days <= 7 ? 90 : days <= 30 ? 70 : days <= 90 ? 50 : 30
    const weight = 15
    signals.push({
      signal: 'Days since last payment',
      value: days === 0 ? 'Today' : `${days} days`,
      weight,
      positive: days <= 30,
    })
    weightedScore += score * weight
    totalWeight += weight
  }

  // ---- SIGNAL: Historical recovery success ----
  if (features?.recovery_success_rate !== undefined && features.recovery_success_rate !== null) {
    const rate = features.recovery_success_rate
    const score = rate * 100
    const weight = 15
    signals.push({
      signal: 'Recovery success rate',
      value: `${Math.round(rate * 100)}%`,
      weight,
      positive: rate > 0.5,
    })
    weightedScore += score * weight
    totalWeight += weight
  }

  // ---- SIGNAL: Failure category intent modifier ----
  const categoryModifiers: Record<string, { modifier: number; signal: string }> = {
    temporary_upi_failure: { modifier: 10, signal: 'Failure is technical, not customer-initiated' },
    bank_timeout: { modifier: 10, signal: 'Bank timeout — customer likely willing to retry' },
    network_error: { modifier: 8, signal: 'Network issue — not customer fault' },
    checkout_abandoned: { modifier: -15, signal: 'Customer chose to abandon — intent uncertain' },
    insufficient_balance: { modifier: -20, signal: 'Insufficient balance — may not have funds' },
    fraud_block: { modifier: -30, signal: 'Fraud block — recovery not recommended' },
    card_declined: { modifier: 0, signal: 'Card decline — intent neutral' },
    payment_link_abandoned: { modifier: -5, signal: 'Payment link abandoned — some intent uncertainty' },
    subscription_failure: { modifier: 5, signal: 'Subscription failure — customer likely subscribed' },
    unknown: { modifier: 0, signal: 'Unknown failure — neutral intent' },
  }

  const mod = categoryModifiers[failureCategory] ?? categoryModifiers.unknown
  const weight = 10
  signals.push({
    signal: 'Failure type signal',
    value: mod.signal,
    weight,
    positive: mod.modifier >= 0,
  })
  // For this signal, apply modifier to the overall score directly
  const categoryScore = 50 + mod.modifier // baseline 50, adjusted
  weightedScore += Math.max(0, Math.min(100, categoryScore)) * weight
  totalWeight += weight

  // Calculate final score
  const rawScore = totalWeight > 0 ? weightedScore / totalWeight : 50
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)))

  return {
    score: finalScore,
    signals,
    high_value: (features?.high_value_customer ?? false) || (customer?.total_spent ?? 0) > 1000000,
    confidence: Math.min(1, totalWeight / 100), // More signals = more confidence
  }
}
