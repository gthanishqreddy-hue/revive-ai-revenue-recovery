'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Clock, ArrowLeft, Shield, Zap, User, CreditCard, AlertCircle } from 'lucide-react'
import { formatINR, formatDateTime, ACTION_LABELS, CATEGORY_LABELS, METHOD_LABELS } from '@/lib/utils'

interface CaseDetail {
  case: Record<string, unknown>
  decisions: Record<string, unknown>[]
  attempts: Record<string, unknown>[]
  runs: Record<string, unknown>[]
  features: Record<string, unknown> | null
}

// ── shared style tokens ────────────────────────────────────────────────────────
const card  = { background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }
const inner = { background: '#080c12', border: '1px solid rgba(255,255,255,0.05)' }
const label = { fontSize: '10px', letterSpacing: '0.05em', color: 'rgba(74,85,104,0.6)', marginBottom: 3, textTransform: 'uppercase' as const }
const value = { fontSize: '13px', color: 'rgba(240,244,255,0.75)' }

function InfoRow({ l, v, mono = false, color }: { l: string; v: string; mono?: boolean; color?: string }) {
  return (
    <div>
      <div style={label}>{l}</div>
      <div className={mono ? 'mono' : ''} style={{ ...value, color: color ?? value.color }}>{v}</div>
    </div>
  )
}

function CardHead({ icon: Icon, title, color = '#4f8ef7' }: {
  icon: React.ElementType; title: string; color?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(240,244,255,0.72)', letterSpacing: '0.01em' }}>{title}</span>
    </div>
  )
}

function ScoreBar({ label: lbl, value: val, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(val * 100)
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span style={{ fontSize: '11px', color: 'rgba(74,85,104,0.65)' }}>{lbl}</span>
        <span className="mono" style={{ fontSize: '11px', color }}>{pct}%</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

const STATUS_CFG: Record<string, { color: string; bg: string; border: string }> = {
  recovered:  { color: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.22)' },
  open:       { color: '#4f8ef7', bg: 'rgba(79,142,247,0.08)',   border: 'rgba(79,142,247,0.22)' },
  executing:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)' },
  recovering: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)' },
  failed:     { color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.22)' },
  abandoned:  { color: 'rgba(136,146,164,0.5)', bg: 'rgba(74,85,104,0.08)', border: 'rgba(74,85,104,0.18)' },
}

const ATTEMPT_CFG: Record<string, { color: string; bg: string; border: string }> = {
  success:    { color: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.22)' },
  failed:     { color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.22)' },
  pending:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)' },
}

