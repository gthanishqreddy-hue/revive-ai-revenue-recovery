// Policies API
// GET /api/policies → get merchant policy
// PUT /api/policies → update merchant policy (Zod validated)

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { query, execute } from '@/lib/db/client'
import { DEMO_MERCHANT_ID } from '@/lib/db/seed'
import { v4 as uuidv4 } from 'uuid'

// ── Zod Schema for Policy Update Validation ─────────────────────────────────

const PolicyUpdateSchema = z.object({
  max_retries: z
    .number()
    .int('max_retries must be an integer')
    .min(0, 'max_retries cannot be negative')
    .max(10, 'max_retries cannot exceed 10'),
  min_retry_interval_mins: z
    .number()
    .int('min_retry_interval_mins must be an integer')
    .min(1, 'min_retry_interval_mins must be at least 1 minute')
    .max(1440, 'min_retry_interval_mins cannot exceed 1440 minutes (24h)'),
  max_notifications_per_day: z
    .number()
    .int('max_notifications_per_day must be an integer')
    .min(0, 'max_notifications_per_day cannot be negative')
    .max(50, 'max_notifications_per_day cannot exceed 50'),
  min_recovery_amount_paise: z
    .number()
    .int('min_recovery_amount_paise must be an integer')
    .min(0, 'min_recovery_amount_paise cannot be negative'),
  allowed_channels: z
    .array(
      z.enum([
        'RETRY_PAYMENT',
        'GENERATE_PAYMENT_LINK',
        'SEND_WHATSAPP',
        'SEND_EMAIL',
        'VOICE_CALL',
        'WAIT_AND_RETRY',
        'NO_ACTION',
        'ESCALATE_TO_HUMAN',
      ])
    )
    .min(1, 'At least one recovery channel must be enabled'),
  human_approval_threshold: z
    .number()
    .int('human_approval_threshold must be an integer')
    .min(0, 'human_approval_threshold cannot be negative'),
  max_recovery_cost_paise: z
    .number()
    .int('max_recovery_cost_paise must be an integer')
    .min(0, 'max_recovery_cost_paise cannot be negative'),
  auto_abandon_after_hours: z
    .number()
    .int('auto_abandon_after_hours must be an integer')
    .min(1, 'auto_abandon_after_hours must be at least 1 hour')
    .max(720, 'auto_abandon_after_hours cannot exceed 720 hours (30 days)'),
}).strict()

export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM policies WHERE merchant_id = ?',
      [DEMO_MERCHANT_ID]
    )
    if (!rows[0]) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    const policy = rows[0]
    return NextResponse.json({
      policy: {
        ...policy,
        allowed_channels: JSON.parse(policy.allowed_channels as string),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  let rawBody: unknown
  try {
    const text = await req.text()
    rawBody = JSON.parse(text)
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload in request body' },
      { status: 400 }
    )
  }

  // ── ZOD VALIDATION ─────────────────────────────────────────────────────────
  const validation = PolicyUpdateSchema.safeParse(rawBody)
  if (!validation.success) {
    const details = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    return NextResponse.json(
      {
        error: 'Policy validation failed',
        details,
      },
      { status: 400 }
    )
  }

  const {
    max_retries,
    min_retry_interval_mins,
    max_notifications_per_day,
    min_recovery_amount_paise,
    allowed_channels,
    human_approval_threshold,
    max_recovery_cost_paise,
    auto_abandon_after_hours,
  } = validation.data

  try {
    await execute(
      `UPDATE policies SET
         max_retries = ?, min_retry_interval_mins = ?, max_notifications_per_day = ?,
         min_recovery_amount_paise = ?, allowed_channels = ?, human_approval_threshold = ?,
         max_recovery_cost_paise = ?, auto_abandon_after_hours = ?, updated_at = ?
       WHERE merchant_id = ?`,
      [
        max_retries,
        min_retry_interval_mins,
        max_notifications_per_day,
        min_recovery_amount_paise,
        JSON.stringify(allowed_channels),
        human_approval_threshold,
        max_recovery_cost_paise,
        auto_abandon_after_hours,
        new Date().toISOString(),
        DEMO_MERCHANT_ID,
      ]
    )

    await execute(
      `INSERT INTO audit_logs (id, merchant_id, actor, event, details, severity)
       VALUES (?, ?, 'user', 'Merchant policy updated', ?, 'info')`,
      [uuidv4(), DEMO_MERCHANT_ID, JSON.stringify(validation.data)]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
