'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { fadeUp, staggerContainer } from '@/lib/motion'

interface FadeInProps {
  children: React.ReactNode
  className?: string
  delay?: number
  /** Use stagger for multiple children */
  stagger?: boolean
  /** Which variant to use */
  variant?: 'fadeUp' | 'fadeIn' | 'scaleIn'
}

/**
 * Scroll-triggered fade-in wrapper.
 * Children animate in when the element enters the viewport.
 */
export function FadeIn({
  children,
  className = '',
  delay = 0,
  stagger = false,
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-8% 0px' })

  if (stagger) {
    return (
      <motion.div
        ref={ref}
        variants={staggerContainer(0.08, delay)}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className={className}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Wrap a single child in a stagger-child variant */
export function FadeInChild({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  )
}
