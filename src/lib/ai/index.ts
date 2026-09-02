// Central AI Service Interface & Hybrid Evaluation Engine
// Enforces deterministic safety floor and policy guard verification on AI output

import type { AIProvider } from './provider'
import { GeminiAIProvider } from './gemini'
import type { RecoveryAIContext, AIAnalysisResult, AIDecision } from './types'
import type { RecoveryAction, StrategyEvaluation, StrategySelectionResult } from '../types'

let _provider: AIProvider | null = null

export function getAIProvider(): AIProvider {
  if (!_provider) {
    _provider = new GeminiAIProvider()
  }
  return _provider
}

/** Set custom provider (useful for testing and swapping AI vendors) */
export function setAIProvider(provider: AIProvider | null): void {
  _provider = provider
}

/** Check if real AI is active and configured in the current environment */
export function isAIAvailable(): boolean {
  return getAIProvider().isAvailable()
}

/** Get AI runtime status descriptor for UI */
export function getAIRuntimeStatus(): {
  available: boolean
  providerName: string
  modelName: string
  statusLabel: string
} {
  const provider = getAIProvider()
  const available = provider.isAvailable()
  return {
    available,
    providerName: provider.name,
    modelName: available ? provider.modelName : 'deterministic-fallback',
    statusLabel: available ? `AI READY (${provider.modelName})` : 'AI DISABLED (Deterministic Safety Floor)',
  }
}

export interface HybridStrategyResult {
  selected: StrategyEvaluation
  alternatives: StrategyEvaluation[]
  model_used: string
  confidence: number
  ai_used: boolean
  ai_decision?: AIDecision
  fallback_reason?: string
  latency_ms: number
}

/**
 * Hybrid Strategy Evaluation:
 * 1. AI analyzes context and proposes optimal action.
 * 2. Deterministic engine verifies if proposed action is valid and allowed.
 * 3. Fallback to deterministic ERV optimizer if AI fails or recommends invalid action.
 */
export async function evaluateStrategyWithAI(
  context: RecoveryAIContext,
  deterministicResult: StrategySelectionResult,
  allowedActions: RecoveryAction[]
): Promise<HybridStrategyResult> {
  const provider = getAIProvider()

  if (!provider.isAvailable()) {
    return {
      selected: deterministicResult.selected,
      alternatives: deterministicResult.alternatives,
      model_used: 'deterministic-fallback',
      confidence: deterministicResult.confidence,
      ai_used: false,
      fallback_reason: 'AI provider not configured (deterministic engine safety floor active)',
      latency_ms: 0,
    }
  }

  // Attempt real AI analysis
  const aiResult: AIAnalysisResult = await provider.analyzeRecoveryCase(context)

  if (!aiResult.success || !aiResult.decision) {
    console.warn(`[AI] Falling back to deterministic engine: ${aiResult.error ?? 'No decision'}`)
    return {
      selected: deterministicResult.selected,
      alternatives: deterministicResult.alternatives,
      model_used: 'deterministic-fallback',
      confidence: deterministicResult.confidence,
      ai_used: false,
      fallback_reason: aiResult.fallbackReason ?? aiResult.error ?? 'AI evaluation failed',
      latency_ms: aiResult.latencyMs,
    }
  }

  const recommendedAction = aiResult.decision.recommended_action

  // ── FINANCIAL SAFETY VERIFICATION ──────────────────────────────────────────
  // Check if AI recommendation is in merchant's allowed action channels
  if (!allowedActions.includes(recommendedAction) && recommendedAction !== 'NO_ACTION' && recommendedAction !== 'ESCALATE_TO_HUMAN') {
    console.warn(`[AI Security] AI recommended action ${recommendedAction} which is not in merchant allowed actions [${allowedActions.join(', ')}]. Rejecting recommendation.`)
    return {
      selected: deterministicResult.selected,
      alternatives: deterministicResult.alternatives,
      model_used: 'deterministic-fallback',
      confidence: deterministicResult.confidence,
      ai_used: false,
      fallback_reason: `AI proposed disallowed action (${recommendedAction}) — rejected by safety guard`,
      latency_ms: aiResult.latencyMs,
    }
  }

  // Find the deterministic evaluation for the AI's chosen action
  const allEvaluations = [deterministicResult.selected, ...deterministicResult.alternatives]
  const matchedEvaluation = allEvaluations.find(e => e.action === recommendedAction)

  if (!matchedEvaluation) {
    console.warn(`[AI Safety] AI recommended action ${recommendedAction} has no valid ERV calculation. Falling back.`)
    return {
      selected: deterministicResult.selected,
      alternatives: deterministicResult.alternatives,
      model_used: 'deterministic-fallback',
      confidence: deterministicResult.confidence,
      ai_used: false,
      fallback_reason: `AI proposed unverified action (${recommendedAction})`,
      latency_ms: aiResult.latencyMs,
    }
  }

  // Enrich selected evaluation with real AI reasoning
  const enrichedSelected: StrategyEvaluation = {
    ...matchedEvaluation,
    reasoning: [
      aiResult.decision.reasoning,
      ...aiResult.decision.reason_codes.map(c => `AI Signal: ${c}`),
      `Expected Recovery Value: ₹${Math.floor(matchedEvaluation.expected_recovery_value / 100).toLocaleString('en-IN')}`,
      `Success probability: ${Math.round(matchedEvaluation.probability_of_success * 100)}%`,
    ],
  }

  const remainingAlternatives = allEvaluations.filter(e => e.action !== recommendedAction)

  return {
    selected: enrichedSelected,
    alternatives: remainingAlternatives,
    model_used: aiResult.modelUsed,
    confidence: aiResult.decision.confidence,
    ai_used: true,
    ai_decision: aiResult.decision,
    latency_ms: aiResult.latencyMs,
  }
}
