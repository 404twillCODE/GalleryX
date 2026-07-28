import type { ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  title?: string
  children: ReactNode
  className?: string
}

/** A stylized "app window" chrome (traffic-light dots + title bar) used to frame the mockup
 *  scenes throughout the site — this stands in for real screenshots so the marketing site never
 *  goes stale relative to the actual UI, while still clearly evoking GalleryX's look. */
export function MockWindow({ title, children, className }: Props): JSX.Element {
  return (
    <div className={clsx('rounded-2xl bg-[#161617] ring-1 ring-white/[0.08] shadow-2xl shadow-black/50 overflow-hidden', className)}>
      <div className="h-9 flex items-center gap-2 px-3.5 bg-[#1c1c1e] border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        {title && <div className="flex-1 text-center text-[11px] text-neutral-500 font-medium truncate pr-12">{title}</div>}
      </div>
      {children}
    </div>
  )
}
