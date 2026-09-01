import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'REVIVE — Autonomous AI Revenue Recovery',
  description:
    'REVIVE autonomously identifies recoverable revenue, evaluates intervention strategies, and executes recovery workflows within merchant-defined guardrails.',
  keywords: ['revenue recovery', 'payment recovery', 'AI fintech', 'autonomous recovery', 'payment failures'],
  openGraph: {
    title: 'REVIVE — Autonomous AI Revenue Recovery',
    description: 'Recover revenue before it\'s lost.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        style={{
          background: '#050608',
          color: '#f0f4ff',
          minHeight: '100vh',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  )
}
