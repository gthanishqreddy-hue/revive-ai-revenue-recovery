'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, CheckCircle, XCircle, Clock, Zap, Shield, AlertCircle, RotateCcw, Sparkles } from 'lucide-react'
import { formatINR, ACTION_LABELS } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface PipelineStage {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  durationMs?: number
  summary: string
}

// Matches the shape returned by /api/simulation for a single transaction
interface ApiStage {
  name: string
  status: 'completed' | 'failed' | 'skipped'
  durationMs: number
  summary: string
  timestamp: string
}

interface ApiResult {
  action: string
  recovered: boolean
  amountRecovered: number
  reasoning: string[]
  stages: ApiStage[]
  modelUsed?: string
  aiUsed?: boolean
}

interface SimResult {
  processed: number
  recovered: number
  failed: number
  total_recovered: number
  recovery_rate: number
}

interface AIRuntimeStatus {
  available: boolean
  providerName: string
  modelName: string
  statusLabel: string
}

// ── Stage metadata (icons/colors only — summaries come from API) ────────────

const STAGE_META = [
  { name: 'Data Loading',         icon: Clock,       color: '#4f8ef7' },
  { name: 'Transaction Diagnosis', icon: AlertCircle, color: '#f59e0b' },
  { name: 'Customer Intent',       icon: Zap,         color: '#7c6fe8' },
  { name: 'Strategy Selection',    icon: Play,        color: '#4f8ef7' },
  { name: 'Policy Guard',          icon: Shield,      color: '#34d399' },
  { name: 'Action Execution',      icon: Zap,         color: '#34d399' },
  { name: 'Outcome Evaluation',    icon: CheckCircle, color: '#34d399' },
]

// Deterministic animation timings per stage (ms shown while "running")
const STAGE_TIMINGS = [350, 500, 550, 650, 450, 600, 400]

const DEMO_TX = {
  id:       'tx_demo_00042',
  amount:   499900,
  method:   'UPI',
  customer: 'Priya Sharma',
  failure:  'Bank timeout — UPI_TIMEOUT',
}

// ── Hook: animated pipeline that drives stages from real API result ───────────

