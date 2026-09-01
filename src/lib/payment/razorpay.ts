// Razorpay Live Payment Provider Adapter
// Server-side only — never exposes API secrets to client code

import type { PaymentProvider } from './provider'
import type { ExecutionInput, ExecutionResult } from '../engine/executor'
import type { AttemptStatus } from '../types'

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay'
  readonly isDemo = false

  private keyId: string | undefined
  private keySecret: string | undefined

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID
    this.keySecret = process.env.RAZORPAY_KEY_SECRET
  }

  isConfigured(): boolean {
    return Boolean(
      this.keyId &&
      this.keySecret &&
      this.keyId.trim().length > 0 &&
      this.keySecret.trim().length > 0 &&
      !this.keyId.includes('xxxx') &&
      !this.keySecret.includes('xxxx')
    )
  }

  async executeAction(input: ExecutionInput): Promise<ExecutionResult> {
    if (input.action === 'NO_ACTION') {
      return {
        success: false,
        status: 'no_response' as AttemptStatus,
        resultCode: 'NO_ACTION',
        resultMessage: 'No recovery action taken per engine decision',
      }
    }

    // ── SAFETY GATE ──────────────────────────────────────────────────────────
    // If credentials are not configured, reject cleanly with a controlled error.
    // NEVER fabricate a live Razorpay transaction or fake API success.
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'failed',
        resultCode: 'RAZORPAY_CONFIG_ERROR',
        resultMessage: 'Razorpay live credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are missing or unconfigured. Cannot execute live payment action.',
      }
    }

    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`

    try {
      if (input.action === 'GENERATE_PAYMENT_LINK') {
        const res = await fetch('https://api.razorpay.com/v1/payment_links', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: input.amount,
            currency: 'INR',
            accept_partial: false,
            description: `Recovery for transaction ${input.transactionId}`,
            customer: {
              name: input.customerId ?? 'Customer',
              email: input.customerEmail,
              contact: input.customerPhone,
            },
            notify: {
              sms: Boolean(input.customerPhone),
              email: Boolean(input.customerEmail),
            },
            notes: {
              transaction_id: input.transactionId,
              case_id: input.caseId,
              attempt_id: input.attemptId,
              attempt_number: String(input.attemptNumber),
              recovery_engine: 'REVIVE',
            },
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          const errDesc = data.error?.description ?? `Razorpay API error (${res.status})`
          return {
            success: false,
            status: 'failed',
            resultCode: data.error?.code ?? 'RZP_API_ERROR',
            resultMessage: `Razorpay Payment Link creation failed: ${errDesc}`,
          }
        }

        return {
          success: true,
          status: 'success',
          resultCode: 'PAYMENT_LINK_CREATED',
          resultMessage: `Razorpay payment link generated: ${data.short_url ?? data.id}`,
          amountRecovered: input.amount,
          externalReference: data.id,
        }
      }

      // For actions without direct standard REST endpoint (e.g. automated retry, manual escalation):
      return {
        success: false,
        status: 'failed',
        resultCode: 'ACTION_NOT_SUPPORTED_LIVE',
        resultMessage: `Action ${input.action} requires direct terminal/dashboard dispatch in live Razorpay mode`,
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown Razorpay network error'
      return {
        success: false,
        status: 'failed',
        resultCode: 'RAZORPAY_NETWORK_ERROR',
        resultMessage: `Network error reaching Razorpay API: ${errMsg}`,
      }
    }
  }
}
