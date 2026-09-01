// POLICY GUARD
// The deterministic safety boundary between AI decisions and action execution
//
// ARCHITECTURE CRITICAL: The AI proposes. The Policy Guard decides if execution is allowed.
// No payment action can bypass this guard.
//
// WHY: LLMs can produce unexpected outputs. Business rules must be enforced
// deterministically, not trusted to the model's good judgment.

import type {
  Policy,
  RecoveryAction,
  RecoveryAttempt,
  Transaction,
  PolicyValidationResult,
} from '../types'

interface PolicyGuardInput {
  policy: Policy
  action: RecoveryAction
  transaction: Transaction
  previousAttempts: RecoveryAttempt[]
  notificationsToday: number
  isPermanentFailure: boolean
  proposedByAI: boolean
}

export function validateAgainstPolicy(input: PolicyGuardInput): PolicyValidationResult {
  const { policy, action, transaction, previousAttempts, notificationsToday, isPermanentFailure } = input

  const violations: string[] = []
  const warnings: string[] = []
  let requiresHumanApproval = false

  // ---- RULE 1: Never retry permanently failed transactions ----
  if (isPermanentFailure && (action === 'RETRY_PAYMENT' || action === 'WAIT_AND_RETRY')) {
    violations.push('Cannot retry a permanently failed transaction (fraud block or permanent decline)')
  }

  // ---- RULE 2: Maximum retry attempts ----
  const retryAttempts = previousAttempts.filter(
    (a) => a.strategy === 'RETRY_PAYMENT' || a.strategy === 'WAIT_AND_RETRY'
  )
  if ((action === 'RETRY_PAYMENT' || action === 'WAIT_AND_RETRY') && retryAttempts.length >= policy.max_retries) {
    violations.push(
      `Maximum retries exceeded (${retryAttempts.length}/${policy.max_retries}). Policy limit reached.`
    )
  }

  // ---- RULE 3: Minimum retry interval ----
  if (action === 'RETRY_PAYMENT' && previousAttempts.length > 0) {
    const lastAttempt = previousAttempts[previousAttempts.length - 1]
    if (lastAttempt.started_at) {
      const lastAttemptTime = new Date(lastAttempt.started_at).getTime()
      const minutesSinceLast = (Date.now() - lastAttemptTime) / (1000 * 60)
      if (minutesSinceLast < policy.min_retry_interval_mins) {
        violations.push(
          `Retry too soon. Must wait ${policy.min_retry_interval_mins} minutes between retries. ` +
          `Last attempt was ${Math.floor(minutesSinceLast)} minutes ago.`
        )
      }
    }
  }

  // ---- RULE 4: Maximum notifications per day ----
  const notificationActions: RecoveryAction[] = ['SEND_WHATSAPP', 'SEND_EMAIL', 'VOICE_CALL', 'GENERATE_PAYMENT_LINK']
  if (notificationActions.includes(action) && notificationsToday >= policy.max_notifications_per_day) {
    violations.push(
      `Daily notification limit reached (${notificationsToday}/${policy.max_notifications_per_day}). ` +
      `Cannot send more notifications today.`
    )
  }

  // ---- RULE 5: Minimum transaction value for recovery ----
  if (transaction.amount < policy.min_recovery_amount_paise) {
    violations.push(
      `Transaction amount ₹${Math.floor(transaction.amount / 100)} is below minimum recovery threshold ` +
      `₹${Math.floor(policy.min_recovery_amount_paise / 100)}.`
    )
  }

  // ---- RULE 6: Action must be in allowed channels ----
  if (!policy.allowed_channels.includes(action) && action !== 'NO_ACTION' && action !== 'ESCALATE_TO_HUMAN') {
    violations.push(
      `Action ${action} is not in the merchant's allowed recovery channels: [${policy.allowed_channels.join(', ')}]`
    )
  }

  // ---- RULE 7: High-value transactions require human approval ----
  if (transaction.amount >= policy.human_approval_threshold) {
    requiresHumanApproval = true
    warnings.push(
      `Transaction ₹${Math.floor(transaction.amount / 100)} exceeds human approval threshold ` +
      `₹${Math.floor(policy.human_approval_threshold / 100)}. Human review required before action.`
    )
  }

  // ---- RULE 8: Voice call is high-friction — add warning ----
  if (action === 'VOICE_CALL') {
    warnings.push('Voice call is high-friction. Ensure customer preferences allow outbound calls.')
  }

  return {
    allowed: violations.length === 0,
    violations,
    warnings,
    requires_human_approval: requiresHumanApproval,
  }
}

// Find the best fallback action that WILL pass policy
export function findFallbackAction(
  preferredAction: RecoveryAction,
  input: PolicyGuardInput
): RecoveryAction {
  const fallbackOrder: RecoveryAction[] = [
    'WAIT_AND_RETRY',
    'GENERATE_PAYMENT_LINK',
    'SEND_EMAIL',
    'SEND_WHATSAPP',
    'NO_ACTION',
  ]

  for (const fallback of fallbackOrder) {
    if (fallback === preferredAction) continue
    const result = validateAgainstPolicy({ ...input, action: fallback })
    if (result.allowed) return fallback
  }

  return 'NO_ACTION'
}
