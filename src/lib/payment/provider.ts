// Payment Provider Abstraction
// Interface for real gateway adapters and deterministic simulation providers

import type { ExecutionInput, ExecutionResult } from '../engine/executor'

export interface PaymentProvider {
  /** Provider identifier: 'demo' | 'razorpay' | ... */
  readonly name: string

  /** True if provider is running in simulation/demo mode */
  readonly isDemo: boolean

  /** Check if necessary live credentials and configurations are present */
  isConfigured(): boolean

  /**
   * Execute a recovery action through the provider interface.
   * Must handle network errors, authentication failures, and API errors safely.
   */
  executeAction(input: ExecutionInput): Promise<ExecutionResult>
}
