import { motion } from 'framer-motion'
import { Apple, ArrowRight, HardDrive, Sparkles } from 'lucide-react'
import { MockWindow } from './MockWindow'
import { GalleryMock } from './GalleryMock'
import { DOWNLOAD_MAC_ARM64, DOWNLOAD_WIN } from '../lib/github'

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] }
  })
}

export function Hero(): JSX.Element {
  return (
    <section id="top" className="relative pt-36 pb-20 md:pt-44 md:pb-28 px-5">
      <div className="max-w-6xl mx-auto flex flex-col items-center text-center">
        <motion.div
          custom={0}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] ring-1 ring-white/[0.08] px-3.5 py-1.5 text-[12px] text-neutral-300 mb-7"
        >
          <Sparkles size={13} className="text-accent" />
          Now with Timeline, video support &amp; duplicate detection
        </motion.div>

        <motion.h1
          custom={1}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.08] max-w-3xl gradient-text"
        >
          Every photo. Every drive. Instantly there.
        </motion.h1>

        <motion.p
          custom={2}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mt-6 text-lg text-neutral-400 max-w-xl leading-relaxed"
        >
          GalleryX is a fast, offline-first photo &amp; video browser built for photographers with
          massive libraries on external drives. Index once, browse forever — no cloud required.
        </motion.p>

        <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a href={DOWNLOAD_MAC_ARM64} className="btn-primary" target="_blank" rel="noreferrer">
            <Apple size={16} />
            Download for macOS
          </a>
          <a href={DOWNLOAD_WIN} className="btn-secondary" target="_blank" rel="noreferrer">
            Download for Windows
            <ArrowRight size={15} />
          </a>
        </motion.div>

        <motion.div
          custom={4}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mt-6 flex items-center gap-1.5 text-[12.5px] text-neutral-500"
        >
          <HardDrive size={13} />
          Built for 100,000+ photos and 20,000+ videos across multiple drives
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-16 w-full max-w-4xl"
        >
          <div className="absolute -inset-6 bg-accent/10 blur-3xl rounded-[40px] -z-10" />
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}>
            <MockWindow title="GalleryX — All Photos">
              <div className="h-[340px] sm:h-[400px]">
                <GalleryMock />
              </div>
            </MockWindow>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
            transition={{ delay: 0.9, duration: 0.6, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
            className="hidden md:block absolute -left-10 top-16 panel px-3.5 py-2.5"
          >
            <div className="text-[11px] text-neutral-500">Indexed library</div>
            <div className="text-lg font-semibold text-white">124,382 items</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
            transition={{ delay: 1.1, duration: 0.6, y: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' } }}
            className="hidden md:block absolute -right-8 bottom-8 panel px-3.5 py-2.5"
          >
            <div className="text-[11px] text-neutral-500">Duplicates found</div>
            <div className="text-lg font-semibold text-white">4.1 GB recoverable</div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
