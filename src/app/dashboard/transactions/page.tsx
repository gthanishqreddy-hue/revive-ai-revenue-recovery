'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, RefreshCw, ExternalLink, X, ArrowRight } from 'lucide-react'
import { formatINR, formatINRCompact, CATEGORY_LABELS, ACTION_LABELS, METHOD_LABELS } from '@/lib/utils'

interface TxRow {
  tx_id: string
  tx_amount: number
  tx_method: string
  tx_failure_reason: string
  tx_created_at: string
  customer_name: string
  case_id: string
  case_status: string
  failure_category: string
  severity: string
  recoverability_score: number
  intent_score: number
  expected_recovery: number
  actual_recovery: number
  selected_strategy: string
}

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
  recovered:         { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.22)', text: '#34d399', label: 'Recovered' },
  open:              { bg: 'rgba(79,142,247,0.08)',  border: 'rgba(79,142,247,0.22)', text: '#4f8ef7', label: 'Open' },
  executing:         { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.22)', text: '#f59e0b', label: 'Executing' },
  recovering:        { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.22)', text: '#f59e0b', label: 'Recovering' },
  failed:            { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.22)', text: '#f87171', label: 'Failed' },
  abandoned:         { bg: 'rgba(74,85,104,0.1)',    border: 'rgba(74,85,104,0.2)',   text: 'rgba(136,146,164,0.6)', label: 'Abandoned' },
  no_action:         { bg: 'rgba(74,85,104,0.1)',    border: 'rgba(74,85,104,0.2)',   text: 'rgba(136,146,164,0.6)', label: 'No Action' },
  strategy_selected: { bg: 'rgba(124,111,232,0.08)', border: 'rgba(124,111,232,0.2)', text: '#7c6fe8', label: 'Strategy Set' },
}

const SEVERITY_CONFIG: Record<string, { text: string; bg: string; border: string }> = {
  critical: { text: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
  high:     { text: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.2)'  },
  medium:   { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  low:      { text: 'rgba(136,146,164,0.7)', bg: 'rgba(136,146,164,0.06)', border: 'rgba(136,146,164,0.12)' },
}

function ScoreBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', maxWidth: 64 }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ background: color }}
        />
      </div>
      <span className="mono" style={{ fontSize: '11px', color: 'rgba(240,244,255,0.6)' }}>{pct}%</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text, letterSpacing: '0.04em' }}
    >
      {cfg.label}
    </span>
  )
}

