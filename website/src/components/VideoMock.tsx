import { motion } from 'framer-motion'
import { Maximize2, Pause, Volume2 } from 'lucide-react'

export function VideoMock(): JSX.Element {
  return (
    <div className="relative h-full bg-black flex items-center justify-center overflow-hidden">
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-slate-900 to-black"
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-neutral-300 ring-1 ring-white/10">
        4K · ProRes
      </div>
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-14 h-14 rounded-full bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20"
      >
        <Pause size={20} className="text-white" />
      </motion.div>
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
        <div className="h-1 rounded-full bg-white/20 mb-2 overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-full"
            initial={{ width: '10%' }}
            animate={{ width: '64%' }}
            transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-neutral-300">
          <span>1:42 / 2:38</span>
          <div className="flex items-center gap-2.5">
            <Volume2 size={11} />
            <Maximize2 size={11} />
          </div>
        </div>
      </div>
    </div>
  )
}
