'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, AlertCircle, CheckCircle, Zap, Activity, RefreshCw, ArrowUpRight
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { formatINR, formatINRCompact, formatPercent, CATEGORY_LABELS, METHOD_LABELS } from '@/lib/utils'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { staggerContainer, fadeUp } from '@/lib/motion'

interface DashboardData {
  metrics: {
    revenue_at_risk: number
    recoverable: number
    recovered: number
    recovery_rate: number
    actions_executed: number
    open_cases: number
    total_cases: number
  }
  by_method: { method: string; total_cases: number; recovered_cases: number; recovered_amount: number; recovery_rate: number }[]
  by_category: { failure_category: string; total: number; recovered: number }[]
  by_action: { action: string; total_attempts: number; successful: number; success_rate: number; recovered_amount: number }[]
  activity: { id: string; actor: string; event: string; severity: string; created_at: string }[]
}

const CHART_COLORS = ['#4f8ef7', '#7c6fe8', '#34d399', '#f59e0b', '#f87171', '#22d3ee']

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs"
      style={{
        background: '#0f1520',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ color: 'rgba(136,146,164,0.7)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: 'rgba(240,244,255,0.9)', fontWeight: 500 }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? formatINR(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function MetricCard({
  label, value, rawValue, sub, color, icon: Icon, index
}: {
  label: string; value: string; rawValue?: number; sub?: string; color: string; icon: React.ElementType; index: number
}) {
  return (
    <motion.div
      variants={fadeUp}
      custom={index}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="metric-card rounded-xl p-5"
      style={{
        background: '#0c1018',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: '11px', color: 'rgba(136,146,164,0.6)', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}14` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <div
        className="text-2xl font-semibold mono mb-1.5"
        style={{ color, letterSpacing: '-0.02em' }}
      >
        {rawValue !== undefined ? (
          <AnimatedNumber value={rawValue} format={() => value} duration={1.4} />
        ) : value}
      </div>
      {sub && (
        <div style={{ fontSize: '11px', color: 'rgba(74,85,104,0.7)' }}>{sub}</div>
      )}
    </motion.div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchData = useCallback(async () => {
    try {
      await fetch('/api/init')
      const res = await fetch('/api/dashboard')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      setLastRefresh(new Date())
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
    const interval = setInterval(init, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="p-6 space-y-5">
        <div className="h-7 w-48 shimmer rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 shimmer rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 shimmer rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <AlertCircle className="w-7 h-7 mx-auto mb-3" style={{ color: '#f87171' }} />
        <p style={{ color: '#f87171', fontSize: '14px' }}>{error}</p>
        <button onClick={fetchData} style={{ color: 'rgba(79,142,247,0.8)', fontSize: '13px', marginTop: 12 }}>
          Retry
        </button>
      </div>
    </div>
  )

  if (!data) return null
  const { metrics } = data

  const categoryData = data.by_category.map(c => ({
    name: CATEGORY_LABELS[c.failure_category] ?? c.failure_category,
    total: c.total,
    recovered: c.recovered,
  }))

  const methodData = data.by_method.map(m => ({
    name: METHOD_LABELS[m.method] ?? m.method,
    rate: m.recovery_rate,
    amount: m.recovered_amount,
  }))

  const statusPie = [
    { name: 'Recovered', value: Math.round((metrics.recovery_rate / 100) * metrics.total_cases), color: '#34d399' },
    { name: 'In Progress', value: metrics.open_cases, color: '#4f8ef7' },
    { name: 'Failed', value: Math.max(0, metrics.total_cases - Math.round((metrics.recovery_rate / 100) * metrics.total_cases) - metrics.open_cases), color: '#f87171' },
  ]

  const METRICS = [
    { label: 'Revenue at Risk', value: formatINRCompact(metrics.revenue_at_risk), rawValue: metrics.revenue_at_risk, sub: `${metrics.total_cases} failed transactions`, color: '#f87171', icon: AlertCircle },
    { label: 'Recoverable', value: formatINRCompact(metrics.recoverable), rawValue: metrics.recoverable, sub: 'Recoverability >30%', color: '#f59e0b', icon: TrendingUp },
    { label: 'Recovered', value: formatINRCompact(metrics.recovered), rawValue: metrics.recovered, sub: 'Actual revenue restored', color: '#34d399', icon: CheckCircle },
    { label: 'Recovery Rate', value: formatPercent(metrics.recovery_rate), rawValue: metrics.recovery_rate, sub: 'Of all cases', color: '#4f8ef7', icon: ArrowUpRight },
    { label: 'Actions', value: metrics.actions_executed.toLocaleString(), rawValue: metrics.actions_executed, sub: 'Recovery actions executed', color: '#7c6fe8', icon: Zap },
    { label: 'Open Cases', value: metrics.open_cases.toLocaleString(), rawValue: metrics.open_cases, sub: 'Awaiting recovery', color: '#22d3ee', icon: Activity },
  ]

  const axisStyle = { fill: 'rgba(74,85,104,0.7)', fontSize: 10 }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)' }}
          >
            Revenue Recovery
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)', marginTop: 2 }}>
            Acme Commerce · Last updated {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors duration-150"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(136,146,164,0.7)',
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </motion.button>
      </div>

      {/* KPI Cards */}
      <motion.div
        variants={staggerContainer(0.06, 0)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
      >
        {METRICS.map((m, i) => (
          <MetricCard key={m.label} {...m} index={i} />
        ))}
      </motion.div>

      {/* Charts */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        {/* Recovery by category */}
        <div
          className="rounded-xl p-5"
          style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(136,146,164,0.8)', marginBottom: 16, letterSpacing: '0.02em' }}>
            Recovery by Failure Type
          </h3>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Total" fill="rgba(79,142,247,0.15)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="recovered" name="Recovered" fill="#34d399" radius={[3, 3, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Case status distribution */}
        <div
          className="rounded-xl p-5"
          style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(136,146,164,0.8)', marginBottom: 16, letterSpacing: '0.02em' }}>
            Case Status Distribution
          </h3>
          <div className="flex items-center gap-6">
            <div style={{ height: 160, width: 160, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value" strokeWidth={0} paddingAngle={2}>
                    {statusPie.map((e, i) => <Cell key={i} fill={e.color} opacity={0.85} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 flex-1">
              {statusPie.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span style={{ fontSize: '12px', color: 'rgba(136,146,164,0.7)' }}>{s.name}</span>
                  </div>
                  <span className="mono" style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.7)' }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        {/* Recovery rate by method */}
        <div
          className="rounded-xl p-5"
          style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(136,146,164,0.8)', marginBottom: 16 }}>
            Recovery Rate by Payment Method
          </h3>
          <div style={{ height: 165 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={methodData} margin={{ top: 0, right: 0, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={axisStyle} />
                <YAxis tick={axisStyle} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="rate" name="Recovery Rate %" fill="#4f8ef7" radius={[3, 3, 0, 0]} opacity={0.8}>
                  {methodData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent activity */}
        <div
          className="rounded-xl p-5"
          style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(136,146,164,0.8)' }}>
              Agent Activity
            </h3>
            <div className="flex items-center gap-1.5">
              <div className="live-dot" />
              <span style={{ fontSize: '10px', color: 'rgba(52,211,153,0.6)', letterSpacing: '0.06em' }}>LIVE</span>
            </div>
          </div>
          <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 160 }}>
            {data.activity.slice(0, 8).map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-2.5"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                  style={{
                    background: item.severity === 'error' ? '#f87171' :
                                item.severity === 'warning' ? '#f59e0b' : '#4f8ef7'
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: '12px', color: 'rgba(240,244,255,0.65)' }} className="truncate">
                    {item.event}
                  </p>
                  <p style={{ fontSize: '10px', color: 'rgba(74,85,104,0.6)' }}>
                    {new Date(item.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            ))}
            {data.activity.length === 0 && (
              <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.5)', textAlign: 'center', paddingTop: 20 }}>
                No activity yet. Run a simulation to see events.
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