// Transaction detail drawer
function TxDrawer({ tx, onClose }: { tx: TxRow; onClose: () => void }) {
  const statusCfg = STATUS_CONFIG[tx.case_status] ?? STATUS_CONFIG.open
  const sevCfg = SEVERITY_CONFIG[tx.severity] ?? SEVERITY_CONFIG.low

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      />

      {/* Drawer */}
      <motion.aside
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="fixed right-0 top-0 bottom-0 z-50 w-96 overflow-y-auto"
        style={{
          background: '#0c1018',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <p style={{ fontSize: '11px', color: 'rgba(136,146,164,0.5)', letterSpacing: '0.05em', marginBottom: 3 }}>
              TRANSACTION
            </p>
            <p className="mono" style={{ fontSize: '13px', color: 'rgba(240,244,255,0.5)' }}>
              {tx.tx_id.slice(0, 22)}…
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(136,146,164,0.6)', cursor: 'pointer' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Amount + status */}
          <div>
            <div className="mono" style={{ fontSize: '2.2rem', fontWeight: 600, letterSpacing: '-0.04em', color: statusCfg.text }}>
              {formatINR(tx.tx_amount)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={tx.case_status} />
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                style={{ background: sevCfg.bg, border: `1px solid ${sevCfg.border}`, color: sevCfg.text, letterSpacing: '0.04em' }}
              >
                {tx.severity}
              </span>
            </div>
          </div>

          {/* Details grid */}
          <div
            className="rounded-xl p-4 space-y-2.5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {[
              { label: 'Customer', value: tx.customer_name },
              { label: 'Method', value: METHOD_LABELS[tx.tx_method] ?? tx.tx_method },
              { label: 'Failure', value: CATEGORY_LABELS[tx.failure_category] ?? tx.failure_category },
              { label: 'Strategy', value: ACTION_LABELS[tx.selected_strategy] ?? tx.selected_strategy ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)' }}>{label}</span>
                <span style={{ fontSize: '12px', color: 'rgba(240,244,255,0.65)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Scores */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p style={{ fontSize: '11px', letterSpacing: '0.05em', color: 'rgba(79,142,247,0.6)', marginBottom: 4 }}>
              AI SCORES
            </p>
            <div>
              <div className="flex justify-between mb-1.5">
                <span style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)' }}>Recoverability</span>
                <span className="mono" style={{ fontSize: '11px', color: 'rgba(79,142,247,0.7)' }}>
                  {Math.round(tx.recoverability_score * 100)}%
                </span>
              </div>
              <ScoreBar value={tx.recoverability_score} max={1} color="#4f8ef7" />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <span style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)' }}>Customer Intent</span>
                <span className="mono" style={{ fontSize: '11px', color: 'rgba(124,111,232,0.7)' }}>
                  {tx.intent_score}/100
                </span>
              </div>
              <ScoreBar value={tx.intent_score} max={100} color="#7c6fe8" />
            </div>
          </div>

          {/* Recovery financials */}
          <div
            className="rounded-xl p-4"
            style={{
              background: tx.case_status === 'recovered' ? 'rgba(52,211,153,0.05)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${tx.case_status === 'recovered' ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="flex justify-between mb-2">
              <span style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)' }}>Expected recovery</span>
              <span className="mono" style={{ fontSize: '13px', color: 'rgba(240,244,255,0.6)' }}>
                {tx.expected_recovery ? formatINR(tx.expected_recovery) : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)' }}>Actual recovery</span>
              <span className="mono" style={{ fontSize: '13px', fontWeight: 600, color: tx.actual_recovery ? '#34d399' : 'rgba(136,146,164,0.4)' }}>
                {tx.actual_recovery ? formatINR(tx.actual_recovery) : '—'}
              </span>
            </div>
          </div>

          {/* Open case link */}
          {tx.case_id && (
            <Link
              href={`/dashboard/cases/${tx.case_id}`}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'rgba(79,142,247,0.08)',
                border: '1px solid rgba(79,142,247,0.2)',
                color: 'rgba(79,142,247,0.85)',
              }}
            >
              View Full Recovery Case <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </motion.aside>
    </>
  )
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'executing', label: 'Executing' },
  { id: 'recovered', label: 'Recovered' },
  { id: 'failed', label: 'Failed' },
]

export default function TransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<TxRow | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transactions')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(data.transactions ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => { await fetchData() }
    init()
  }, [fetchData])

  const filtered = filter === 'all' ? rows : rows.filter(r => r.case_status === filter)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)' }}>
            At-Risk Transactions
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)', marginTop: 2 }}>
            {rows.length} failed transactions · click a row to inspect
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(136,146,164,0.7)', cursor: 'pointer' }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter === f.id ? 'rgba(79,142,247,0.12)' : 'rgba(255,255,255,0.03)',
              border: filter === f.id ? '1px solid rgba(79,142,247,0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: filter === f.id ? '#4f8ef7' : 'rgba(136,146,164,0.7)',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 shimmer rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: '#f87171' }}>
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {/* Table head */}
          <div
            className="grid gap-3 px-5 py-3"
            style={{
              gridTemplateColumns: '1fr 80px 90px 80px 80px 80px 100px 24px',
              background: '#0c1018',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {['Customer', 'Amount', 'Method', 'Recover.', 'Intent', 'Strategy', 'Status', ''].map(h => (
              <div key={h} style={{ fontSize: '10px', letterSpacing: '0.06em', color: 'rgba(74,85,104,0.6)', textTransform: 'uppercase' }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ background: '#080c12' }}>
            <AnimatePresence mode="popLayout">
              {filtered.map((row, i) => {
                return (
                  <motion.div
                    key={row.tx_id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                    onClick={() => setSelected(row)}
                    className="grid gap-3 px-5 py-3.5 items-center cursor-pointer transition-colors"
                    style={{
                      gridTemplateColumns: '1fr 80px 90px 80px 80px 80px 100px 24px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: selected?.tx_id === row.tx_id ? 'rgba(79,142,247,0.06)' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (selected?.tx_id !== row.tx_id) {
                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (selected?.tx_id !== row.tx_id) {
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                      }
                    }}
                  >
                    <div className="min-w-0">
                      <div style={{ fontSize: '13px', color: 'rgba(240,244,255,0.8)', fontWeight: 450 }} className="truncate">
                        {row.customer_name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(74,85,104,0.55)', fontFamily: 'var(--font-mono)', marginTop: 1 }} className="truncate">
                        {row.tx_id.slice(0, 16)}…
                      </div>
                    </div>

                    <div className="mono" style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.75)' }}>
                      {formatINRCompact(row.tx_amount)}
                    </div>

                    <div style={{ fontSize: '12px', color: 'rgba(136,146,164,0.7)' }}>
                      {METHOD_LABELS[row.tx_method] ?? row.tx_method}
                    </div>

                    <ScoreBar value={row.recoverability_score} max={1} color="#4f8ef7" />
                    <ScoreBar value={row.intent_score} max={100} color="#7c6fe8" />

                    <div style={{ fontSize: '11px', color: 'rgba(136,146,164,0.55)' }} className="truncate">
                      {ACTION_LABELS[row.selected_strategy] ?? '—'}
                    </div>

                    <StatusBadge status={row.case_status} />

                    <ExternalLink className="w-3.5 h-3.5" style={{ color: 'rgba(74,85,104,0.4)' }} />
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {filtered.length === 0 && (
              <div className="py-16 text-center" style={{ color: 'rgba(74,85,104,0.5)', fontSize: '13px' }}>
                No transactions match this filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <TxDrawer tx={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
