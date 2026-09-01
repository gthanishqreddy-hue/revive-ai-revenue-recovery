// AI Provider Interface Definition
// Vendor-agnostic abstraction for REVIVE

import type { RecoveryAIContext, AIAnalysisResult } from './types'

export interface AIProvider {
  /** Display name of the provider */
  readonly name: string

  /** Exact model identifier e.g. "gemini-2.5-flash" */
  readonly modelName: string

  /** Check if the provider has necessary configuration (e.g. API keys) */
  isAvailable(): boolean

  /**
   * Analyze recovery case and provide structured JSON decision.
   * Must handle timeouts, schema validation, and error recovery internally.
   */
  analyzeRecoveryCase(context: RecoveryAIContext): Promise<AIAnalysisResult>
}
