// AI Status API
// GET /api/ai-status → returns runtime AI availability and active model

import { NextResponse } from 'next/server'
import { getAIRuntimeStatus } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const status = getAIRuntimeStatus()
    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        available: false,
        providerName: 'Google Gemini',
        modelName: 'deterministic-fallback',
        statusLabel: 'AI DISABLED (Deterministic Safety Floor)',
        error: String(err),
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    )
  }
}
