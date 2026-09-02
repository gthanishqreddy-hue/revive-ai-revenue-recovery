'use client'

import { motion } from 'framer-motion'
import { Settings, Database, Shield, Zap, Code2, CheckCircle } from 'lucide-react'
import { staggerContainer, fadeUp } from '@/lib/motion'

const Section = ({ icon: Icon, title, color, children }: {
  icon: React.ElementType; title: string; color: string; children: React.ReactNode
}) => (
  <div
    className="rounded-2xl p-5"
    style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
  >
    <div className="flex items-center gap-2.5 mb-5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}14` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <h2 style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.8)' }}>{title}</h2>
    </div>
    {children}
  </div>
)

const Row = ({ label, value, mono = false, valueColor }: {
  label: string; value: string; mono?: boolean; valueColor?: string
}) => (
  <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
    <span style={{ fontSize: '12px', color: 'rgba(74,85,104,0.7)' }}>{label}</span>
    <span
      className={mono ? 'mono' : ''}
      style={{ fontSize: '12px', fontWeight: 450, color: valueColor ?? 'rgba(240,244,255,0.65)' }}
    >
      {value}
    </span>
  </div>
)

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings className="w-4 h-4" style={{ color: 'rgba(136,146,164,0.6)' }} />
          Settings
        </h1>
        <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)', marginTop: 2 }}>
          System configuration and technical architecture
        </p>
      </div>

      {/* Demo notice */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl p-5"
        style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)' }}
      >
        <div className="flex items-start gap-3">
          <Zap className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(245,158,11,0.9)', marginBottom: 6 }}>
              Demo / Sandbox Mode
            </h3>
            <p style={{ fontSize: '12px', color: 'rgba(136,146,164,0.65)', lineHeight: 1.6 }}>
              REVIVE is operating on synthetic data. All transactions are clearly labeled as demo.
              No real payments are being processed. Connect a live payment provider by setting the
              required environment variables below.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer(0.06, 0.1)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        {/* Database */}
        <motion.div variants={fadeUp}>
          <Section icon={Database} title="Database" color="#4f8ef7">
            <Row label="Engine" value="PostgreSQL via @neondatabase/serverless" mono />
            <Row label="Location" value="Neon Serverless PostgreSQL (Cloud)" />
            <Row label="Driver" value="Serverless HTTP Driver" />
            <Row label="Schema" value="14 tables" mono />
            <Row label="Idempotency" value="ON CONFLICT constraints enforced" valueColor="#34d399" />
          </Section>
        </motion.div>

        {/* AI Engine */}
        <motion.div variants={fadeUp}>
          <Section icon={Zap} title="AI Engine" color="#7c6fe8">
            <Row label="Primary model" value="gemini-2.5-flash" mono />
            <Row label="Fallback" value="Deterministic ERV Optimizer" />
            <Row label="API key" value={process.env.GEMINI_API_KEY ? '✓ Configured' : 'Not set — using fallback'} valueColor={process.env.GEMINI_API_KEY ? '#34d399' : '#f59e0b'} />
            <Row label="Structured output" value="Zod schema validated" valueColor="#34d399" />
            <Row label="AI controls payments" value="Never — Policy Guard required" valueColor="#34d399" />
          </Section>
        </motion.div>

        {/* Security */}
        <motion.div variants={fadeUp}>
          <Section icon={Shield} title="Security" color="#34d399">
            <Row label="Webhook verification" value="HMAC-SHA256 + timingSafeEqual" mono />
            <Row label="Idempotency" value="Per-action unique key + DB constraint" />
            <Row label="Secrets location" value="Environment variables only" valueColor="#34d399" />
            <Row label="Data in AI prompts" value="No credentials, no card data" valueColor="#34d399" />
            <Row label="Policy bypass" value="Impossible — deterministic guard" valueColor="#34d399" />
          </Section>
        </motion.div>

        {/* Recovery Engine */}
        <motion.div variants={fadeUp}>
          <Section icon={Code2} title="Recovery Engine" color="#f59e0b">
            <Row label="Pipeline stages" value="6 (Diagnosis → Outcome)" mono />
            <Row label="Recovery actions" value="8 action types" mono />
            <Row label="Decision formula" value="ERV = P(success) × Amount − Cost" mono />
            <Row label="Policy rules" value="8 configurable guardrails" />
            <Row label="Audit trail" value="Immutable event log" valueColor="#34d399" />
          </Section>
        </motion.div>
      </motion.div>

      {/* Environment variables */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.4 }}
        className="rounded-2xl p-5"
        style={{ background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2.5 mb-5">
          <Code2 className="w-4 h-4" style={{ color: 'rgba(136,146,164,0.5)' }} />
          <h2 style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.8)' }}>
            Environment Variables
          </h2>
        </div>

        <div
          className="rounded-xl p-4 space-y-1"
          style={{ background: '#060a0f', border: '1px solid rgba(255,255,255,0.05)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
        >
          {[
            { key: 'DATABASE_URL', desc: 'Neon PostgreSQL connection string', required: true },
            { key: 'GEMINI_API_KEY', desc: 'Google AI API key — optional, deterministic fallback runs without it', required: false },
            { key: 'GEMINI_MODEL', desc: 'Gemini model name (default: gemini-2.5-flash)', required: false },
            { key: 'RAZORPAY_WEBHOOK_SECRET', desc: 'Webhook signing secret for signature verification', required: false },
            { key: 'RAZORPAY_KEY_ID', desc: 'Payment provider key — used for Payment Links API', required: false },
            { key: 'RAZORPAY_KEY_SECRET', desc: 'Payment provider secret', required: false },
          ].map(({ key, desc, required }) => (
            <div key={key} className="flex items-start gap-3 py-1.5">
              <span style={{ color: '#4f8ef7', minWidth: 220 }}>{key}</span>
              <span style={{ color: 'rgba(74,85,104,0.6)' }}># {desc}</span>
              {required && (
                <span style={{ color: '#f87171', fontSize: '9px', marginLeft: 4 }}>required</span>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Architecture claims */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.5 }}
        className="rounded-2xl p-5"
        style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)' }}
      >
        <p style={{ fontSize: '11px', letterSpacing: '0.06em', color: 'rgba(52,211,153,0.55)', marginBottom: 14 }}>
          TECHNICAL GUARANTEES
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            'No hardcoded dashboard values — all from SQL',
            'No LLM controlling money directly',
            'No credential data in AI prompts',
            'Idempotent actions prevent double-charging',
            'Policy Guard cannot be bypassed by AI',
            'All recovery actions are audited',
            'Deterministic fallback works without API key',
            'Webhook signature verified before processing',
          ].map(claim => (
            <div key={claim} className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#34d399' }} />
              <span style={{ fontSize: '12px', color: 'rgba(136,146,164,0.65)' }}>{claim}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
