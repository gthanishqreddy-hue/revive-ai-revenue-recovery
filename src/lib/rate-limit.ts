// Lightweight In-Memory Rate Limiter
//
// ARCHITECTURE NOTE:
// This in-memory sliding window rate limiter protects server-side routes against
// abusive simulation and execution loops in single-instance deployments.
//
// PRODUCTION NOTE:
// Distributed, multi-instance, or serverless deployments (e.g. Vercel / Kubernetes)
// must replace or back this with a distributed token bucket infrastructure such as
// Redis (Upstash) or edge API Gateway rate limiting (Cloudflare / Kong).

interface RateLimitRecord {
  timestamps: number[]
}

const store = new Map<string, RateLimitRecord>()

// Clean up expired entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    const windowMs = 60_000
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter(t => now - t < windowMs)
      if (record.timestamps.length === 0) {
        store.delete(key)
      }
    }
  }, 300_000)
}

export interface RateLimitOptions {
  /** Maximum allowed requests within the time window */
  limit?: number
  /** Time window in milliseconds (default: 60,000ms = 1 minute) */
  windowMs?: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetInMs: number
}

/**
 * Checks rate limit for a given identifier (e.g., client IP or merchant ID).
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const limit = options.limit ?? 60
  const windowMs = options.windowMs ?? 60_000
  const now = Date.now()

  let record = store.get(identifier)
  if (!record) {
    record = { timestamps: [] }
    store.set(identifier, record)
  }

  // Filter timestamps within the sliding window
  record.timestamps = record.timestamps.filter(t => now - t < windowMs)

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0] ?? now
    const resetInMs = Math.max(0, windowMs - (now - oldest))
    return {
      success: false,
      limit,
      remaining: 0,
      resetInMs,
    }
  }

  record.timestamps.push(now)
  return {
    success: true,
    limit,
    remaining: limit - record.timestamps.length,
    resetInMs: windowMs,
  }
}

/** Reset rate limit store (useful for automated testing) */
export function resetRateLimitStore(): void {
  store.clear()
}
