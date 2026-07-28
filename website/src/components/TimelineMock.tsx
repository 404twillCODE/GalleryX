import { motion } from 'framer-motion'
import { MockSidebar } from './MockSidebar'

const MONTHS = [
  { label: 'July 2026', count: '842 photos · 34 videos', row: 8 },
  { label: 'June 2026', count: '1,240 photos · 12 videos', row: 10 },
  { label: 'May 2026', count: '611 photos · 4 videos', row: 6 }
]

const SWATCH = [
  'from-amber-500/70 to-orange-700/70',
  'from-sky-500/70 to-blue-800/70',
  'from-emerald-500/60 to-teal-800/70',
  'from-rose-500/60 to-pink-800/70',
  'from-indigo-500/60 to-violet-800/70',
  'from-cyan-500/60 to-sky-800/70'
]

export function TimelineMock(): JSX.Element {
  return (
    <div className="flex h-full">
      <MockSidebar activeIndex={5} />
      <div className="flex-1 overflow-hidden bg-[#111112] flex flex-col">
        {MONTHS.map((month, mi) => (
          <div key={month.label} className="border-b border-white/[0.04]">
            <div className="sticky top-0 px-3 py-1.5 bg-[#141415] flex items-baseline gap-2">
              <span className="text-[11px] font-semibold text-white">{month.label}</span>
              <span className="text-[10px] text-neutral-500">{month.count}</span>
            </div>
            <div className="flex flex-wrap gap-1 p-2">
              {Array.from({ length: month.row }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (mi * 10 + i) * 0.02, duration: 0.3 }}
                  className={`w-9 h-9 rounded-md bg-gradient-to-br ${SWATCH[(mi + i) % SWATCH.length]}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
