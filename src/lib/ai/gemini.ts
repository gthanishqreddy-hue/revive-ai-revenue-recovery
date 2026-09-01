// Google Gemini AI Provider Implementation
// Server-side only — never expose API keys to client bundle

import { GoogleGenAI } from '@google/genai'
import type { AIProvider } from './provider'
import { type RecoveryAIContext, type AIAnalysisResult, AIDecisionSchema } from './types'

export class GeminiAIProvider implements AIProvider {
  readonly name = 'Google Gemini'
  readonly modelName: string

  private apiKey: string | undefined

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY
    this.modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.apiKey !== 'your_gemini_api_key_here')
  }

  async analyzeRecoveryCase(context: RecoveryAIContext): Promise<AIAnalysisResult> {
    const start = Date.now()

    if (!this.isAvailable()) {
      return {
        success: false,
        modelUsed: 'deterministic-fallback',
        error: 'GEMINI_API_KEY not configured',
        latencyMs: Date.now() - start,
        fallbackReason: 'API key not configured',
      }
    }

    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey })

      const prompt = this.buildPrompt(context)

      // 6-second timeout race
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API call timed out after 6000ms')), 6000)
      )

      const generatePromise = client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          systemInstruction: `You are the REVIVE Autonomous Revenue Recovery Decision Engine.
Analyze payment failure diagnostic data, customer behavioral signals, and deterministic candidate strategy evaluations.
Select the optimal recovery action among candidate strategies that maximizes revenue recovery while minimizing customer friction and operational cost.

CRITICAL CONSTRAINTS:
1. You MUST select an action from candidate strategies provided in the context.
2. Output MUST be strictly valid JSON matching this schema:
{
  "recommended_action": "RETRY_PAYMENT" | "GENERATE_PAYMENT_LINK" | "SEND_WHATSAPP" | "SEND_EMAIL" | "VOICE_CALL" | "WAIT_AND_RETRY" | "NO_ACTION" | "ESCALATE_TO_HUMAN",
  "confidence": number between 0.0 and 1.0,
  "reason_codes": ["SHORT_REASON_CODE_1", "SHORT_REASON_CODE_2", ...],
  "reasoning": "Clear 1-2 sentence explanation of why this action was selected over alternatives."
}
3. Do NOT include markdown code fences or backticks. Return pure JSON.`,
        },
      })

      const response = await Promise.race([generatePromise, timeoutPromise])
      const latencyMs = Date.now() - start

      const rawText = response.text?.trim() ?? ''
      if (!rawText) {
        return {
          success: false,
          modelUsed: 'deterministic-fallback',
          error: 'Empty response from Gemini API',
          latencyMs,
          fallbackReason: 'Empty response',
        }
      }

      // Parse JSON
      let parsedJson: unknown
      try {
        // Strip markdown fences if present
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
        parsedJson = JSON.parse(cleaned)
      } catch (parseErr) {
        return {
          success: false,
          modelUsed: 'deterministic-fallback',
          rawResponse: rawText,
          error: `Failed to parse AI JSON output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          latencyMs,
          fallbackReason: 'Malformed JSON output',
        }
      }

      // Validate with Zod
      const validation = AIDecisionSchema.safeParse(parsedJson)
      if (!validation.success) {
        const errorDetails = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        return {
          success: false,
          modelUsed: 'deterministic-fallback',
          rawResponse: rawText,
          error: `AI response schema validation failed: ${errorDetails}`,
          latencyMs,
          fallbackReason: `Schema validation failed (${errorDetails})`,
        }
      }

      return {
        success: true,
        decision: validation.data,
        modelUsed: this.modelName,
        rawResponse: rawText,
        latencyMs,
      }
    } catch (err) {
      const latencyMs = Date.now() - start
      const errorMsg = err instanceof Error ? err.message : 'Unknown Gemini error'
      return {
        success: false,
        modelUsed: 'deterministic-fallback',
        error: errorMsg,
        latencyMs,
        fallbackReason: errorMsg,
      }
    }
  }

  private buildPrompt(context: RecoveryAIContext): string {
    return JSON.stringify({
      task: 'Evaluate recovery strategies for failed payment event and select optimal action',
      transaction: {
        id: context.transactionId,
        amount_rupees: Math.floor(context.amountPaise / 100),
        currency: context.currency,
        payment_method: context.paymentMethod,
        failure_code: context.failureCode,
      },
      diagnosis: {
        category: context.failureCategory,
        reason: context.diagnosisReason,
        recoverability_score: context.recoverabilityScore,
        is_permanent_failure: context.isPermanentFailure,
      },
      customer_signals: {
        intent_score_100: context.customerIntentScore,
        intent_confidence: context.customerIntentConfidence,
        is_high_value: context.isHighValueCustomer,
        total_payments: context.customerTotalPayments,
        successful_payments: context.customerSuccessfulPayments,
        behavioral_signals: context.customerSignalsSummary,
      },
      history: {
        previous_recovery_attempts_count: context.previousAttemptsCount,
        previous_strategies_used: context.previousStrategies,
      },
      candidate_strategies_with_deterministic_erv: context.candidateStrategies.map(s => ({
        action: s.action,
        success_probability_pct: Math.round(s.probabilityOfSuccess * 100),
        expected_recovery_value_rupees: Math.floor(s.expectedRecoveryValuePaise / 100),
        action_cost_rupees: Math.floor(s.actionCostPaise / 100),
        customer_friction_penalty: s.customerFrictionPenalty,
        baseline_reasoning: s.reasoning,
      })),
      policy_constraints: {
        max_retries: context.policyMaxRetries,
        allowed_channels: context.policyAllowedChannels,
      },
    }, null, 2)
  }
}
