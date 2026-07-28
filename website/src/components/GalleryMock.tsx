import { motion } from 'framer-motion'
import { Heart, Play } from 'lucide-react'
import clsx from 'clsx'
import { MockSidebar } from './MockSidebar'

// Stand-in "photo" swatches — varied gradients + aspect ratios approximate a real justified
// masonry grid without needing actual photographs.
const SWATCHES = [
  { g: 'from-amber-500/70 to-orange-700/70', h: 92 },
  { g: 'from-sky-500/70 to-blue-800/70', h: 128 },
  { g: 'from-emerald-500/60 to-teal-800/70', h: 108, video: true },
  { g: 'from-rose-500/60 to-pink-800/70', h: 96 },
  { g: 'from-indigo-500/60 to-violet-800/70', h: 134 },
  { g: 'from-yellow-500/60 to-amber-800/70', h: 100 },
  { g: 'from-cyan-500/60 to-sky-800/70', h: 118, fav: true },
  { g: 'from-fuchsia-500/60 to-purple-800/70', h: 92 },
  { g: 'from-lime-500/50 to-green-800/70', h: 112 },
  { g: 'from-orange-500/60 to-red-800/70', h: 104 },
  { g: 'from-blue-500/60 to-indigo-800/70', h: 128, video: true },
  { g: 'from-teal-500/60 to-emerald-800/70', h: 96 }
]

export function GalleryMock({ dense = false }: { dense?: boolean }): JSX.Element {
  return (
    <div className="flex h-full">
      <MockSidebar />
      <div className="flex-1 overflow-hidden p-2.5 bg-[#111112]">
        <div className={clsx('flex flex-wrap gap-1.5', dense && 'gap-1')}>
          {SWATCHES.concat(SWATCHES).map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.025, duration: 0.35, ease: 'easeOut' }}
              className={clsx('relative rounded-md bg-gradient-to-br flex-shrink-0 overflow-hidden', s.g)}
              style={{ height: s.h, width: s.h * 1.3 }}
            >
              {s.video && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
                    <Play size={9} className="text-white fill-white ml-0.5" />
                  </div>
                </div>
              )}
              {s.fav && (
                <div className="absolute top-1 right-1 text-white/90">
                  <Heart size={9} fill="currentColor" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
