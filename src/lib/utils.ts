// Utility helpers shared across the application

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Tailwind class merge utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format paise to INR string: 499900 → "₹4,999"
export function formatINR(paise: number): string {
  const rupees = Math.floor(paise / 100)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees)
}

// Format large INR amounts: 10000000 → "₹1L" or "₹10L"
export function formatINRCompact(paise: number): string {
  const rupees = Math.floor(paise / 100)
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1)}Cr`
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`
  return `₹${rupees}`
}

// Format percentage
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

// Generate a new UUID (used for idempotency keys)
export { v4 as uuidv4 } from 'uuid'

// Generate idempotency key for recovery actions
// Scoped to the recovery case so that a forceNew pipeline run (new case UUID)
// for the same transaction never collides with a prior case's attempt rows.
// Genuine duplicate execution within the SAME case (same caseId + action + attempt)
// still produces an identical key and is correctly rejected by the UNIQUE constraint.
export function makeIdempotencyKey(
  caseId: string,
  transactionId: string,
  actionType: string,
  attemptNumber: number
): string {
  return `${caseId}_${transactionId}_${actionType}_${attemptNumber}`
}

// Format relative time: "2 minutes ago", "1 hour ago"
export function timeAgo(isoString: string): string {
  const now = new Date()
  const then = new Date(isoString)
  const diffMs = now.getTime() - then.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s ago`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

// Format ISO string to display time: "10:31:04"
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// Format ISO string to display date+time: "22 Aug, 10:31"
export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// Recovery action display names
export const ACTION_LABELS: Record<string, string> = {
  RETRY_PAYMENT: 'Retry Payment',
  GENERATE_PAYMENT_LINK: 'Payment Link',
  SEND_WHATSAPP: 'WhatsApp',
  SEND_EMAIL: 'Email',
  VOICE_CALL: 'Voice Call',
  WAIT_AND_RETRY: 'Wait & Retry',
  NO_ACTION: 'No Action',
  ESCALATE_TO_HUMAN: 'Escalate',
}

// Payment method display names
export const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net Banking',
  wallet: 'Wallet',
}

// Failure category display names
export const CATEGORY_LABELS: Record<string, string> = {
  temporary_upi_failure: 'UPI Failure',
  bank_timeout: 'Bank Timeout',
  card_declined: 'Card Declined',
  insufficient_balance: 'Low Balance',
  payment_link_abandoned: 'Link Abandoned',
  subscription_failure: 'Subscription Failed',
  checkout_abandoned: 'Checkout Abandoned',
  fraud_block: 'Fraud Block',
  network_error: 'Network Error',
  unknown: 'Unknown',
}

// Status colors for UI
export const STATUS_COLORS: Record<string, string> = {
  recovered: 'text-emerald-400',
  failed: 'text-red-400',
  open: 'text-blue-400',
  executing: 'text-amber-400',
  recovering: 'text-amber-400',
  diagnosing: 'text-purple-400',
  strategy_selected: 'text-sky-400',
  abandoned: 'text-gray-400',
  no_action: 'text-gray-400',
}

export const STATUS_BG: Record<string, string> = {
  recovered: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border border-red-500/20',
  open: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  executing: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  recovering: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  diagnosing: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  strategy_selected: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
  abandoned: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
  no_action: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
}
