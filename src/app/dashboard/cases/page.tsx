'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
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

interface CaseSummary {
  total_cases: number
  recovered_cases: number
  in_progress_cases: number
  open_cases: number
  failed_cases: number
  total_recovered: number
  recovery_rate: number
}

const STATUS_CFG: Record<string, { text: string; bg: string; border: string; label: string }> = {
  recovered:         { text: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.22)',  label: 'Recovered' },
  open:              { text: '#4f8ef7', bg: 'rgba(79,142,247,0.08)',   border: 'rgba(79,142,247,0.22)',  label: 'Open' },
  executing:         { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)',  label: 'Executing' },
  recovering:        { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)',  label: 'Recovering' },
  failed:            { text: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.22)', label: 'Failed' },
  abandoned:         { text: 'rgba(136,146,164,0.6)', bg: 'rgba(74,85,104,0.08)', border: 'rgba(74,85,104,0.18)', label: 'Abandoned' },
  no_action:         { text: 'rgba(136,146,164,0.6)', bg: 'rgba(74,85,104,0.08)', border: 'rgba(74,85,104,0.18)', label: 'No Action' },
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
  const [summary, setSummary] = useState<CaseSummary | null>(null)
  const [filter, setFilter] = useState<'all' | 'recovered' | 'in_progress' | 'failed'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCases = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cases', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`Failed to load recovery cases (${res.status})`)
      }
      const data = await res.json()
      setSummary(data.summary ?? null)
      setCases(data.cases ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading recovery cases')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => { await fetchCases() }
    init()
  }, [fetchCases])

  const total = summary?.total_cases ?? cases.length
  const recovered = summary?.recovered_cases ?? cases.filter(c => c.status === 'recovered').length
  const inProgress = summary?.in_progress_cases ?? cases.filter(c => ['open', 'diagnosing', 'strategy_selected', 'executing', 'recovering'].includes(c.status)).length
  const failed = summary?.failed_cases ?? cases.filter(c => ['failed', 'abandoned', 'no_action'].includes(c.status)).length
  const recoveryRate = summary?.recovery_rate ?? (total > 0 ? Math.round((recovered / total) * 1000) / 10 : 0)

  const stats = [
    { key: 'recovered',   label: 'Recovered',     count: recovered,  color: '#34d399', border: 'rgba(52,211,153,0.18)', bg: 'rgba(52,211,153,0.05)' },
    { key: 'in_progress', label: 'In Progress',   count: inProgress, color: '#4f8ef7', border: 'rgba(79,142,247,0.18)', bg: 'rgba(79,142,247,0.05)' },
    { key: 'failed',      label: 'Failed / Closed', count: failed,   color: '#f87171', border: 'rgba(248,113,113,0.18)', bg: 'rgba(248,113,113,0.05)' },
    { key: 'all',         label: 'Recovery Rate', count: `${recoveryRate}%`, color: '#7c6fe8', border: 'rgba(124,111,232,0.18)', bg: 'rgba(124,111,232,0.05)' },
  ]

  const filteredCases = cases.filter(c => {
    if (filter === 'recovered') return c.status === 'recovered'
    if (filter === 'in_progress') return ['open', 'diagnosing', 'strategy_selected', 'executing', 'recovering'].includes(c.status)
    if (filter === 'failed') return ['failed', 'abandoned', 'no_action'].includes(c.status)
    return true
  })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1
            style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <FolderOpen className="w-4 h-4" style={{ color: '#4f8ef7' }} />
            Recovery Cases
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)', marginTop: 2 }}>
            {total} total cases · click a row to view complete recovery timeline
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

      {error && (
        <div
          className="rounded-xl p-4 flex items-center justify-between"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span style={{ fontSize: '13px' }}>{error}</span>
          </div>
          <button
            onClick={fetchCases}
            className="px-3 py-1 rounded text-xs"
            style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Status summary */}
      <motion.div
        variants={staggerContainer(0.07, 0)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {stats.map(s => (
          <motion.div
            key={s.label}
            variants={fadeUp}
            className="rounded-xl p-4 cursor-pointer transition-transform hover:-translate-y-0.5"
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
            }}
            onClick={() => {
              if (s.key === 'recovered' || s.key === 'in_progress' || s.key === 'failed') {
                setFilter(s.key as typeof filter)
              } else {
                setFilter('all')
              }
            }}
          >
            <div className="mono text-2xl font-semibold" style={{ color: s.color, letterSpacing: '-0.03em' }}>
              {s.count}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(74,85,104,0.75)', marginTop: 4 }}>{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        {[
          { id: 'all', label: `All (${total})` },
          { id: 'recovered', label: `Recovered (${recovered})` },
          { id: 'in_progress', label: `In Progress (${inProgress})` },
          { id: 'failed', label: `Failed (${failed})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === tab.id
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-zinc-400 hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            {tab.label}
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
              {filteredCases.map((c, i) => (
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
            {filteredCases.length === 0 && (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(74,85,104,0.5)', fontSize: '13px' }}>
                No recovery cases matching the selected filter.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
