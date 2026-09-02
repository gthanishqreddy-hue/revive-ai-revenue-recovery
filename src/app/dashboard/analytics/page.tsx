'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { BarChart3, RefreshCw, AlertCircle } from 'lucide-react'
import { formatINR, formatINRCompact, CATEGORY_LABELS, ACTION_LABELS, METHOD_LABELS } from '@/lib/utils'

const COLORS = ['#4f8ef7', '#7c6fe8', '#34d399', '#f59e0b', '#f87171', '#22d3ee']

const axisStyle = { fill: 'rgba(74,85,104,0.7)', fontSize: 10 }

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-4 py-3 text-xs" style={{ background: '#0f1520', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}>
      <p style={{ color: 'rgba(136,146,164,0.7)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === 'number' && p.value > 10000 ? formatINR(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`Failed to load analytics (${res.status})`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => { await fetchData() }
    init()
  }, [])

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 shimmer rounded-lg" />
        <div className="grid grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-64 shimmer rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (error || (!data && !loading)) {
    return (
      <div className="p-6 space-y-4">
        <div
          className="rounded-xl p-4 flex items-center justify-between"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span style={{ fontSize: '13px' }}>{error ?? 'Analytics data unavailable'}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 rounded text-xs"
            style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const byCategory = ((data.by_category as Record<string, unknown>[]) ?? []).map(c => ({
    name: CATEGORY_LABELS[c.failure_category as string] ?? c.failure_category,
    total: c.total as number,
    recovered: c.recovered as number,
    rate: (c.total as number) > 0 ? Math.round(((c.recovered as number) / (c.total as number)) * 100) : 0,
  }))

  const byMethod = ((data.by_method as Record<string, unknown>[]) ?? []).map(m => ({
    name: METHOD_LABELS[m.method as string] ?? m.method,
    cases: m.total_cases as number,
    recovered: m.recovered_cases as number,
    amount: m.recovered_amount as number,
    rate: m.recovery_rate as number,
  }))

  const byAction = ((data.by_action as Record<string, unknown>[]) ?? []).map(a => ({
    name: ACTION_LABELS[a.action as string] ?? a.action,
    attempts: a.total_attempts as number,
    successful: a.successful as number,
    rate: a.success_rate as number,
    amount: a.recovered_amount as number,
  }))

  // Pie chart: case status distribution
  const metrics = data.metrics as Record<string, number>
  const statusPie = [
    { name: 'Recovered', value: metrics.recovered_cases ?? 0, color: '#34d399' },
    { name: 'In Progress', value: metrics.open_cases ?? 0, color: '#4f8ef7' },
    { name: 'Failed', value: metrics.failed_cases ?? 0, color: '#f87171' },
  ]

  const cardStyle = { background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }
  const headStyle = { fontSize: '12px', fontWeight: 500, color: 'rgba(136,146,164,0.75)', marginBottom: 16, letterSpacing: '0.02em' }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 className="w-4 h-4" style={{ color: '#4f8ef7' }} />
            Analytics
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)', marginTop: 2 }}>Recovery performance across all failure types</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(136,146,164,0.7)', cursor: 'pointer' }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* KPI summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-3 gap-4"
      >
        {[
          { label: 'Revenue at Risk', value: formatINRCompact(metrics.revenue_at_risk ?? 0), color: '#f87171' },
          { label: 'Total Recovered', value: formatINRCompact(metrics.recovered ?? 0), color: '#34d399' },
          { label: 'Recovery Rate', value: `${(metrics.recovery_rate ?? 0).toFixed(1)}%`, color: '#4f8ef7' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-5 text-center" style={cardStyle}>
            <div className="text-3xl font-semibold mono" style={{ color, letterSpacing: '-0.04em' }}>{value}</div>
            <div style={{ fontSize: '11px', color: 'rgba(74,85,104,0.6)', marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </motion.div>

      {/* Charts row 1 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        <div className="rounded-xl p-5" style={cardStyle}>
          <h3 style={headStyle}>Recovery by Failure Category</h3>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={byCategory} margin={{ top: 0, right: 0, left: -18, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ ...axisStyle }} angle={-25} textAnchor="end" />
              <YAxis tick={{ ...axisStyle }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(74,85,104,0.7)' }} />
              <Bar dataKey="total" name="Total" fill="rgba(79,142,247,0.15)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="recovered" name="Recovered" fill="#34d399" radius={[3, 3, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5" style={cardStyle}>
          <h3 style={headStyle}>Case Status Distribution</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={210}>
              <PieChart>
                <Pie data={statusPie} cx="50%" cy="50%" innerRadius={52} outerRadius={78} dataKey="value" strokeWidth={0} paddingAngle={2}>
                  {statusPie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} opacity={0.88} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 flex-1">
              {statusPie.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span style={{ fontSize: '12px', color: 'rgba(136,146,164,0.7)' }}>{s.name}</span>
                  </div>
                  <span className="mono" style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.7)' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Charts row 2 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.24 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        <div className="rounded-xl p-5" style={cardStyle}>
          <h3 style={headStyle}>Recovery Rate by Payment Method</h3>
          <ResponsiveContainer width="100%" height={195}>
            <BarChart data={byMethod} margin={{ top: 0, right: 0, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ ...axisStyle }} />
              <YAxis tick={{ ...axisStyle }} unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="rate" name="Recovery Rate %" radius={[3, 3, 0, 0]}>
                {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5" style={cardStyle}>
          <h3 style={headStyle}>Action Effectiveness</h3>
          <ResponsiveContainer width="100%" height={195}>
            <BarChart data={byAction} layout="vertical" margin={{ top: 0, right: 8, left: 95, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ ...axisStyle }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ ...axisStyle }} width={92} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="rate" name="Success Rate %" radius={[0, 3, 3, 0]}>
                {byAction.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Recovered amount by action */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.36 }}
        className="rounded-xl p-5"
        style={cardStyle}
      >
        <h3 style={headStyle}>Recovered Revenue by Action Type</h3>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={byAction} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="name" tick={{ ...axisStyle }} />
            <YAxis tick={{ ...axisStyle }} tickFormatter={v => formatINRCompact(v)} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="amount" name="Recovered ₹" radius={[3, 3, 0, 0]}>
              {byAction.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  )
}
