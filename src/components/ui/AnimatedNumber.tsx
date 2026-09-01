'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

interface AnimatedNumberProps {
  value: number
  duration?: number
  /** Format function — e.g. (v) => `₹${(v/100).toFixed(2)}` */
  format?: (v: number) => string
  className?: string
  /** Only start animating when element enters viewport */
  triggerOnView?: boolean
}

/**
 * Smooth animated counter that counts from 0 to value.
 * Respects prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  duration = 1.8,
  format = (v) => Math.round(v).toLocaleString('en-IN'),
  className = '',
  triggerOnView = true,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const [current, setCurrent] = useState(0)
  const frameRef = useRef<number>(0)
  const startTimeRef = useRef<number | null>(null)
  const prefersReduced = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReduced.current = mq.matches
  }, [])

  useEffect(() => {
    if (triggerOnView && !inView) return
    if (prefersReduced.current) { setCurrent(value); return }

    const start = 0
    startTimeRef.current = null

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const elapsed = (timestamp - startTimeRef.current) / 1000
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(start + (value - start) * eased)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        setCurrent(value)
      }
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, duration, inView, triggerOnView])

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={(!triggerOnView || inView) ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {format(current)}
    </motion.span>
  )
}
