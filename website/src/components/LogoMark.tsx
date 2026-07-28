import { Images } from 'lucide-react'
import clsx from 'clsx'

export function LogoMark({ size = 28, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 flex-shrink-0',
        className
      )}
      style={{ width: size, height: size }}
    >
      <Images size={Math.round(size * 0.55)} strokeWidth={2.25} />
    </div>
  )
}