function useAnimatedPipeline() {
  const [stages,       setStages]       = useState<PipelineStage[]>([])
  const [running,      setRunning]      = useState(false)
  const [result,       setResult]       = useState<ApiResult | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [currentStage, setCurrentStage] = useState(-1)

  const run = useCallback(async () => {
    setRunning(true)
    setStages([])
    setResult(null)
    setError(null)
    setCurrentStage(-1)

    // ── STEP 1: Fetch real result FIRST ──────────────────────────────────────
    let apiResult: ApiResult | null = null
    let fetchError: string | null = null

    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: DEMO_TX.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        fetchError = data.error ?? `Server error (${res.status})`
      } else if (data.result) {
        apiResult = data.result as ApiResult
      } else {
        fetchError = data.error ?? 'No result returned from pipeline'
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : 'Network error — could not reach server'
    }

    // ── STEP 2: If API failed, show error without any fake success ───────────
    if (fetchError || !apiResult) {
      setError(fetchError ?? 'Pipeline returned no result')
      setRunning(false)
      setCurrentStage(-1)
      return
    }

    // ── STEP 3: Animate stages using REAL summaries from the API ─────────────
    const realStages = apiResult.stages ?? []

    for (let i = 0; i < STAGE_META.length; i++) {
      setCurrentStage(i)
      const meta = STAGE_META[i]

      setStages(prev => [...prev, {
        name:    meta.name,
        status:  'running',
        summary: 'Processing…',
      }])

      await new Promise(r => setTimeout(r, STAGE_TIMINGS[i]))

      // Match real stage by index
      const real = realStages[i]
      const realSummary = real?.summary ?? meta.name + ' completed'
      const realDuration = real?.durationMs ?? STAGE_TIMINGS[i]
      const realStatus   = real?.status === 'failed' ? 'failed' : 'completed'

      setStages(prev => prev.map((s, idx) =>
        idx === i
          ? { ...s, status: realStatus, summary: realSummary, durationMs: realDuration }
          : s
      ))
    }

    setResult(apiResult)
    setCurrentStage(-1)
    setRunning(false)
  }, [])

  return { stages, running, result, error, currentStage, run }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const { stages, running, result, error, currentStage, run } = useAnimatedPipeline()
  const [simRunning, setSimRunning] = useState(false)
  const [simResult,  setSimResult]  = useState<SimResult | null>(null)
  const [simProgress, setSimProgress] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const [aiStatus, setAiStatus] = useState<AIRuntimeStatus>({
    available: false,
    providerName: 'Google Gemini',
    modelName: 'deterministic-fallback',
    statusLabel: 'Checking AI status…',
  })

  useEffect(() => {
    fetch('/api/ai-status')
      .then(res => res.json())
      .then(data => {
        if (data.statusLabel) setAiStatus(data)
      })
      .catch(() => {})
  }, [])

  const reset = () => {
    setResetKey(k => k + 1)
  }

  const runFullSim = async () => {
    setSimRunning(true)
    setSimResult(null)
    setSimProgress(0)

    const prog = setInterval(() => setSimProgress(p => Math.min(p + 3, 88)), 180)

    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json()
      setSimProgress(100)
      if (d.summary) setSimResult(d.summary)
    } finally {
      clearInterval(prog)
      setSimRunning(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1
            className="flex items-center gap-2"
            style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)' }}
          >
            <Zap className="w-4 h-4" style={{ color: '#4f8ef7' }} />
            Recovery Command Center
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)', marginTop: 2 }}>
            Live autonomous pipeline · watch every decision in real time
          </p>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-3">
          {/* AI Runtime Availability Badge */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: aiStatus.available ? 'rgba(124,111,232,0.1)' : 'rgba(79,142,247,0.08)',
              border: `1px solid ${aiStatus.available ? 'rgba(124,111,232,0.3)' : 'rgba(79,142,247,0.2)'}`,
            }}
          >
            {aiStatus.available ? (
              <>
                <Sparkles className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
                <span style={{ fontSize: '11px', color: 'rgba(196,181,253,0.95)', fontWeight: 500, letterSpacing: '0.02em' }}>
                  AI ACTIVE ({aiStatus.modelName})
                </span>
              </>
            ) : (
              <>
                <Shield className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />
                <span style={{ fontSize: '11px', color: 'rgba(147,197,253,0.9)', fontWeight: 500, letterSpacing: '0.02em' }}>
                  AI FALLBACK (Deterministic Engine)
                </span>
              </>
            )}
          </div>

          {/* Demo Mode badge */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
            <span style={{ fontSize: '10px', color: 'rgba(245,158,11,0.7)', fontWeight: 500, letterSpacing: '0.06em' }}>
              DEMO MODE
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* LEFT: Demo Panel */}
        <div className="xl:col-span-2 space-y-4">
          {/* Transaction card */}
          <div
            className="rounded-2xl p-5"
            style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p style={{ fontSize: '11px', letterSpacing: '0.07em', color: 'rgba(248,113,113,0.7)', marginBottom: 12 }}>
              ⚠ PAYMENT FAILED
            </p>

            <div className="flex items-end gap-3 mb-3">
              <span
                className="mono"
                style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.04em', color: 'rgba(240,244,255,0.9)' }}
              >
                {formatINR(DEMO_TX.amount)}
              </span>
              <span style={{ fontSize: '12px', color: 'rgba(136,146,164,0.5)', paddingBottom: 4 }}>
                {DEMO_TX.method} · {DEMO_TX.customer}
              </span>
            </div>

            <p style={{ fontSize: '12px', color: 'rgba(136,146,164,0.45)' }}>{DEMO_TX.failure}</p>
            <p
              style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'rgba(74,85,104,0.5)', marginTop: 4 }}
            >
              {DEMO_TX.id}
            </p>

            <div className="flex gap-3 mt-5">
              <motion.button
                onClick={run}
                disabled={running || simRunning}
                whileHover={!running ? { scale: 1.01 } : {}}
                whileTap={!running ? { scale: 0.99 } : {}}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: running ? 'rgba(79,142,247,0.2)' : 'var(--accent)',
                  color: 'white',
                  opacity: simRunning ? 0.4 : 1,
                  cursor: running || simRunning ? 'not-allowed' : 'pointer',
                  border: 'none',
                  outline: 'none',
                }}
              >
                {running ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Running pipeline…
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" /> Run Recovery Pipeline
                  </>
                )}
              </motion.button>

              {(stages.length > 0 || result || error) && !running && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={reset}
                  className="px-3 py-3 rounded-xl transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(136,146,164,0.6)',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </div>

          {/* AI Safety Architecture note */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#0c1018', border: '1px solid rgba(124,111,232,0.15)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-3.5 h-3.5" style={{ color: '#7c6fe8' }} />
              <p style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(240,244,255,0.7)', letterSpacing: '0.02em' }}>
                AI Safety Stack
              </p>
            </div>
            {[
              ['LLM Decision', aiStatus.available ? `${aiStatus.modelName} (Structured JSON)` : 'Deterministic ERV Safety Floor', '#7c6fe8'],
              ['Validation', 'Zod schema validation', '#4f8ef7'],
              ['Policy Guard', 'Deterministic merchant rules', '#f59e0b'],
              ['Execution', 'Idempotent provider boundary', '#34d399'],
            ].map(([label, val, color]) => (
              <div key={label} className="flex items-center gap-2 mb-2">
                <div className="w-px h-4" style={{ background: `${color}40`, marginLeft: 6 }} />
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: '11px', color: `${color}80`, marginRight: 6 }}>{label}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(74,85,104,0.6)' }}>{val}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Pipeline stages + results */}
        <div className="xl:col-span-3 space-y-4">
          {/* Live pipeline */}
          <AnimatePresence mode="wait">
            {(stages.length > 0 || running) && (
              <motion.div
                key={resetKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl p-5"
                style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(136,146,164,0.6)', letterSpacing: '0.04em', marginBottom: 16 }}>
                  RECOVERY PIPELINE
                </p>

                <div className="space-y-2">
                  {STAGE_META.map((meta, i) => {
                    const stage    = stages[i]
                    const isActive = currentStage === i
                    const isDone   = stage?.status === 'completed'
                    const isFailed = stage?.status === 'failed'
                    const isVisible = stage !== undefined

                    return (
                      <AnimatePresence key={meta.name}>
                        {isVisible && (
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            className="flex items-start gap-3 px-4 py-3 rounded-xl"
                            style={{
                              background: isFailed
                                ? 'rgba(248,113,113,0.05)'
                                : isDone
                                ? 'rgba(52,211,153,0.04)'
                                : isActive
                                ? 'rgba(79,142,247,0.06)'
                                : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${
                                isFailed ? 'rgba(248,113,113,0.2)' :
                                isDone   ? 'rgba(52,211,153,0.15)' :
                                isActive ? 'rgba(79,142,247,0.2)' :
                                'rgba(255,255,255,0.05)'
                              }`,
                            }}
                          >
                            {/* Status icon */}
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{
                                background: isFailed ? 'rgba(248,113,113,0.12)' :
                                             isDone   ? 'rgba(52,211,153,0.12)' :
                                             isActive ? 'rgba(79,142,247,0.12)' :
                                             'rgba(255,255,255,0.04)',
                              }}
                            >
                              {isDone ? (
                                <CheckCircle className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
                              ) : isFailed ? (
                                <XCircle className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
                              ) : isActive ? (
                                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <meta.icon className="w-3.5 h-3.5" style={{ color: 'rgba(74,85,104,0.5)' }} />
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    color: isFailed ? 'rgba(248,113,113,0.9)' :
                                           isDone   ? 'rgba(240,244,255,0.85)' :
                                           isActive ? 'rgba(79,142,247,0.9)' :
                                                      'rgba(136,146,164,0.5)',
                                  }}
                                >
                                  {meta.name}
                                </span>
                                {stage?.durationMs != null && (
                                  <span className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)' }}>
                                    {stage.durationMs}ms
                                  </span>
                                )}
                              </div>
                              <p style={{ fontSize: '11px', color: 'rgba(136,146,164,0.5)', marginTop: 2 }}>
                                {stage.summary}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── ERROR STATE — shown when API fails, never fabricate success ── */}
          <AnimatePresence>
            {error && !running && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-2xl p-5"
                style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(248,113,113,0.12)' }}
                  >
                    <XCircle className="w-5 h-5" style={{ color: '#f87171' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f87171' }}>
                      Pipeline Error
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(136,146,164,0.5)', marginTop: 2 }}>
                      The recovery pipeline could not complete
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-xl px-4 py-3 mb-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'rgba(248,113,113,0.7)', lineHeight: 1.6 }}>
                    {error}
                  </p>
                </div>

                <motion.button
                  onClick={run}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: 'rgba(248,113,113,0.1)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    color: '#f87171',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry Pipeline
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── SUCCESS / FAILURE RESULT — real data from API only ─────────── */}
          <AnimatePresence>
            {result && !running && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl p-5"
                style={{
                  background: result.recovered ? 'rgba(52,211,153,0.05)' : 'rgba(248,113,113,0.05)',
                  border: `1px solid ${result.recovered ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                }}
              >
                {/* Result header */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: result.recovered ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)' }}
                    >
                      {result.recovered
                        ? <CheckCircle className="w-5 h-5" style={{ color: '#34d399' }} />
                        : <XCircle    className="w-5 h-5" style={{ color: '#f87171' }} />
                      }
                    </div>
                    <div>
                      <div
                        className="mono font-semibold"
                        style={{
                          fontSize: '1.375rem',
                          color: result.recovered ? '#34d399' : '#f87171',
                          letterSpacing: '-0.03em',
                        }}
                      >
                        {result.recovered
                          ? `${formatINR(result.amountRecovered)} RECOVERED`
                          : 'RECOVERY FAILED'
                        }
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(136,146,164,0.5)', marginTop: 2 }}>
                        Strategy: {ACTION_LABELS[result.action] ?? result.action}
                      </div>
                    </div>
                  </div>

                  {/* Engine Model Badge */}
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] mono"
                    style={{
                      background: result.aiUsed ? 'rgba(124,111,232,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${result.aiUsed ? 'rgba(124,111,232,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      color: result.aiUsed ? '#c4b5fd' : 'rgba(136,146,164,0.7)',
                    }}
                  >
                    {result.aiUsed ? <Sparkles className="w-3 h-3 text-purple-400" /> : <Shield className="w-3 h-3 text-blue-400" />}
                    <span>Model: {result.modelUsed ?? 'deterministic-fallback'}</span>
                  </div>
                </div>

                {/* Reasoning — from real engine output */}
                {result.reasoning.length > 0 && (
                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <p style={{ fontSize: '10px', letterSpacing: '0.07em', color: 'rgba(79,142,247,0.6)', marginBottom: 10 }}>
                      DECISION REASONING & SIGNALS
                    </p>
                    <div className="space-y-1.5">
                      {result.reasoning.map((r, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.07 }}
                          className="flex items-start gap-2"
                        >
                          <span style={{ color: '#4f8ef7', fontSize: '10px', marginTop: 2 }}>✓</span>
                          <span style={{ fontSize: '12px', color: 'rgba(136,146,164,0.75)', lineHeight: 1.5 }}>{r}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Batch simulation */}
          <div
            className="rounded-2xl p-5"
            style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <h2 style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.75)', marginBottom: 4 }}>
              Batch Revenue Recovery
            </h2>
            <p style={{ fontSize: '11px', color: 'rgba(74,85,104,0.6)', marginBottom: 16 }}>
              Run all pending cases through the full AI engine
            </p>

            {simRunning && (
              <div className="mb-4">
                {[
                  'Analyzing transactions',
                  'Diagnosis',
                  'Strategy evaluation',
                  'Policy validation',
                  'Recovery execution',
                ].map((label, i) => {
                  const barProgress = Math.max(0, Math.min(100, simProgress - i * 18))
                  return (
                    <div key={label} className="flex items-center gap-3 mb-2">
                      <span style={{ fontSize: '10px', color: 'rgba(136,146,164,0.45)', width: 120, flexShrink: 0 }}>{label}</span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: '#4f8ef7', width: `${barProgress}%` }}
                          animate={{ width: `${barProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <span className="mono" style={{ fontSize: '10px', color: 'rgba(74,85,104,0.5)', width: 28, textAlign: 'right' }}>
                        {Math.round(barProgress)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {simResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 rounded-xl p-4"
                style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)' }}
              >
                <p style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(52,211,153,0.7)', marginBottom: 10, letterSpacing: '0.04em' }}>
                  SIMULATION COMPLETE
                </p>
                {[
                  { label: 'Cases processed', value: simResult.processed.toLocaleString('en-IN') },
                  { label: 'Successful',       value: simResult.recovered.toLocaleString('en-IN'), color: '#34d399' },
                  { label: 'Failed',            value: simResult.failed.toLocaleString('en-IN'), color: '#f87171' },
                  { label: 'Revenue recovered', value: `₹${(simResult.total_recovered / 100).toLocaleString('en-IN')}`, color: '#34d399', large: true },
                  { label: 'Recovery rate',     value: `${simResult.recovery_rate}%`, color: '#4f8ef7' },
                ].map(({ label, value, color, large }) => (
                  <div key={label} className="flex justify-between items-center mb-1.5">
                    <span style={{ fontSize: '11px', color: 'rgba(74,85,104,0.6)' }}>{label}</span>
                    <span
                      className="mono"
                      style={{
                        fontSize: large ? '1.1rem' : '12px',
                        fontWeight: large ? 600 : 500,
                        color: color ?? 'rgba(240,244,255,0.6)',
                        letterSpacing: large ? '-0.02em' : '0',
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}

            <motion.button
              onClick={runFullSim}
              disabled={simRunning || running}
              whileHover={!simRunning ? { scale: 1.01 } : {}}
              whileTap={!simRunning ? { scale: 0.99 } : {}}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
              style={{
                background: simRunning ? 'rgba(124,111,232,0.2)' : '#7c6fe8',
                color: 'white',
                border: 'none',
                cursor: simRunning || running ? 'not-allowed' : 'pointer',
                opacity: running ? 0.5 : 1,
              }}
            >
              {simRunning ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running simulation…
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Run Full Simulation
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