export default function CaseDetailPage() {
  const params  = useParams()
  const caseId  = params?.caseId as string
  const [data, setData]       = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!caseId) return
    fetch(`/api/cases/${caseId}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [caseId])

  if (loading) return (
    <div className="flex items-center justify-center" style={{ height: '60vh' }}>
      <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#4f8ef7', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error || !data) return (
    <div className="p-6 flex items-center gap-2" style={{ color: '#f87171' }}>
      <AlertCircle className="w-4 h-4" /> {error ?? 'Case not found'}
    </div>
  )

  const c   = data.case
  const st  = c.status as string
  const scfg = STATUS_CFG[st] ?? STATUS_CFG.open
  const isRecovered = st === 'recovered'

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Link
          href="/dashboard/transactions"
          className="inline-flex items-center gap-1.5 mb-4 transition-all"
          style={{ fontSize: '12px', color: 'rgba(74,85,104,0.55)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(136,146,164,0.8)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(74,85,104,0.55)' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Transactions
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.92)' }}>
              Recovery Case
            </h1>
            <p className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)', marginTop: 4 }}>{caseId}</p>
          </div>
          <span
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: scfg.color, background: scfg.bg, border: `1px solid ${scfg.border}` }}
          >
            {st?.replace(/_/g, ' ')}
          </span>
        </div>
      </motion.div>

      {/* ── Recovery success banner ─────────────────────────────────────── */}
      {isRecovered && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.22)' }}
        >
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 shrink-0" style={{ color: '#34d399' }} />
            <div>
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#34d399', letterSpacing: '-0.04em' }}>
                {formatINR(c.actual_recovery as number)} recovered
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(136,146,164,0.6)', marginTop: 3 }}>
                via {ACTION_LABELS[c.selected_strategy as string] ?? c.selected_strategy}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left column: info cards ──────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Transaction */}
          <motion.div
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="rounded-2xl p-4 space-y-3"
            style={card}
          >
            <CardHead icon={CreditCard} title="Transaction" color="#4f8ef7" />
            <InfoRow l="Amount" v={formatINR(c.amount as number)} mono color="rgba(240,244,255,0.9)" />
            <InfoRow l="Payment Method" v={METHOD_LABELS[c.payment_method as string] ?? (c.payment_method as string) ?? '—'} />
            <InfoRow l="Failure Code" v={(c.failure_code as string) ?? '—'} mono color="#f87171" />
            <InfoRow l="Failure Reason" v={(c.failure_reason as string) ?? '—'} />
            <InfoRow l="Created" v={formatDateTime(c.tx_created_at as string)} mono />
          </motion.div>

          {/* Customer */}
          <motion.div
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="rounded-2xl p-4 space-y-3"
            style={card}
          >
            <CardHead icon={User} title="Customer" color="#7c6fe8" />
            <InfoRow l="Name" v={(c.customer_name as string) ?? 'Unknown'} />
            <InfoRow l="Email" v={(c.customer_email as string) ?? '—'} mono />
            <InfoRow l="Total Payments" v={String(c.total_payments ?? '—')} />
            <InfoRow
              l="Success Rate"
              v={c.total_payments
                ? `${Math.round(((c.successful_payments as number) / (c.total_payments as number)) * 100)}%`
                : '—'}
              color="#34d399"
            />
          </motion.div>

          {/* AI Analysis */}
          <motion.div
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="rounded-2xl p-4 space-y-4"
            style={card}
          >
            <CardHead icon={Zap} title="AI Analysis" color="#f59e0b" />
            <ScoreBar
              label="Recoverability"
              value={(c.recoverability_score as number) ?? 0}
              color="#4f8ef7"
            />
            <ScoreBar
              label="Customer Intent"
              value={(c.intent_score as number) ?? 0}
              color="#f59e0b"
            />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12, marginTop: 4 }}>
              <div style={label}>Failure Category</div>
              <div style={value}>{CATEGORY_LABELS[c.failure_category as string] ?? (c.failure_category as string) ?? '—'}</div>
            </div>
            <div>
              <div style={label}>Expected Recovery</div>
              <div className="mono" style={{ ...value, color: '#34d399', fontWeight: 500 }}>
                {c.expected_recovery ? formatINR(c.expected_recovery as number) : '—'}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Right column: timeline + decisions ──────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Pipeline timeline */}
          <motion.div
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="rounded-2xl p-5"
            style={card}
          >
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(240,244,255,0.72)', marginBottom: 16 }}>
              Recovery Timeline
            </h3>
            <div>
              {data.runs.map((run, i) => {
                const done    = run.status === 'completed'
                const failed  = run.status === 'failed'
                const dotColor = done ? '#34d399' : failed ? '#f87171' : 'rgba(74,85,104,0.5)'
                return (
                  <div key={run.id as string} className="flex gap-4 pb-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: done ? 'rgba(52,211,153,0.1)' : failed ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${dotColor}`,
                        }}
                      >
                        {done   ? <CheckCircle className="w-3.5 h-3.5" style={{ color: '#34d399' }} /> :
                         failed ? <XCircle className="w-3.5 h-3.5" style={{ color: '#f87171' }} /> :
                                  <Clock className="w-3.5 h-3.5" style={{ color: 'rgba(74,85,104,0.5)' }} />}
                      </div>
                      {i < data.runs.length - 1 && (
                        <div className="w-px flex-1 my-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.78)', textTransform: 'capitalize' }}>
                          {(run.stage as string).replace(/_/g, ' ')}
                        </span>
                        <span className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)' }}>
                          {run.duration_ms ? `${run.duration_ms}ms` : ''}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'rgba(74,85,104,0.45)' }}>
                        {formatDateTime(run.created_at as string)}
                      </span>
                    </div>
                  </div>
                )
              })}
              {data.runs.length === 0 && (
                <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.5)', textAlign: 'center', padding: '24px 0' }}>
                  No pipeline runs recorded yet.
                </p>
              )}
            </div>
          </motion.div>

          {/* AI Decision Log */}
          {data.decisions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.18 }}
              className="rounded-2xl p-5"
              style={card}
            >
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-3.5 h-3.5" style={{ color: '#4f8ef7' }} />
                <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(240,244,255,0.72)' }}>AI Decision Log</h3>
              </div>
              <div className="space-y-3">
                {data.decisions.map((dec) => (
                  <div key={dec.id as string} className="rounded-xl p-4" style={inner}>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ color: '#4f8ef7', background: 'rgba(79,142,247,0.1)', letterSpacing: '0.04em', textTransform: 'uppercase' }}
                      >
                        {dec.agent_type as string}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)' }}>
                          {dec.model_used as string}
                        </span>
                        {typeof dec.confidence === 'number' && (
                          <span
                            className="px-1.5 py-0.5 rounded text-xs"
                            style={{ color: '#4f8ef7', background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.2)' }}
                          >
                            {Math.round((dec.confidence as number) * 100)}% conf.
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.8)', marginBottom: 8 }}>
                      Decision: {(() => {
                        try {
                          const d = JSON.parse(dec.decision as string)
                          return ACTION_LABELS[d.action] ?? d.action ?? 'See below'
                        } catch { return 'See below' }
                      })()}
                    </div>
                    {typeof dec.reasoning === 'string' && (
                      <div className="space-y-1">
                        {(dec.reasoning as string).split('\n').filter(Boolean).map((line, i) => (
                          <div key={i} className="flex items-start gap-1.5" style={{ fontSize: '11px', color: 'rgba(136,146,164,0.6)' }}>
                            <span style={{ color: '#4f8ef7', flexShrink: 0 }}>·</span> {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Recovery Attempts */}
          {data.attempts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.25 }}
              className="rounded-2xl p-5"
              style={card}
            >
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-3.5 h-3.5" style={{ color: '#7c6fe8' }} />
                <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(240,244,255,0.72)' }}>Recovery Attempts</h3>
              </div>
              <div className="space-y-2">
                {data.attempts.map((attempt) => {
                  const acfg = ATTEMPT_CFG[(attempt.status as string)] ?? ATTEMPT_CFG.pending
                  return (
                    <div
                      key={attempt.id as string}
                      className="flex items-center justify-between rounded-xl p-3"
                      style={inner}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.78)' }}>
                          Attempt #{attempt.attempt_number as number} · {ACTION_LABELS[attempt.strategy as string] ?? attempt.strategy as string}
                        </div>
                        <div className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.45)', marginTop: 2 }}>
                          {attempt.idempotency_key as string}
                        </div>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ color: acfg.color, background: acfg.bg, border: `1px solid ${acfg.border}` }}
                      >
                        {attempt.status as string}
                      </span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
