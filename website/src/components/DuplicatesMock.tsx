import { motion } from 'framer-motion'
import { Check, Star, Trash2 } from 'lucide-react'
import { MockSidebar } from './MockSidebar'

const CARDS = [
  { label: 'DSC01234.ARW', tag: 'RAW · 42.1 MB', gradient: 'from-sky-500/70 to-blue-800/70', keep: true },
  { label: 'DSC01234.JPG', tag: 'JPEG · 8.4 MB', gradient: 'from-sky-500/40 to-blue-800/40', keep: false }
]

export function DuplicatesMock(): JSX.Element {
  return (
    <div className="flex h-full">
      <MockSidebar activeIndex={6} />
      <div className="flex-1 overflow-hidden bg-[#111112] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white">RAW + JPEG Pairs</span>
          <span className="text-[10px] text-neutral-500">1 of 214 groups</span>
        </div>
        <div className="flex gap-3">
          {CARDS.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
              className="relative flex-1 rounded-xl bg-[#1a1a1b] ring-1 ring-white/[0.06] p-2"
            >
              <div className={`h-16 rounded-lg bg-gradient-to-br ${c.gradient} mb-2`} />
              <div className="text-[10px] text-neutral-300 font-medium truncate">{c.label}</div>
              <div className="text-[9px] text-neutral-500 mb-1.5">{c.tag}</div>
              {c.keep ? (
                <div className="inline-flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 rounded-full px-1.5 py-0.5">
                  <Star size={9} fill="currentColor" /> Suggested keep
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 text-[9px] text-neutral-500 bg-white/[0.05] rounded-full px-1.5 py-0.5">
                  Duplicate
                </div>
              )}
            </motion.div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[10px] text-neutral-400 flex items-center gap-1.5">
            <Check size={10} className="text-accent" /> Selection never deletes automatically — nothing is removed until you confirm
          </div>
          <div className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[10px] text-neutral-300 flex items-center gap-1.5">
            <Trash2 size={10} /> Move to Trash
          </div>
        </div>
      </div>
    </div>
  )
}
