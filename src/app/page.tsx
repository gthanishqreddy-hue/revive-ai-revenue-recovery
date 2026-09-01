'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { formatINRCompact } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  revenue_at_risk: number
  recovered: number
  recovery_rate: number
  actions_executed: number
  total_cases: number
}

// ─── Transaction particle data ────────────────────────────────────────────────

const SAMPLE_TXS = [
  { id: 1, amount: '₹4,999', method: 'UPI', status: 'failed' as const, x: 18, y: 22 },
  { id: 2, amount: '₹14,999', method: 'Card', status: 'recovered' as const, x: 72, y: 18 },
  { id: 3, amount: '₹1,249', method: 'UPI', status: 'failed' as const, x: 42, y: 38 },
  { id: 4, amount: '₹49,999', method: 'Net Banking', status: 'recovered' as const, x: 85, y: 55 },
  { id: 5, amount: '₹3,499', method: 'Wallet', status: 'failed' as const, x: 28, y: 65 },
  { id: 6, amount: '₹8,999', method: 'Card', status: 'recovered' as const, x: 60, y: 72 },
  { id: 7, amount: '₹599', method: 'UPI', status: 'failed' as const, x: 78, y: 35 },
  { id: 8, amount: '₹24,999', method: 'Net Banking', status: 'recovered' as const, x: 12, y: 50 },
]

// ─── PIPELINE STAGES ──────────────────────────────────────────────────────────

const PIPELINE = [
  { label: 'EVENT', sub: 'Payment failure detected' },
  { label: 'DIAGNOSIS', sub: 'Failure classified' },
  { label: 'INTENT', sub: 'Customer scored' },
  { label: 'RECOVERABILITY', sub: 'Probability estimated' },
  { label: 'STRATEGY', sub: 'Action evaluated' },
  { label: 'POLICY', sub: 'Guardrails checked' },
  { label: 'ACTION', sub: 'Recovery executed' },
  { label: 'OUTCOME', sub: 'Revenue measured' },
]

// ─── AI DECISION STRATEGIES ───────────────────────────────────────────────────

const STRATEGIES = [
  { label: 'WAIT + RETRY', erv: '₹3,899', prob: '78%', friction: 'Low', selected: true, angle: 270 },
  { label: 'PAYMENT LINK', erv: '₹3,124', prob: '62%', friction: 'Medium', selected: false, angle: 330 },
  { label: 'WHATSAPP', erv: '₹2,611', prob: '52%', friction: 'Medium', selected: false, angle: 30 },
  { label: 'EMAIL', erv: '₹1,849', prob: '37%', friction: 'Low', selected: false, angle: 90 },
  { label: 'IMMEDIATE RETRY', erv: '₹899', prob: '18%', friction: 'None', selected: false, angle: 150 },
  { label: 'NO ACTION', erv: '₹0', prob: '0%', friction: 'None', selected: false, angle: 210 },
]

// ─── GRAIN OVERLAY (lightweight SVG noise) ────────────────────────────────────

function GrainOverlay() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9998]"
      style={{
        opacity: 0.032,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '256px 256px',
        mixBlendMode: 'overlay',
      }}
    />
  )
}

// ─── SECTION 01: HERO ─────────────────────────────────────────────────────────

