'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Save, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'

interface Policy {
  max_retries: number
  min_retry_interval_mins: number
  max_notifications_per_day: number
  min_recovery_amount_paise: number
  allowed_channels: string[]
  human_approval_threshold: number
  max_recovery_cost_paise: number
  auto_abandon_after_hours: number
}

const ALL_CHANNELS = [
  'RETRY_PAYMENT', 'WAIT_AND_RETRY', 'GENERATE_PAYMENT_LINK',
  'SEND_WHATSAPP', 'SEND_EMAIL', 'VOICE_CALL', 'ESCALATE_TO_HUMAN'
]

const CHANNEL_LABELS: Record<string, string> = {
  RETRY_PAYMENT: 'Retry Payment',
  WAIT_AND_RETRY: 'Wait & Retry',
  GENERATE_PAYMENT_LINK: 'Payment Link',
  SEND_WHATSAPP: 'WhatsApp',
  SEND_EMAIL: 'Email',
  VOICE_CALL: 'Voice Call',
  ESCALATE_TO_HUMAN: 'Escalate to Human',
}

function NumberField({
  label, value, onChange, min, max, unit, description
}: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string; description?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', color: 'rgba(136,146,164,0.7)', marginBottom: 8 }}>{label}</label>
      {description && (
        <p style={{ fontSize: '11px', color: 'rgba(74,85,104,0.55)', marginBottom: 8 }}>{description}</p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            width: 96,
            background: '#060a0f',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: '13px',
            color: 'rgba(240,244,255,0.85)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = '#4f8ef7' }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
        />
        {unit && <span style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)' }}>{unit}</span>}
      </div>
    </div>
  )
}

export default function PoliciesPage() {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPolicy = async () => {
    const res = await fetch('/api/policies')
    const data = await res.json()
    if (data.policy) setPolicy(data.policy)
  }

  useEffect(() => {
    const init = async () => { await fetchPolicy() }
    init()
  }, [])

  const save = async () => {
    if (!policy) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleChannel = (ch: string) => {
    if (!policy) return
    const current = policy.allowed_channels
    const updated = current.includes(ch)
      ? current.filter(c => c !== ch)
      : [...current, ch]
    setPolicy({ ...policy, allowed_channels: updated })
  }

  if (!policy) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const cardStyle = { background: '#0c1018', border: '1px solid rgba(255,255,255,0.07)' }
  const headStyle = { fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.82)', marginBottom: 16 }
  const noteStyle = { fontSize: '11px', color: 'rgba(74,85,104,0.6)', lineHeight: 1.55 }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'rgba(240,244,255,0.9)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield className="w-4 h-4" style={{ color: '#7c6fe8' }} />
            Merchant Policies
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(74,85,104,0.6)', marginTop: 2 }}>
            Define guardrails the AI operates within · changes take effect on the next decision
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPolicy}
            style={{ fontSize: '12px', color: 'rgba(136,146,164,0.6)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
          <motion.button
            onClick={save}
            disabled={saving}
            whileHover={!saving ? { scale: 1.01 } : {}}
            whileTap={!saving ? { scale: 0.99 } : {}}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: saved ? 'rgba(52,211,153,0.15)' : 'var(--accent)',
              color: saved ? '#34d399' : 'white',
              border: saved ? '1px solid rgba(52,211,153,0.3)' : 'none',
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'Saved!' : 'Save Changes'}
          </motion.button>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.22)', color: '#f87171' }}
        >
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* How it works */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'rgba(124,111,232,0.05)', border: '1px solid rgba(124,111,232,0.18)' }}
      >
        <div className="flex items-start gap-3">
          <Shield className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#7c6fe8' }} />
          <div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(240,244,255,0.85)', marginBottom: 6 }}>How the Policy Guard Works</p>
            <p style={noteStyle}>
              The AI engine proposes actions based on Expected Recovery Value calculations.
              Before any action executes, the Policy Guard validates it against these rules.
              A policy violation immediately blocks the action and the engine selects a safe fallback.
              The AI cannot override these rules.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Retry limits */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 style={headStyle}>Retry Limits</h2>
          <div className="space-y-4">
            <NumberField
              label="Maximum Retries"
              description="Max number of retry attempts before the engine falls back to another channel"
              value={policy.max_retries}
              onChange={v => setPolicy({ ...policy, max_retries: v })}
              min={1} max={5}
              unit="retries"
            />
            <NumberField
              label="Minimum Retry Interval"
              description="Minimum time between retries to avoid hammering the customer"
              value={policy.min_retry_interval_mins}
              onChange={v => setPolicy({ ...policy, min_retry_interval_mins: v })}
              min={5} max={1440}
              unit="minutes"
            />
            <NumberField
              label="Auto-Abandon After"
              description="If a case hasn't recovered in this window, it's automatically closed"
              value={policy.auto_abandon_after_hours}
              onChange={v => setPolicy({ ...policy, auto_abandon_after_hours: v })}
              min={1} max={168}
              unit="hours"
            />
          </div>
          <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={noteStyle}><strong style={{ color: 'rgba(136,146,164,0.65)' }}>Guard Rule:</strong> If retry attempts ≥ max_retries, all further retry actions are blocked.</p>
          </div>
        </div>

        {/* Notification limits */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 style={headStyle}>Notification Limits</h2>
          <div className="space-y-4">
            <NumberField
              label="Max Notifications / Day"
              description="Maximum notifications (WhatsApp + Email + Voice + Link) per customer per day"
              value={policy.max_notifications_per_day}
              onChange={v => setPolicy({ ...policy, max_notifications_per_day: v })}
              min={1} max={10}
              unit="per customer/day"
            />
          </div>
          <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={noteStyle}><strong style={{ color: 'rgba(136,146,164,0.65)' }}>Guard Rule:</strong> Prevents customer fatigue — AI skips notification channels once this limit is reached.</p>
          </div>
        </div>

        {/* Amount thresholds */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 style={headStyle}>Amount Thresholds</h2>
          <div className="space-y-4">
            <NumberField
              label="Minimum Recovery Amount"
              description="Transactions below this are not worth recovering"
              value={Math.floor(policy.min_recovery_amount_paise / 100)}
              onChange={v => setPolicy({ ...policy, min_recovery_amount_paise: v * 100 })}
              min={1} max={10000}
              unit="₹"
            />
            <NumberField
              label="Human Approval Threshold"
              description="Transactions above this value require human review before action"
              value={Math.floor(policy.human_approval_threshold / 100)}
              onChange={v => setPolicy({ ...policy, human_approval_threshold: v * 100 })}
              min={100}
              unit="₹"
            />
            <NumberField
              label="Max Recovery Cost"
              description="Max spend on outreach per transaction (SMS, link, etc.)"
              value={Math.floor(policy.max_recovery_cost_paise / 100)}
              onChange={v => setPolicy({ ...policy, max_recovery_cost_paise: v * 100 })}
              min={0} max={500}
              unit="₹"
            />
          </div>
          <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={noteStyle}><strong style={{ color: 'rgba(136,146,164,0.65)' }}>Guard Rule:</strong> Transactions outside these thresholds are skipped or escalated automatically.</p>
          </div>
        </div>

        {/* Allowed channels */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 style={headStyle}>Allowed Recovery Channels</h2>
          <div className="space-y-3">
            {ALL_CHANNELS.map(ch => {
              const isOn = policy.allowed_channels.includes(ch)
              return (
                <label key={ch} className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => toggleChannel(ch)}
                    className="shrink-0"
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      background: isOn ? '#4f8ef7' : 'rgba(255,255,255,0.08)',
                      border: isOn ? '1px solid rgba(79,142,247,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: 2,
                      left: isOn ? 17 : 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'white',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </div>
                  <span style={{
                    fontSize: '13px',
                    color: isOn ? 'rgba(240,244,255,0.85)' : 'rgba(136,146,164,0.45)',
                    transition: 'color 0.2s',
                  }}>
                    {CHANNEL_LABELS[ch] ?? ch}
                  </span>
                </label>
              )
            })}
          </div>
          <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={noteStyle}><strong style={{ color: 'rgba(136,146,164,0.65)' }}>Guard Rule:</strong> The AI can only select actions from enabled channels. Disabled channels are never executed.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
