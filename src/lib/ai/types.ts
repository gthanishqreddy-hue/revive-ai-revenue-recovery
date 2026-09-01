// AI Provider Types and Zod Validation Schemas
// For REVIVE Autonomous AI Revenue Recovery

import { z } from 'zod'
import type { FailureCategory, PaymentMethod, RecoveryAction, StrategyEvaluation } from '../types'

// ── Context sent to AI (sanitized — NO sensitive credentials or PII) ────────

export interface RecoveryAIContext {
  transactionId: string
  amountPaise: number
  currency: string
  paymentMethod: PaymentMethod
  failureCode?: string
  failureCategory: FailureCategory
  diagnosisReason: string
  recoverabilityScore: number // 0-1
  isPermanentFailure: boolean
  customerIntentScore: number // 0-100
  customerIntentConfidence: number
  customerSignalsSummary: string[]
  isHighValueCustomer: boolean
  customerTotalPayments: number
  customerSuccessfulPayments: number
  previousAttemptsCount: number
  previousStrategies: RecoveryAction[]
  candidateStrategies: {
    action: RecoveryAction
    probabilityOfSuccess: number
    actionCostPaise: number
    customerFrictionPenalty: number
    expectedRecoveryValuePaise: number
    reasoning: string[]
  }[]
  policyMaxRetries: number
  policyAllowedChannels: RecoveryAction[]
}

// ── Zod Schema for Structured AI Decision ───────────────────────────────────

export const AIDecisionSchema = z.object({
  recommended_action: z.enum([
    'RETRY_PAYMENT',
    'GENERATE_PAYMENT_LINK',
    'SEND_WHATSAPP',
    'SEND_EMAIL',
    'VOICE_CALL',
    'WAIT_AND_RETRY',
    'NO_ACTION',
    'ESCALATE_TO_HUMAN',
  ]),
  confidence: z.number().min(0).max(1),
  reason_codes: z.array(z.string()).min(1),
  reasoning: z.string().min(10),
})

export type AIDecision = z.infer<typeof AIDecisionSchema>

// ── Analysis Result returned by AI Provider ─────────────────────────────────

export interface AIAnalysisResult {
  success: boolean
  decision?: AIDecision
  modelUsed: string
  rawResponse?: string
  error?: string
  latencyMs: number
  fallbackReason?: string
}
