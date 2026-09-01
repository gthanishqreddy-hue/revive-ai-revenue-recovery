'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { formatINR, ACTION_LABELS, CATEGORY_LABELS } from '@/lib/utils'
import { staggerContainer, fadeUp } from '@/lib/motion'

interface CaseRow {
  id: string
  transaction_id: string
  status: string
  failure_category: string
  severity: string
  recoverability_score: number
  intent_score: number
  expected_recovery: number
  actual_recovery: number
  selected_strategy: string
  created_at: string
  updated_at: string
  customer_name?: string
  tx_amount?: number
}

const STATUS_CFG: Record<string, { text: string; bg: string; border: string; label: string }> = {
  recovered:         { text: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.22)',  label: 'Recovered' },
  open:              { text: '#4f8ef7', bg: 'rgba(79,142,247,0.08)',   border: 'rgba(79,142,247,0.22)',  label: 'Open' },
  executing:         { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)',  label: 'Executing' },
  recovering:        { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)',  label: 'Recovering' },
  failed:            { text: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.22)', label: 'Failed' },
  abandoned:         { text: 'rgba(136,146,164,0.5)', bg: 'rgba(74,85,104,0.08)', border: 'rgba(74,85,104,0.18)', label: 'Abandoned' },
  no_action:         { text: 'rgba(136,146,164,0.5)', bg: 'rgba(74,85,104,0.08)', border: 'rgba(74,85,104,0.18)', label: 'No Action' },
  strategy_selected: { text: '#7c6fe8', bg: 'rgba(124,111,232,0.08)', border: 'rgba(124,111,232,0.2)', label: 'Strategy Set' },
  diagnosing:        { text: '#7c6fe8', bg: 'rgba(124,111,232,0.08)', border: 'rgba(124,111,232,0.2)', label: 'Diagnosing' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.open
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: cfg.text, background: cfg.bg, border: `1px solid ${cfg.border}`, letterSpacing: '0.03em' }}
    >
      {cfg.label}
    </span>
  )
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCases = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transactions')
      const data = await res.json()
      const rows = (data.transactions ?? []) as Record<string, unknown>[]
      const mapped = rows
        .filter(r => r.case_id)
        .map(r => ({
          id: r.case_id as string,
          transaction_id: r.tx_id as string,
          status: r.case_status as string,
          failure_category: r.failure_category as string,
          severity: r.severity as string,
          recoverability_score: r.recoverability_score as number,
          intent_score: r.intent_score as number,
          expected_recovery: r.expected_recovery as number,
          actual_recovery: r.actual_recovery as number,
          selected_strategy: r.selected_strategy as string,
          created_at: r.tx_created_at as string,
          updated_at: r.case_updated_at as string,
          customer_name: r.customer_name as string,
          tx_amount: r.tx_amount as number,
        }))
      setCases(mapped)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => { await fetchCases() }
    init()
  }, [fetchCases])

  const stats = [
    { label: 'Recovered', count: cases.filter(c => c.status === 'recovered').length, color: '#34d399', border: 'rgba(52,211,153,0.18)', bg: 'rgba(52,211,153,0.05)' },
    { label: 'Executing', count: cases.filter(c => ['executing', 'recovering'].includes(c.status)).length, color: '#f59e0b', border: 'rgba(245,158,11,0.18)', bg: 'rgba(245,158,11,0.05)' },
    { label: 'Open', count: cases.filter(c => c.status === 'open').length, color: '#4f8ef7', border: 'rgba(79,142,247,0.18)', bg: 'rgba(79,142,247,0.05)' },
    { label: 'Failed', count: cases.filter(c => c.status === 'failed').length, color: '#f87171', border: 'rgba(248,113,113,0.18)', bg: 'rgba(248,113,113,0.05)' },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <FolderOpen className="w-4 h-4" style={{ color: '#4f8ef7' }} />
            Recovery Cases
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)', marginTop: 2 }}>
            {cases.length} cases · click a row to view details
          </p>
        </div>
        <button
          onClick={fetchCases}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(136,146,164,0.7)', cursor: 'pointer' }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Status summary */}
      <motion.div
        variants={staggerContainer(0.07, 0)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-4 gap-4"
      >
        {stats.map(s => (
          <motion.div
            key={s.label}
            variants={fadeUp}
            className="rounded-xl p-4"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
          >
            <div className="mono text-2xl font-semibold" style={{ color: s.color, letterSpacing: '-0.03em' }}>
              {s.count}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(74,85,104,0.65)', marginTop: 4 }}>{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 shimmer rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Head */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr 80px 110px 110px 80px 80px 100px 24px',
              gap: 12,
              padding: '10px 20px',
              background: '#0c1018',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {['Case ID', 'Customer', 'Amount', 'Failure', 'Strategy', 'Expected', 'Actual', 'Status', ''].map(h => (
              <div key={h} style={{ fontSize: '10px', letterSpacing: '0.06em', color: 'rgba(74,85,104,0.6)', textTransform: 'uppercase' }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ background: '#080c12' }}>
            <AnimatePresence mode="popLayout">
              {cases.slice(0, 100).map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.25) }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 80px 110px 110px 80px 80px 100px 24px',
                    gap: 12,
                    padding: '12px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  <span className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.55)' }}>
                    {c.id.slice(0, 18)}…
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgba(240,244,255,0.78)', fontWeight: 450 }}>
                    {c.customer_name ?? '—'}
                  </span>
                  <span className="mono" style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(240,244,255,0.7)' }}>
                    {c.tx_amount ? formatINR(c.tx_amount) : '—'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(136,146,164,0.6)' }}>
                    {CATEGORY_LABELS[c.failure_category] ?? '—'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(136,146,164,0.55)' }}>
                    {c.selected_strategy ? ACTION_LABELS[c.selected_strategy] : '—'}
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: 'rgba(245,158,11,0.75)' }}>
                    {c.expected_recovery ? formatINR(c.expected_recovery) : '—'}
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: c.actual_recovery ? '#34d399' : 'rgba(74,85,104,0.4)' }}>
                    {c.actual_recovery ? formatINR(c.actual_recovery) : '—'}
                  </span>
                  <StatusBadge status={c.status} />
                  <Link href={`/dashboard/cases/${c.id}`}>
                    <ExternalLink className="w-3.5 h-3.5" style={{ color: 'rgba(74,85,104,0.4)' }} />
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
            {cases.length === 0 && (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(74,85,104,0.5)', fontSize: '13px' }}>
                No cases found. Run a simulation to generate recovery cases.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
