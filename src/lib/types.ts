// Central type definitions for REVIVE
// These match the database schema exactly

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet'
export type TransactionStatus = 'created' | 'attempted' | 'failed' | 'captured' | 'refunded'
export type RecoveryCaseStatus =
  | 'open'
  | 'diagnosing'
  | 'strategy_selected'
  | 'executing'
  | 'recovering'
  | 'recovered'
  | 'failed'
  | 'abandoned'
  | 'no_action'

export type RecoveryAction =
  | 'RETRY_PAYMENT'
  | 'GENERATE_PAYMENT_LINK'
  | 'SEND_WHATSAPP'
  | 'SEND_EMAIL'
  | 'VOICE_CALL'
  | 'WAIT_AND_RETRY'
  | 'NO_ACTION'
  | 'ESCALATE_TO_HUMAN'

export type FailureCategory =
  | 'temporary_upi_failure'
  | 'bank_timeout'
  | 'card_declined'
  | 'insufficient_balance'
  | 'payment_link_abandoned'
  | 'subscription_failure'
  | 'checkout_abandoned'
  | 'fraud_block'
  | 'network_error'
  | 'unknown'

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type AttemptStatus = 'pending' | 'executing' | 'success' | 'failed' | 'expired' | 'declined' | 'no_response'
export type AgentType = 'diagnosis' | 'intent' | 'strategy' | 'policy' | 'outcome'
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface Merchant {
  id: string
  name: string
  email: string
  api_key: string
  is_demo: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  merchant_id: string
  external_id?: string
  name: string
  email?: string
  phone?: string
  total_payments: number
  successful_payments: number
  failed_payments: number
  total_spent: number // paise
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  merchant_id: string
  customer_id?: string
  external_id?: string
  amount: number // paise
  currency: string
  payment_method: PaymentMethod
  status: TransactionStatus
  failure_code?: string
  failure_reason?: string
  gateway_error?: string
  metadata?: string // JSON
  created_at: string
  updated_at: string
}

export interface PaymentEvent {
  id: string
  merchant_id: string
  transaction_id?: string
  event_type: string
  payload: string // JSON
  idempotency_key: string
  processed: boolean
  source: 'webhook' | 'demo' | 'simulation'
  created_at: string
}

export interface RecoveryCase {
  id: string
  merchant_id: string
  transaction_id: string
  customer_id?: string
  status: RecoveryCaseStatus
  failure_category?: FailureCategory
  severity?: Severity
  recoverability_score?: number // 0-1
  intent_score?: number // 0-1
  expected_recovery?: number // paise
  actual_recovery?: number // paise
  selected_strategy?: RecoveryAction
  diagnosis_reason?: string
  created_at: string
  updated_at: string
  resolved_at?: string
}

export interface RecoveryAttempt {
  id: string
  case_id: string
  attempt_number: number
  strategy: RecoveryAction
  status: AttemptStatus
  result_code?: string
  result_message?: string
  amount_recovered?: number // paise
  started_at: string
  completed_at?: string
  idempotency_key: string
}

export interface RecoveryActionRecord {
  id: string
  attempt_id: string
  action_type: RecoveryAction
  payload?: string // JSON
  response?: string // JSON
  status: AttemptStatus
  executed_at?: string
  idempotency_key: string
}

export interface AgentDecision {
  id: string
  case_id: string
  agent_type: AgentType
  input_summary: string // JSON
  decision: string // JSON
  confidence?: number
  reasoning?: string
  model_used?: string
  latency_ms?: number
  created_at: string
}

export interface AgentRun {
  id: string
  case_id: string
  stage: string
  status: 'running' | 'completed' | 'failed' | 'skipped'
  duration_ms?: number
  notes?: string
  created_at: string
}

export interface CustomerFeatures {
  customer_id: string
  avg_transaction_amount?: number
  preferred_payment_method?: PaymentMethod
  checkout_attempts_30d: number
  recovery_success_rate?: number
  days_since_last_payment?: number
  payment_frequency_score?: number
  high_value_customer: boolean
  updated_at: string
}

export interface Policy {
  id: string
  merchant_id: string
  max_retries: number
  min_retry_interval_mins: number
  max_notifications_per_day: number
  min_recovery_amount_paise: number
  allowed_channels: RecoveryAction[]
  human_approval_threshold: number // paise
  max_recovery_cost_paise: number
  auto_abandon_after_hours: number
  updated_at: string
}

export interface AuditLog {
  id: string
  merchant_id?: string
  actor: 'system' | 'agent' | 'user' | 'webhook'
  event: string
  entity_type?: string
  entity_id?: string
  details?: string // JSON
  severity: AuditSeverity
  created_at: string
}

// ============================================================
// Engine output types — what each module produces
// ============================================================

export interface DiagnosisResult {
  failure_category: FailureCategory
  severity: Severity
  recoverability: number // 0-1
  reason: string
  is_permanent: boolean
  recommended_wait_minutes?: number
}

export interface IntentResult {
  score: number // 0-100
  signals: IntentSignal[]
  high_value: boolean
  confidence: number
}

export interface IntentSignal {
  signal: string
  value: string | number
  weight: number // contribution to score
  positive: boolean
}

export interface StrategyEvaluation {
  action: RecoveryAction
  probability_of_success: number
  action_cost_paise: number
  customer_friction_penalty: number
  expected_recovery_value: number // (prob * amount) - cost - friction
  reasoning: string[]
  estimated_wait_minutes?: number
}

export interface StrategySelectionResult {
  selected: StrategyEvaluation
  alternatives: StrategyEvaluation[]
  model_used: string
  confidence: number
}

export interface PolicyValidationResult {
  allowed: boolean
  violations: string[]
  warnings: string[]
  requires_human_approval: boolean
}

export interface RecoveryDecision {
  case_id: string
  action: RecoveryAction
  confidence: number
  reasoning: string[]
  expected_recovery_value: number
  policy_validated: boolean
  strategy_evaluation: StrategyEvaluation
  model_used: string
}

export interface OutcomeResult {
  recovered: boolean
  amount_recovered: number // paise
  status: AttemptStatus
  recovery_latency_ms: number
  cost_per_recovery: number
}

// ============================================================
// Dashboard / Analytics aggregates
// ============================================================

export interface DashboardMetrics {
  revenue_at_risk: number // paise
  recoverable: number
  recovered: number
  recovery_rate: number // 0-100
  actions_executed: number
  open_cases: number
  avg_recovery_latency_ms: number
  top_failure_category: FailureCategory
}

export interface RecoveryByMethod {
  method: PaymentMethod
  total_cases: number
  recovered_cases: number
  recovered_amount: number
  recovery_rate: number
}

export interface RecoveryByAction {
  action: RecoveryAction
  total_attempts: number
  successful: number
  success_rate: number
  avg_recovery_amount: number
}
