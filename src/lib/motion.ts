// Shared Framer Motion animation variants
// Keep centralized so the motion language is consistent across all screens

export const EASING = {
  smooth: [0.25, 0.1, 0.25, 1] as const,
  spring: { type: 'spring', stiffness: 280, damping: 28 },
  snappy: [0.35, 0, 0.15, 1] as const,
  cinematic: [0.16, 1, 0.3, 1] as const,
}

/** Standard fade + lift reveal for any element */
export const fadeUp = {
  hidden:  { opacity: 0, y: 18, filter: 'blur(4px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.55, ease: EASING.cinematic }
  },
}

/** Faster, lighter version for smaller UI elements */
export const fadeIn = {
  hidden:  { opacity: 0, y: 8 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.35, ease: EASING.smooth }
  },
}

/** Scale + opacity for cards */
export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1, scale: 1,
    transition: { duration: 0.4, ease: EASING.snappy }
  },
}

/** Stagger container */
export const staggerContainer = (staggerChildren = 0.08, delayChildren = 0) => ({
  hidden:  {},
  visible: { transition: { staggerChildren, delayChildren } },
})

/** For slide-in from right (drawers, panels) */
export const slideFromRight = {
  hidden:  { opacity: 0, x: 32 },
  visible: {
    opacity: 1, x: 0,
    transition: { duration: 0.38, ease: EASING.snappy }
  },
  exit: {
    opacity: 0, x: 32,
    transition: { duration: 0.25, ease: EASING.smooth }
  }
}

/** Page transition wrapper */
export const pageTransition = {
  hidden:  { opacity: 0, y: 10 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.3, ease: EASING.smooth }
  },
  exit: {
    opacity: 0, y: -5,
    transition: { duration: 0.2, ease: EASING.smooth }
  }
}

/** Cinematic large text reveal — landing hero */
export const heroReveal = {
  hidden:  { opacity: 0, y: 40, filter: 'blur(12px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 1.0, ease: EASING.cinematic }
  },
}

/** Pipeline stage sequential reveal */
export const pipelineStage = {
  hidden:  { opacity: 0, scale: 0.95, y: 12 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.45, ease: EASING.snappy }
  },
}

/** Number counter — used with AnimatedNumber component */
export const numberReveal = {
  hidden:  { opacity: 0, y: 12 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: EASING.cinematic }
  }
}
