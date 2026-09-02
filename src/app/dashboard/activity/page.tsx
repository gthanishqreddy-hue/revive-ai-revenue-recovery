'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, RefreshCw, Zap, Shield, CheckCircle, AlertCircle, Clock, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { formatDateTime, formatINR } from '@/lib/utils'

interface ActivityItem {
  id: string
  actor: string
  event: string
  severity: string
  created_at: string
  details?: string
}

interface AgentRun {
  id: string
  case_id: string
  stage: string
  status: string
  duration_ms: number
  created_at: string
  transaction_id?: string
  amount_recovered?: number
}

const STAGE_ICONS: Record<string, React.ElementType> = {
  diagnosis: AlertCircle,
  intent: Zap,
  strategy: Activity,
  policy: Shield,
  execution: CheckCircle,
  outcome: CheckCircle,
  ingestion: Clock,
}

const ACTOR_CFG: Record<string, { color: string; bg: string }> = {
  agent:   { color: '#4f8ef7', bg: 'rgba(79,142,247,0.1)' },
  system:  { color: '#7c6fe8', bg: 'rgba(124,111,232,0.1)' },
  webhook: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  user:    { color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
}

const SEVERITY_COLOR: Record<string, string> = {
  info:     '#4f8ef7',
  warning:  '#f59e0b',
  error:    '#f87171',
  critical: '#f87171',
}

const RUN_CFG: Record<string, { color: string; bg: string; border: string }> = {
  completed: { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)' },
  failed:    { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  running:   { color: '#7c6fe8', bg: 'rgba(124,111,232,0.1)', border: 'rgba(124,111,232,0.2)' },
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/activity', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`Failed to load activity (${res.status})`)
      }
      const data = await res.json()
      setActivity(data.activity ?? [])
      setAgentRuns(data.agent_runs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading activity feed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      await fetchData()
    }
    init()
    const interval = autoRefresh ? setInterval(fetchData, 10000) : null
    return () => { if (interval) clearInterval(interval) }
  }, [autoRefresh, fetchData])

  const cardStyle = { background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1
            style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Activity className="w-4 h-4" style={{ color: '#4f8ef7' }} />
            AI Agent Activity
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)', marginTop: 2 }}>
            Real-time autonomous recovery pipeline events
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-2 cursor-pointer"
            style={{ fontSize: '12px', color: 'rgba(136,146,164,0.6)' }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ accentColor: '#4f8ef7' }}
            />
            Auto-refresh (10s)
          </label>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(136,146,164,0.7)', cursor: 'pointer' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
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
            onClick={fetchData}
            className="px-3 py-1 rounded text-xs"
            style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Audit Log */}
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <div
            className="flex items-center gap-2.5 px-5 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="live-dot" />
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.8)' }}>
              Audit Log
            </span>
            <span
              className="mono ml-auto"
              style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)' }}
            >
              {activity.length} events
            </span>
          </div>

          <div style={{ maxHeight: 580, overflowY: 'auto' }}>
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 shimmer rounded-xl" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(74,85,104,0.5)', fontSize: '13px' }}>
                No activity yet. Run a simulation to generate events.
              </div>
            ) : (
              <div>
                <AnimatePresence>
                  {activity.map((item, i) => {
                    const actorCfg = ACTOR_CFG[item.actor] ?? ACTOR_CFG.system
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                        className="flex items-start gap-3 px-5 py-3.5"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0 mt-2"
                          style={{ background: SEVERITY_COLOR[item.severity] ?? '#4f8ef7' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <span
                              className="px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{ color: actorCfg.color, background: actorCfg.bg, letterSpacing: '0.04em' }}
                            >
                              {item.actor}
                            </span>
                            <span style={{ fontSize: '12px', color: 'rgba(240,244,255,0.72)' }}>
                              {item.event}
                            </span>
                          </div>
                          <div className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)', marginTop: 3 }}>
                            {formatDateTime(item.created_at)}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Stage Runs */}
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <div
            className="flex items-center gap-2.5 px-5 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Zap className="w-3.5 h-3.5" style={{ color: '#7c6fe8' }} />
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.8)' }}>
              Pipeline Stage Runs
            </span>
            <span
              className="mono ml-auto"
              style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)' }}
            >
              {agentRuns.length} runs
            </span>
          </div>

          <div style={{ maxHeight: 580, overflowY: 'auto' }}>
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 shimmer rounded-xl" />
                ))}
              </div>
            ) : agentRuns.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(74,85,104,0.5)', fontSize: '13px' }}>
                No pipeline runs yet.
              </div>
            ) : (
              <div>
                <AnimatePresence>
                  {agentRuns.map((run, i) => {
                    const Icon = STAGE_ICONS[run.stage] ?? Activity
                    const cfg = RUN_CFG[run.status] ?? RUN_CFG.running
                    const isRecovered = typeof run.amount_recovered === 'number' && run.amount_recovered > 0

                    return (
                      <motion.div
                        key={run.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                        className="flex items-center gap-3 px-5 py-3.5"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: cfg.bg }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span style={{ fontSize: '13px', color: 'rgba(240,244,255,0.78)', fontWeight: 500, textTransform: 'capitalize' }}>
                              {run.stage.replace(/_/g, ' ')} stage
                            </span>
                            <div className="flex items-center gap-2">
                              {isRecovered && (
                                <span
                                  className="mono text-[10px] px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}
                                >
                                  +{formatINR(run.amount_recovered as number)}
                                </span>
                              )}
                              {run.duration_ms && (
                                <span className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)' }}>
                                  {run.duration_ms}ms
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Link
                              href={`/dashboard/cases/${run.case_id}`}
                              className="mono truncate inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
                              style={{ fontSize: '10px', color: 'rgba(74,85,104,0.7)' }}
                            >
                              <span>{run.transaction_id ?? `case:${run.case_id?.slice(0, 16)}`}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </Link>
                            <span style={{ fontSize: '10px', color: 'rgba(74,85,104,0.4)' }}>·</span>
                            <span className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)' }}>
                              {formatDateTime(run.created_at)}
                            </span>
                          </div>
                        </div>

                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium shrink-0"
                          style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, letterSpacing: '0.04em' }}
                        >
                          {run.status}
                        </span>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
