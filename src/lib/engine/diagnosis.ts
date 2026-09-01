// DIAGNOSIS ENGINE
// Analyzes a failed transaction and produces a structured diagnosis
// Uses deterministic rules (always available) + AI enhancement (when available)
//
// WHY: The diagnosis is the foundation of every recovery decision.
// A misdiagnosis leads to wrong strategy selection. Deterministic rules
// are the safety floor — the AI adds nuance and reasoning on top.

import type { Transaction, Customer, CustomerFeatures, DiagnosisResult, FailureCategory, Severity } from '../types'

// Failure code to category mapping — deterministic, always correct
const FAILURE_CODE_MAP: Record<string, { category: FailureCategory; isPermanent: boolean; waitMinutes: number }> = {
  UPI_TIMEOUT: { category: 'temporary_upi_failure', isPermanent: false, waitMinutes: 15 },
  BANK_TIMEOUT: { category: 'bank_timeout', isPermanent: false, waitMinutes: 15 },
  BANK_MAINTENANCE: { category: 'bank_timeout', isPermanent: false, waitMinutes: 60 },
  CARD_DECLINED: { category: 'card_declined', isPermanent: false, waitMinutes: 0 },
  INSUFFICIENT_BALANCE: { category: 'insufficient_balance', isPermanent: false, waitMinutes: 1440 }, // 24h
  PAYMENT_CANCELLED: { category: 'checkout_abandoned', isPermanent: false, waitMinutes: 5 },
  NETWORK_ERROR: { category: 'network_error', isPermanent: false, waitMinutes: 5 },
  FRAUD_BLOCKED: { category: 'fraud_block', isPermanent: true, waitMinutes: 0 },
  UPI_LINK_EXPIRED: { category: 'payment_link_abandoned', isPermanent: false, waitMinutes: 0 },
  VPA_INVALID: { category: 'temporary_upi_failure', isPermanent: false, waitMinutes: 0 },
  SUBSCRIPTION_FAILED: { category: 'subscription_failure', isPermanent: false, waitMinutes: 30 },
}

// Recoverability baseline by category
const CATEGORY_BASE_RECOVERABILITY: Record<FailureCategory, number> = {
  temporary_upi_failure: 0.78,
  bank_timeout: 0.72,
  card_declined: 0.55,
  insufficient_balance: 0.20,
  payment_link_abandoned: 0.62,
  subscription_failure: 0.45,
  checkout_abandoned: 0.58,
  fraud_block: 0.02, // Essentially unrecoverable — don't retry
  network_error: 0.80,
  unknown: 0.35,
}

function calculateSeverity(amount: number, recoverability: number): Severity {
  // High value + high recoverability = critical (worth investing in)
  if (amount >= 500000 && recoverability > 0.6) return 'critical'
  if (amount >= 100000 || recoverability > 0.7) return 'high'
  if (amount >= 10000 || recoverability > 0.4) return 'medium'
  return 'low'
}

function adjustRecoverability(
  base: number,
  customer: Customer | null,
  features: CustomerFeatures | null
): number {
  let score = base

  if (customer) {
    // More successful payments = higher trust = better recoverability
    const successRate = customer.total_payments > 0
      ? customer.successful_payments / customer.total_payments
      : 0.5
    score += (successRate - 0.5) * 0.15

    // High-value customers get more recovery effort
    if (customer.total_spent > 1000000) score += 0.05
  }

  if (features) {
    // Recent checkout activity indicates intent
    if (features.checkout_attempts_30d > 3) score += 0.05
    // Historical recovery success rate
    if (features.recovery_success_rate !== undefined && features.recovery_success_rate !== null) {
      score += (features.recovery_success_rate - 0.5) * 0.10
    }
    // Recent activity indicates active customer
    if ((features.days_since_last_payment ?? 999) < 7) score += 0.03
  }

  // Clamp to valid range
  return Math.min(0.97, Math.max(0.02, score))
}

export function diagnoseTransaction(
  transaction: Transaction,
  customer: Customer | null,
  features: CustomerFeatures | null
): DiagnosisResult {
  const failureCode = transaction.failure_code ?? 'UNKNOWN'
  const mapping = FAILURE_CODE_MAP[failureCode]

  const category: FailureCategory = mapping?.category ?? 'unknown'
  const isPermanent = mapping?.isPermanent ?? false
  const waitMinutes = mapping?.waitMinutes

  const baseRecoverability = CATEGORY_BASE_RECOVERABILITY[category]
  const adjustedRecoverability = isPermanent
    ? 0.02 // Near-zero for permanent failures
    : adjustRecoverability(baseRecoverability, customer, features)

  const severity = calculateSeverity(transaction.amount, adjustedRecoverability)

  const reason = buildReason(category, isPermanent, adjustedRecoverability, customer, features)

  return {
    failure_category: category,
    severity,
    recoverability: Math.round(adjustedRecoverability * 100) / 100,
    reason,
    is_permanent: isPermanent,
    recommended_wait_minutes: waitMinutes,
  }
}

function buildReason(
  category: FailureCategory,
  isPermanent: boolean,
  recoverability: number,
  customer: Customer | null,
  features: CustomerFeatures | null
): string {
  const parts: string[] = []

  const categoryDescriptions: Record<FailureCategory, string> = {
    temporary_upi_failure: 'Temporary UPI infrastructure failure',
    bank_timeout: 'Bank server timeout — transient error',
    card_declined: 'Card issuer declined the transaction',
    insufficient_balance: 'Customer account has insufficient balance',
    payment_link_abandoned: 'Payment link was not completed before expiry',
    subscription_failure: 'Subscription mandate execution failed',
    checkout_abandoned: 'Customer abandoned checkout before completion',
    fraud_block: 'Transaction blocked by fraud detection system',
    network_error: 'Network connectivity failure during transaction',
    unknown: 'Failure reason could not be determined',
  }

  parts.push(categoryDescriptions[category])

  if (isPermanent) {
    parts.push('This failure type is typically permanent — recovery is not recommended')
  } else {
    parts.push(`Recoverability score: ${Math.round(recoverability * 100)}%`)
    if (recoverability > 0.7) parts.push('High probability of recovery with correct intervention')
    if (recoverability < 0.3) parts.push('Low recovery probability — conservative action preferred')
  }

  if (customer) {
    const successRate = customer.total_payments > 0
      ? Math.round((customer.successful_payments / customer.total_payments) * 100)
      : 50
    parts.push(`Customer has ${customer.total_payments} payments with ${successRate}% success rate`)
  }

  if (features?.checkout_attempts_30d && features.checkout_attempts_30d > 2) {
    parts.push(`Active buyer: ${features.checkout_attempts_30d} checkout attempts in last 30 days`)
  }

  return parts.join('\n')
}
