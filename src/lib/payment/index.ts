// Payment Provider Factory
// Selects active provider based on PAYMENT_PROVIDER environment variable

import type { PaymentProvider } from './provider'
import { DemoPaymentProvider } from './demo'
import { RazorpayProvider } from './razorpay'

let _customProvider: PaymentProvider | null = null

/**
 * Returns active PaymentProvider instance based on configuration.
 * Defaults to DemoPaymentProvider for deterministic safety.
 */
export function getPaymentProvider(): PaymentProvider {
  if (_customProvider) {
    return _customProvider
  }

  const providerType = process.env.PAYMENT_PROVIDER?.toLowerCase().trim() ?? 'demo'

  if (providerType === 'razorpay') {
    return new RazorpayProvider()
  }

  return new DemoPaymentProvider()
}

/** Set custom provider (for unit testing and integration mocking) */
export function setPaymentProvider(provider: PaymentProvider | null): void {
  _customProvider = provider
}

export * from './provider'
export * from './demo'
export * from './razorpay'
