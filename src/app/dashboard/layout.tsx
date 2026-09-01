'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Zap, List, FolderOpen, BarChart3,
  Activity, Shield, Settings, ChevronRight, ExternalLink
} from 'lucide-react'

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { href: '/dashboard/command-center', icon: Zap, label: 'Command Center' },
  { href: '/dashboard/transactions', icon: List, label: 'Transactions' },
  { href: '/dashboard/cases', icon: FolderOpen, label: 'Recovery Cases' },
  { href: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/dashboard/activity', icon: Activity, label: 'AI Activity' },
  { href: '/dashboard/policies', icon: Shield, label: 'Policies' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
]

function LiveStatus() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)' }}
    >
      <div className="live-dot" />
      <span style={{ fontSize: '11px', color: 'rgba(52,211,153,0.7)', fontWeight: 500 }}>
        LIVE
      </span>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#050608' }}
    >
      {/* Sidebar */}
      <aside
        className="w-52 shrink-0 flex flex-col"
        style={{
          background: '#080c12',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Link href="/" className="flex items-center gap-2.5 group mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'white' }}>R</span>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.01em', color: 'rgba(240,244,255,0.88)' }}>
                REVIVE
              </div>
              <div style={{ fontSize: '9px', letterSpacing: '0.06em', color: 'rgba(136,146,164,0.45)', marginTop: '1px' }}>
                AUTONOMOUS AI
              </div>
            </div>
          </Link>
          <LiveStatus />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon className="w-[15px] h-[15px] shrink-0" />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="ml-auto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </motion.div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.07em', color: 'rgba(74,85,104,0.5)', marginBottom: '8px', textTransform: 'uppercase' }}>
            Merchant
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: 'rgba(79,142,247,0.15)', color: 'rgba(79,142,247,0.85)' }}
            >
              A
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(240,244,255,0.65)' }} className="truncate">
                Acme Commerce
              </div>
              <div
                style={{ fontSize: '10px', color: 'rgba(74,85,104,0.6)' }}
                className="px-1.5 py-0.5 rounded inline-block mt-0.5"
              >
                <span
                  style={{
                    background: 'rgba(245,158,11,0.1)',
                    color: 'rgba(245,158,11,0.6)',
                    border: '1px solid rgba(245,158,11,0.15)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    letterSpacing: '0.05em',
                  }}
                >
                  DEMO
                </span>
              </div>
            </div>
          </div>
          <Link
            href="/"
            className="mt-3 flex items-center gap-1.5 transition-colors duration-150"
            style={{ fontSize: '11px', color: 'rgba(74,85,104,0.5)' }}
          >
            <ExternalLink className="w-3 h-3" />
            <span>Back to overview</span>
          </Link>
        </div>
      </aside>

      {/* Page content with subtle entrance */}
      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex-1 overflow-auto"
          style={{ background: '#060a0f' }}
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </div>
  )
}