function HeroSection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94])

  return (
    <section
      ref={ref}
      className="relative min-h-[100svh] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#050608' }}
    >
      {/* Radial glow behind text */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 55%, rgba(79,142,247,0.07) 0%, transparent 70%)',
        }}
      />

      <motion.div
        style={{ y, opacity, scale }}
        className="relative z-10 text-center px-6 max-w-5xl mx-auto"
      >
        {/* Product name */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <span
            className="text-xs tracking-[0.28em] uppercase font-medium"
            style={{ color: 'rgba(79,142,247,0.7)' }}
          >
            REVIVE
          </span>
        </motion.div>

        {/* Main headline */}
        <div className="overflow-hidden mb-6">
          <motion.h1
            initial={{ opacity: 0, y: 60, filter: 'blur(12px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            style={{
              fontSize: 'clamp(3rem, 8vw, 7.5rem)',
              fontWeight: 300,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
              color: 'rgba(240,244,255,0.95)',
            }}
          >
            Recover revenue
          </motion.h1>
        </div>

        <div className="overflow-hidden mb-12">
          <motion.div
            initial={{ opacity: 0, y: 60, filter: 'blur(12px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
            style={{
              fontSize: 'clamp(3rem, 8vw, 7.5rem)',
              fontWeight: 300,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
              color: 'rgba(240,244,255,0.38)',
            }}
          >
            before it&apos;s lost.
          </motion.div>
        </div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.75 }}
          style={{ color: 'rgba(136,146,164,0.9)', fontSize: '1.0625rem', lineHeight: 1.65, maxWidth: '580px', margin: '0 auto 3rem' }}
        >
          REVIVE autonomously identifies recoverable revenue, evaluates intervention strategies,
          and executes recovery workflows within merchant-defined guardrails.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 1.0 }}
          className="flex items-center justify-center gap-4 flex-wrap"
        >
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            Enter Recovery Console
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a
            href="#demo"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(240,244,255,0.7)',
            }}
          >
            Watch REVIVE in action <ChevronRight className="w-4 h-4" />
          </a>
        </motion.div>
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <motion.div
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, rgba(79,142,247,0.6), transparent)' }}
        />
      </motion.div>
    </section>
  )
}

// ─── SECTION 02: REVENUE AT RISK ──────────────────────────────────────────────

