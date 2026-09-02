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
      const latencyMs = Date.now() - start
      console.warn(`[AI] Gemini fallback | reason=not_configured | model=${this.modelName} | latency_ms=${latencyMs}`)
      return {
        success: false,
        modelUsed: 'deterministic-fallback',
        error: 'GEMINI_API_KEY not configured',
        latencyMs,
        fallbackReason: 'not_configured',
      }
    }

    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey })

      const prompt = this.buildPrompt(context)

      // 9-second timeout race (optimized for Vercel Serverless Function runtime)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API call timed out after 9000ms')), 9000)
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
  "reason_codes": ["SHORT_REASON_CODE_1", "SHORT_REASON_CODE_2"],
  "reasoning": "Clear 1-2 sentence explanation of why this action was selected over alternatives."
}
3. Return pure compact JSON without markdown backticks.`,
        },
      })

      const response = await Promise.race([generatePromise, timeoutPromise])
      const latencyMs = Date.now() - start

      const rawText = response.text?.trim() ?? ''
      if (!rawText) {
        console.warn(`[AI] Gemini fallback | reason=empty_response | model=${this.modelName} | latency_ms=${latencyMs}`)
        return {
          success: false,
          modelUsed: 'deterministic-fallback',
          error: 'Empty response from Gemini API',
          latencyMs,
          fallbackReason: 'empty_response',
        }
      }

      // Parse JSON
      let parsedJson: unknown
      try {
        // Strip markdown fences if present
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
        parsedJson = JSON.parse(cleaned)
      } catch (parseErr) {
        console.warn(`[AI] Gemini fallback | reason=malformed_json | model=${this.modelName} | latency_ms=${latencyMs}`)
        return {
          success: false,
          modelUsed: 'deterministic-fallback',
          rawResponse: rawText,
          error: `Failed to parse AI JSON output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          latencyMs,
          fallbackReason: 'malformed_json',
        }
      }

      // Validate with Zod
      const validation = AIDecisionSchema.safeParse(parsedJson)
      if (!validation.success) {
        const errorDetails = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        console.warn(`[AI] Gemini fallback | reason=schema_validation_failed | model=${this.modelName} | latency_ms=${latencyMs} | details=${errorDetails}`)
        return {
          success: false,
          modelUsed: 'deterministic-fallback',
          rawResponse: rawText,
          error: `AI response schema validation failed: ${errorDetails}`,
          latencyMs,
          fallbackReason: 'schema_validation_failed',
        }
      }

      console.log(`[AI] Gemini analysis complete | model=${this.modelName} | action=${validation.data.recommended_action} | latency_ms=${latencyMs}`)

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
      const isTimeout = errorMsg.includes('timed out')
      const reason = isTimeout ? 'timeout' : 'api_error'

      console.warn(`[AI] Gemini fallback | reason=${reason} | model=${this.modelName} | latency_ms=${latencyMs} | error=${errorMsg}`)

      return {
        success: false,
        modelUsed: 'deterministic-fallback',
        error: errorMsg,
        latencyMs,
        fallbackReason: reason,
      }
    }
  }

  private buildPrompt(context: RecoveryAIContext): string {
    return JSON.stringify({
      task: 'select_optimal_recovery_action',
      tx: {
        id: context.transactionId,
        amount_rupees: Math.floor(context.amountPaise / 100),
        currency: context.currency,
        method: context.paymentMethod,
        failure_code: context.failureCode,
      },
      diag: {
        category: context.failureCategory,
        reason: context.diagnosisReason,
        recoverability: context.recoverabilityScore,
        is_perm: context.isPermanentFailure,
      },
      customer: {
        intent: context.customerIntentScore,
        confidence: context.customerIntentConfidence,
        high_value: context.isHighValueCustomer,
        total_payments: context.customerTotalPayments,
        successful_payments: context.customerSuccessfulPayments,
        signals: context.customerSignalsSummary,
      },
      history: {
        attempts: context.previousAttemptsCount,
        strategies: context.previousStrategies,
      },
      candidate_strategies: context.candidateStrategies.map(s => ({
        action: s.action,
        success_prob_pct: Math.round(s.probabilityOfSuccess * 100),
        erv_rupees: Math.floor(s.expectedRecoveryValuePaise / 100),
        cost_rupees: Math.floor(s.actionCostPaise / 100),
        friction: s.customerFrictionPenalty,
        reasoning: s.reasoning,
      })),
      policy: {
        max_retries: context.policyMaxRetries,
        allowed_channels: context.policyAllowedChannels,
      },
    })
  }
}
