import { useEffect, useRef, useState } from 'react'
import { animate, useInView } from 'framer-motion'

interface Props {
  to: number
  suffix?: string
  prefix?: string
  decimals?: number
}

export function Counter({ to, suffix = '', prefix = '', decimals = 0 }: Props): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, to, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(v)
    })
    return () => controls.stop()
  }, [inView, to])

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)

  return (
    <span ref={ref}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}