function RevenueAtRiskSection({ metrics }: { metrics: Metrics | null }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-20% 0px' })

  return (
    <section
      ref={ref}
      className="min-h-[100svh] flex flex-col items-center justify-center px-6"
      style={{ background: '#050608' }}
    >
      <motion.div
        className="text-center max-w-3xl"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
      >
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="label-xs mb-8"
        >
          The scale of the problem
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
          animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          style={{
            fontSize: 'clamp(4rem, 12vw, 10rem)',
            fontWeight: 300,
            letterSpacing: '-0.05em',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1,
          }}
        >
          {metrics ? (
            <AnimatedNumber
              value={metrics.revenue_at_risk / 100}
              format={(v) => formatINRCompact(Math.round(v) * 100)}
              duration={2.2}
              className="text-gradient-mint"
            />
          ) : (
            <span style={{ color: 'rgba(240,244,255,0.08)' }}>₹—</span>
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.5 }}
          style={{ fontSize: '1.125rem', color: 'rgba(136,146,164,0.8)', marginTop: '1.5rem' }}
        >
          revenue currently at risk in your payment stream
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto"
        >
          {[
            { label: 'Failed transactions', value: metrics?.total_cases ?? 0 },
            { label: 'Recovery rate', value: metrics?.recovery_rate ?? 0, suffix: '%' },
            { label: 'Actions executed', value: metrics?.actions_executed ?? 0 },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div
                className="mono text-2xl font-medium mb-1"
                style={{ color: 'rgba(240,244,255,0.7)' }}
              >
                <AnimatedNumber
                  value={stat.value}
                  format={(v) => stat.suffix ? `${Math.round(v)}${stat.suffix}` : Math.round(v).toLocaleString('en-IN')}
                  duration={1.8}
                />
              </div>
              <div className="label-xs" style={{ color: 'rgba(136,146,164,0.5)' }}>{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}

// ─── SECTION 03: TRANSACTION PARTICLES ────────────────────────────────────────

function TransactionParticles() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })

  return (
    <section
      ref={ref}
      className="min-h-[100svh] relative overflow-hidden flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(to bottom, #050608 0%, #070a10 100%)' }}
    >
      <div className="relative w-full max-w-4xl aspect-[4/3] mx-auto">
        {SAMPLE_TXS.map((tx, i) => (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={inView ? {
              opacity: 1,
              scale: 1,
              y: tx.status === 'failed' ? [0, 6, 0] : 0,
            } : {}}
            transition={{
              delay: i * 0.12,
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
              y: { duration: 3 + i * 0.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }
            }}
            className="absolute"
            style={{ left: `${tx.x}%`, top: `${tx.y}%` }}
          >
            <div
              className="px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm"
              style={{
                background: tx.status === 'failed'
                  ? 'rgba(248,113,113,0.08)'
                  : 'rgba(52,211,153,0.08)',
                border: `1px solid ${tx.status === 'failed' ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.2)'}`,
                color: tx.status === 'failed'
                  ? 'rgba(248,113,113,0.8)'
                  : 'rgba(52,211,153,0.8)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>{tx.amount}</span>
              <span
                className="ml-2 opacity-50"
                style={{ fontSize: '10px' }}
              >
                {tx.method}
              </span>
            </div>
          </motion.div>
        ))}

        {/* Center label */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <p className="label-xs mb-3" style={{ color: 'rgba(79,142,247,0.6)' }}>
            REVIVE identifies recoverable payments
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 300, letterSpacing: '-0.02em', color: 'rgba(240,244,255,0.6)' }}>
            Red falls. Green returns.
          </p>
        </motion.div>
      </div>
    </section>
  )
}

// ─── SECTION 04: PIPELINE ─────────────────────────────────────────────────────

function PipelineSection() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })

  return (
    <section
      ref={ref}
      className="min-h-[100svh] flex flex-col items-center justify-center px-6 py-24"
      style={{ background: '#050608' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="text-center mb-20 max-w-2xl mx-auto"
      >
        <p className="label-xs mb-4" style={{ color: 'rgba(79,142,247,0.6)' }}>The Engine</p>
        <h2
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 3.2rem)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            color: 'rgba(240,244,255,0.9)',
            lineHeight: 1.15,
          }}
        >
          Don&apos;t just detect the loss.<br />
          <span style={{ color: 'rgba(240,244,255,0.4)' }}>Decide what to do about it.</span>
        </h2>
      </motion.div>

      {/* Pipeline stages */}
      <div className="flex flex-col items-center gap-0">
        {PIPELINE.map((stage, i) => (
          <motion.div
            key={stage.label}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ duration: 0.45, delay: 0.1 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center"
          >
            <div
              className="px-6 py-2.5 rounded-xl text-center"
              style={{
                background: i === 0 ? 'rgba(248,113,113,0.08)' :
                            i === PIPELINE.length - 1 ? 'rgba(52,211,153,0.08)' :
                            'rgba(79,142,247,0.06)',
                border: `1px solid ${
                  i === 0 ? 'rgba(248,113,113,0.18)' :
                  i === PIPELINE.length - 1 ? 'rgba(52,211,153,0.18)' :
                  'rgba(79,142,247,0.14)'
                }`,
                minWidth: '200px',
              }}
            >
              <div
                className="text-xs font-semibold tracking-widest"
                style={{
                  color: i === 0 ? 'rgba(248,113,113,0.9)' :
                         i === PIPELINE.length - 1 ? 'rgba(52,211,153,0.9)' :
                         'rgba(79,142,247,0.85)',
                  letterSpacing: '0.14em',
                }}
              >
                {stage.label}
              </div>
              <div
                className="text-xs mt-0.5"
                style={{ color: 'rgba(136,146,164,0.55)' }}
              >
                {stage.sub}
              </div>
            </div>
            {i < PIPELINE.length - 1 && (
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={inView ? { scaleY: 1, opacity: 1 } : {}}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.1 }}
                style={{
                  width: 1,
                  height: 28,
                  background: 'linear-gradient(to bottom, rgba(79,142,247,0.25), rgba(79,142,247,0.06))',
                  transformOrigin: 'top',
                }}
              />
            )}
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── SECTION 05: AI DECISION VISUALIZATION ────────────────────────────────────

function AIDecisionSection() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!inView) return
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [inView])

  return (
    <section
      ref={ref}
      className="min-h-[100svh] flex flex-col items-center justify-center px-6 py-24"
      style={{ background: 'linear-gradient(180deg, #050608 0%, #06080e 100%)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="text-center mb-16 max-w-xl mx-auto"
      >
        <p className="label-xs mb-3" style={{ color: 'rgba(124,111,232,0.7)' }}>AI Decision Engine</p>
        <h2
          style={{
            fontSize: 'clamp(1.6rem, 3.5vw, 2.8rem)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            color: 'rgba(240,244,255,0.88)',
          }}
        >
          Six strategies compete.<br />
          <span style={{ color: 'rgba(240,244,255,0.35)' }}>One wins on Expected Recovery Value.</span>
        </h2>
      </motion.div>

      <div className="w-full max-w-3xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Transaction card — center focus */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="md:col-span-1 flex flex-col justify-center"
          >
            <div
              className="p-5 rounded-2xl text-center"
              style={{
                background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.18)',
              }}
            >
              <div className="label-xs mb-3" style={{ color: 'rgba(248,113,113,0.7)' }}>FAILED PAYMENT</div>
              <div
                className="mono text-3xl font-medium mb-1"
                style={{ color: 'rgba(240,244,255,0.9)' }}
              >
                ₹4,999
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(136,146,164,0.6)' }}>UPI · Bank Timeout</div>
            </div>
          </motion.div>

          {/* Strategies */}
          <div className="md:col-span-2 space-y-2">
            {STRATEGIES.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: 20 }}
                animate={inView && phase >= 1 ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500"
                style={{
                  background: s.selected && phase >= 3
                    ? 'rgba(52,211,153,0.08)'
                    : phase >= 2
                    ? 'rgba(79,142,247,0.04)'
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${
                    s.selected && phase >= 3
                      ? 'rgba(52,211,153,0.25)'
                      : 'rgba(255,255,255,0.06)'
                  }`,
                  transform: s.selected && phase >= 3 ? 'scale(1.01)' : 'scale(1)',
                }}
              >
                <div className="flex-1">
                  <div
                    className="text-xs font-semibold tracking-wide"
                    style={{
                      color: s.selected && phase >= 3
                        ? 'rgba(52,211,153,0.95)'
                        : 'rgba(240,244,255,0.7)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {s.selected && phase >= 3 && (
                      <span className="mr-2 text-mint">✓</span>
                    )}
                    {s.label}
                  </div>
                </div>
                {phase >= 2 && (
                  <>
                    <div className="text-xs mono" style={{ color: 'rgba(136,146,164,0.55)', minWidth: 40, textAlign: 'right' }}>
                      {s.prob}
                    </div>
                    <div
                      className="text-xs mono font-medium"
                      style={{
                        color: s.selected ? 'rgba(52,211,153,0.85)' : 'rgba(240,244,255,0.35)',
                        minWidth: 60,
                        textAlign: 'right'
                      }}
                    >
                      {s.erv}
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Selected strategy callout */}
        <AnimatePresence>
          {phase >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mt-8 p-5 rounded-2xl text-center"
              style={{
                background: 'rgba(52,211,153,0.06)',
                border: '1px solid rgba(52,211,153,0.2)',
              }}
            >
              <div className="label-xs mb-2" style={{ color: 'rgba(52,211,153,0.6)' }}>
                SELECTED STRATEGY
              </div>
              <div
                className="text-lg font-semibold mb-1"
                style={{ color: 'rgba(52,211,153,0.95)', letterSpacing: '-0.01em' }}
              >
                WAIT + RETRY
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(136,146,164,0.7)' }}>
                78% recovery probability · ₹3,899 expected recovery
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

// ─── SECTION 06: POLICY GUARD ─────────────────────────────────────────────────

function PolicyGuardSection() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!inView) return
    const timers = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 1100),
      setTimeout(() => setStep(3), 1800),
      setTimeout(() => setStep(4), 2500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [inView])

  const POLICY_STEPS = [
    { label: 'AI Decision', value: 'RETRY_PAYMENT', color: 'rgba(79,142,247,0.85)' },
    { label: 'Policy Rule', value: 'Max 2 retries', color: 'rgba(245,158,11,0.85)' },
    { label: 'Current Count', value: '2 retries used', color: 'rgba(248,113,113,0.85)' },
    { label: 'BLOCKED →', value: 'PAYMENT LINK', color: 'rgba(52,211,153,0.85)' },
  ]

  return (
    <section
      ref={ref}
      className="min-h-[100svh] flex flex-col items-center justify-center px-6 py-24"
      style={{ background: '#050608' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="text-center mb-16 max-w-xl mx-auto"
      >
        <p className="label-xs mb-3" style={{ color: 'rgba(245,158,11,0.7)' }}>Safety Architecture</p>
        <h2
          style={{
            fontSize: 'clamp(1.6rem, 3.5vw, 2.8rem)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            color: 'rgba(240,244,255,0.88)',
          }}
        >
          The AI proposes.<br />
          <span style={{ color: 'rgba(240,244,255,0.35)' }}>The Policy Guard decides.</span>
        </h2>
      </motion.div>

      {/* Policy evaluation */}
      <div className="w-full max-w-sm mx-auto space-y-3">
        {POLICY_STEPS.map((ps, i) => (
          <AnimatePresence key={ps.label}>
            {step > i && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between px-5 py-3.5 rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <span style={{ fontSize: '12px', color: 'rgba(136,146,164,0.65)', letterSpacing: '0.04em' }}>
                  {ps.label}
                </span>
                <span
                  className="mono text-sm font-medium"
                  style={{ color: ps.color }}
                >
                  {ps.value}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        ))}

        {step >= 4 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mt-6 p-4 rounded-xl text-center"
            style={{
              background: 'rgba(52,211,153,0.06)',
              border: '1px solid rgba(52,211,153,0.2)',
            }}
          >
            <p className="label-xs mb-1" style={{ color: 'rgba(52,211,153,0.7)' }}>
              SAFE FALLBACK SELECTED
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(136,146,164,0.7)' }}>
              The AI cannot override merchant limits. A compliant action is chosen automatically.
            </p>
          </motion.div>
        )}
      </div>
    </section>
  )
}

// ─── SECTION 07: RECOVERY SUCCESS ─────────────────────────────────────────────

function RecoverySuccessSection({ metrics }: { metrics: Metrics | null }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-20% 0px' })
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!inView) return
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2200),
      setTimeout(() => setPhase(5), 3200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [inView])

  const recoveredDisplay = metrics && metrics.recovered > 0
    ? `${formatINRCompact(metrics.recovered)} recovered`
    : '₹4,999 recovered'

  const STEPS = [
    'Payment failed',
    'REVIVE analyzed',
    'Strategy selected',
    'Policy approved',
    recoveredDisplay,
  ]

  return (
    <section
      ref={ref}
      className="min-h-[100svh] flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, #050608 0%, #051008 100%)' }}
    >
      <div className="text-center max-w-md mx-auto">
        <motion.p
          className="label-xs mb-12"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          style={{ color: 'rgba(52,211,153,0.5)' }}
        >
          Autonomous execution
        </motion.p>

        <div className="space-y-5">
          {STEPS.map((s, i) => (
            <AnimatePresence key={s}>
              {phase > i && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className={`text-base font-${i === STEPS.length - 1 ? 'semibold' : 'normal'}`}
                    style={{
                      color: i === STEPS.length - 1
                        ? 'rgba(52,211,153,0.95)'
                        : i === 0
                        ? 'rgba(248,113,113,0.8)'
                        : 'rgba(240,244,255,0.55)',
                      fontSize: i === STEPS.length - 1 ? '1.75rem' : '0.9375rem',
                      letterSpacing: i === STEPS.length - 1 ? '-0.02em' : '0',
                      fontFamily: i === STEPS.length - 1 ? 'var(--font-mono)' : 'inherit',
                    }}
                  >
                    {s}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      style={{
                        width: 1,
                        height: 20,
                        background: 'rgba(255,255,255,0.08)',
                        margin: '8px 0',
                      }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── SECTION 08: THE MONEY MOMENT ────────────────────────────────────────────

function MoneyMomentSection({ metrics }: { metrics: Metrics | null }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-20% 0px' })

  return (
    <section
      ref={ref}
      className="min-h-[100svh] flex flex-col items-center justify-center px-6 text-center"
      style={{ background: '#050608' }}
    >
      <motion.p
        className="label-xs mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        style={{ color: 'rgba(52,211,153,0.55)' }}
      >
        Recovered by REVIVE
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 40, filter: 'blur(12px)' }}
        animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        style={{
          fontSize: 'clamp(3.5rem, 10vw, 9rem)',
          fontWeight: 300,
          letterSpacing: '-0.05em',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1,
        }}
      >
        {metrics ? (
          <AnimatedNumber
            value={metrics.recovered / 100}
            format={(v) => formatINRCompact(Math.round(v) * 100)}
            duration={2.5}
            className="text-gradient-mint"
          />
        ) : (
          <span style={{ color: 'rgba(52,211,153,0.2)' }}>₹—</span>
        )}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, delay: 0.6 }}
        style={{ fontSize: '1.0625rem', color: 'rgba(136,146,164,0.65)', marginTop: '1.5rem' }}
      >
        revenue restored to your business
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, delay: 0.9 }}
        className="mt-16 flex items-center gap-10 flex-wrap justify-center"
      >
        {[
          { label: 'Recovery rate', value: metrics ? `${metrics.recovery_rate.toFixed(1)}%` : '—' },
          { label: 'Actions taken', value: metrics ? metrics.actions_executed.toLocaleString('en-IN') : '—' },
          { label: 'Policy violations', value: '0' },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div
              className="mono text-2xl font-medium"
              style={{ color: 'rgba(240,244,255,0.6)' }}
            >
              {s.value}
            </div>
            <div className="label-xs mt-1" style={{ color: 'rgba(136,146,164,0.4)' }}>{s.label}</div>
          </div>
        ))}
      </motion.div>
    </section>
  )
}

// ─── SECTION 10: FINAL CTA ────────────────────────────────────────────────────

function FinalCTA() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-20% 0px' })

  return (
    <section
      ref={ref}
      className="min-h-[80svh] flex flex-col items-center justify-center px-6 text-center"
      id="demo"
      style={{ background: '#050608' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-2xl mx-auto"
      >
        <h2
          style={{
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            color: 'rgba(240,244,255,0.9)',
            lineHeight: 1.1,
            marginBottom: '1.5rem',
          }}
        >
          Recover what would<br />
          <span style={{ color: 'rgba(240,244,255,0.35)' }}>have been lost.</span>
        </h2>

        <p style={{ color: 'rgba(136,146,164,0.7)', marginBottom: '3rem', fontSize: '0.9375rem' }}>
          The Recovery Console is ready. 229 failed transactions are waiting.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 px-8 py-4 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Enter Recovery Console
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link
            href="/dashboard/command-center"
            className="flex items-center gap-2 px-6 py-4 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(240,244,255,0.6)',
            }}
          >
            Explore the system <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="mt-24 flex items-center gap-6"
        style={{ color: 'rgba(74,85,104,0.6)', fontSize: '11px', letterSpacing: '0.04em' }}
      >
        <span>REVIVE · Autonomous AI Revenue Recovery</span>
        <span style={{ color: 'rgba(74,85,104,0.3)' }}>·</span>
        <span
          className="px-2 py-0.5 rounded"
          style={{
            background: 'rgba(245,158,11,0.08)',
            color: 'rgba(245,158,11,0.5)',
            border: '1px solid rgba(245,158,11,0.12)',
          }}
        >
          DEMO · All data is synthetic
        </span>
      </motion.div>
    </section>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)

  useEffect(() => {
    // Init DB silently; fetch metrics for the landing page
    fetch('/api/init')
      .then(() => fetch('/api/dashboard'))
      .then(r => r.json())
      .then(d => { if (d.metrics) setMetrics(d.metrics) })
      .catch(() => {})
  }, [])

  return (
    <>
      <GrainOverlay />

      {/* Minimal sticky nav */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4"
        style={{ backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'var(--accent)' }}
          >
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>R</span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.01em', color: 'rgba(240,244,255,0.8)' }}>
            REVIVE
          </span>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-all duration-200"
          style={{
            background: 'rgba(79,142,247,0.1)',
            border: '1px solid rgba(79,142,247,0.2)',
            color: 'rgba(79,142,247,0.9)',
          }}
        >
          Recovery Console <ArrowRight className="w-3 h-3" />
        </Link>
      </header>

      <main>
        <HeroSection />
        <RevenueAtRiskSection metrics={metrics} />
        <TransactionParticles />
        <PipelineSection />
        <AIDecisionSection />
        <PolicyGuardSection />
        <RecoverySuccessSection metrics={metrics} />
        <MoneyMomentSection metrics={metrics} />
        <FinalCTA />
      </main>
    </>
  )
}
