// Webhook endpoint for Razorpay events
// POST /api/webhooks/razorpay
//
// Flow: Receive → Verify Signature → Idempotency Check → Persist → Process
//
// WHY: Webhooks can arrive multiple times. The idempotency_key prevents
// duplicate processing. Signature verification prevents spoofed events.
//
// PRODUCTION NOTE: For production, payment.failed processing should be
// enqueued to a job queue (BullMQ, SQS, etc.) before returning 200.
// For the MVP, we process inline after persisting the event.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { query, execute } from '@/lib/db/client'
import { runRecoveryPipeline } from '@/lib/engine/orchestrator'
import { v4 as uuidv4 } from 'uuid'
import { DEMO_MERCHANT_ID } from '@/lib/db/seed'

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'demo_webhook_secret'

function verifySignature(payload: string, signature: string): boolean {
  // In production: use crypto.timingSafeEqual to prevent timing attacks
  const expectedSig = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSig, 'hex')
    )
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  // ---- SIGNATURE VERIFICATION ----
  // In demo mode (no real secret), we skip verification but log the bypass
  const isDemoMode = !process.env.RAZORPAY_WEBHOOK_SECRET
  if (!isDemoMode && !verifySignature(rawBody, signature)) {
    await execute(
      `INSERT INTO audit_logs (id, actor, event, details, severity) VALUES (?, 'webhook', 'Webhook signature verification failed', ?, 'critical')`,
      [uuidv4(), JSON.stringify({ signature: signature.slice(0, 20) })]
    )
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const eventType = payload.event as string ?? 'unknown'
  const paymentPayload = payload.payload as Record<string, Record<string, Record<string, unknown>>> | undefined
  const paymentEntity = paymentPayload?.payment?.entity
  const paymentId = paymentEntity?.id as string | undefined
  const idempotencyKey = `${eventType}_${paymentId ?? uuidv4()}`

  // ---- IDEMPOTENCY CHECK ----
  // If this exact event was already processed, return 200 immediately.
  // The recovery pipeline will NOT be triggered again.
  const existing = await query<{ id: string; processed: number }>(
    'SELECT id, processed FROM payment_events WHERE idempotency_key = ?',
    [idempotencyKey]
  )

  if (existing.length > 0) {
    // Duplicate event — safe to ignore, pipeline already ran (or was not triggered)
    return NextResponse.json({ ok: true, message: 'Duplicate event ignored', idempotent: true })
  }

  // ---- PERSIST EVENT ----
  const eventId = uuidv4()
  await execute(
    `INSERT INTO payment_events (id, merchant_id, event_type, payload, idempotency_key, source)
     VALUES (?, ?, ?, ?, ?, 'webhook')`,
    [eventId, DEMO_MERCHANT_ID, eventType, rawBody, idempotencyKey]
  )

  // ---- AUDIT LOG ----
  await execute(
    `INSERT INTO audit_logs (id, merchant_id, actor, event, entity_type, entity_id, details, severity)
     VALUES (?, ?, 'webhook', ?, 'payment_event', ?, ?, 'info')`,
    [uuidv4(), DEMO_MERCHANT_ID, `Webhook received: ${eventType}`, eventId,
     JSON.stringify({ event_type: eventType, demo: isDemoMode, payment_id: paymentId })]
  )

  // ---- PROCESS payment.failed → TRIGGER RECOVERY PIPELINE ----
  if (eventType === 'payment.failed' && paymentId) {
    // Find the matching transaction using the Razorpay payment ID.
    // Transactions are stored with external_id = razorpay payment ID.
    const txRows = await query<{ id: string; merchant_id: string }>(
      `SELECT id, merchant_id FROM transactions
       WHERE (external_id = ? OR id = ?) AND merchant_id = ?
       LIMIT 1`,
      [paymentId, paymentId, DEMO_MERCHANT_ID]
    )

    if (txRows.length > 0) {
      const transactionId = txRows[0].id
      const merchantId    = txRows[0].merchant_id

      // Mark event as being processed
      await execute(
        `UPDATE payment_events SET processed = 1 WHERE id = ?`,
        [eventId]
      )

      // PRODUCTION NOTE: In production, enqueue this to a job queue and return 200
      // immediately to meet Razorpay's 5-second webhook response SLA.
      // Example: await queue.add('recovery', { transactionId, merchantId })
      //
      // For MVP: process inline. runRecoveryPipeline is idempotent —
      // duplicate webhooks are blocked above; engine-level idempotency
      // (recovery_actions.idempotency_key) provides a second safety layer.
      try {
        const result = await runRecoveryPipeline(transactionId, merchantId)

        await execute(
          `INSERT INTO audit_logs (id, merchant_id, actor, event, entity_type, entity_id, details, severity)
           VALUES (?, ?, 'webhook', ?, 'recovery_case', ?, ?, 'info')`,
          [
            uuidv4(), merchantId,
            `Webhook-triggered recovery ${result.recovered ? 'succeeded' : 'failed'}: ${result.action}`,
            result.caseId,
            JSON.stringify({
              action:          result.action,
              recovered:       result.recovered,
              amount_recovered: result.amountRecovered,
              triggered_by:    'webhook',
              event_id:        eventId,
              payment_id:      paymentId,
            }),
          ]
        )

        return NextResponse.json({
          ok:        true,
          event_id:  eventId,
          case_id:   result.caseId,
          triggered: true,
          action:    result.action,
          recovered: result.recovered,
        })
      } catch (pipelineErr) {
        const errMsg = pipelineErr instanceof Error ? pipelineErr.message : 'Pipeline error'

        await execute(
          `INSERT INTO audit_logs (id, merchant_id, actor, event, entity_type, entity_id, details, severity)
           VALUES (?, ?, 'webhook', 'Webhook-triggered recovery pipeline failed', 'payment_event', ?, ?, 'error')`,
          [uuidv4(), DEMO_MERCHANT_ID, eventId, JSON.stringify({ error: errMsg, transaction_id: transactionId })]
        )

        // Still return 200 — Razorpay should not retry a failed pipeline.
        // The event is persisted; manual recovery is possible.
        return NextResponse.json({
          ok:       true,
          event_id: eventId,
          triggered: true,
          pipeline_error: errMsg,
        })
      }
    } else {
      // Transaction not found in DB — log for investigation, return 200
      await execute(
        `INSERT INTO audit_logs (id, merchant_id, actor, event, entity_type, entity_id, details, severity)
         VALUES (?, ?, 'webhook', 'payment.failed webhook: transaction not found in DB', 'payment_event', ?, ?, 'warning')`,
        [uuidv4(), DEMO_MERCHANT_ID, eventId, JSON.stringify({ payment_id: paymentId })]
      )
    }
  }

  return NextResponse.json({ ok: true, event_id: eventId })
}
