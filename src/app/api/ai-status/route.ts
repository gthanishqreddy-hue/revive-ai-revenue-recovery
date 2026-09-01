// AI Status API
// GET /api/ai-status → returns runtime AI availability and active model

import { NextResponse } from 'next/server'
import { getAIRuntimeStatus } from '@/lib/ai'

export async function GET() {
  try {
    const status = getAIRuntimeStatus()
    return NextResponse.json(status)
  } catch (err) {
    return NextResponse.json({
      available: false,
      providerName: 'Google Gemini',
      modelName: 'deterministic-fallback',
      statusLabel: 'AI FALLBACK (Deterministic Safety Floor)',
      error: String(err),
    })
  }
}
