import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Props {
  children: ReactNode
  delay?: number
  className?: string
  y?: number
}

/** Fades + slides an element into place once it scrolls into view. Centralizing this keeps the
 *  animation timing consistent across every section of the site. */
export function Reveal({ children, delay = 0, className, y = 22 }: Props): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
