import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Film, Images, LayoutList } from 'lucide-react'
import { MockWindow } from './MockWindow'
import { GalleryMock } from './GalleryMock'
import { TimelineMock } from './TimelineMock'
import { DuplicatesMock } from './DuplicatesMock'
import { VideoMock } from './VideoMock'
import { Reveal } from './Reveal'

const TABS = [
  {
    key: 'gallery',
    label: 'Gallery',
    icon: Images,
    title: 'GalleryX — All Photos',
    body: 'A responsive, virtualized masonry grid groups photos by capture date with clean separators — scroll through 100,000 photos without a stutter.',
    Comp: GalleryMock
  },
  {
    key: 'timeline',
    label: 'Timeline',
    icon: LayoutList,
    title: 'GalleryX — Timeline',
    body: 'Browse chronologically with sticky year and month headers, jump-to-year navigation, and automatic Shoot detection based on time gaps and location.',
    Comp: TimelineMock
  },
  {
    key: 'video',
    label: 'Video Player',
    icon: Film,
    title: 'GalleryX — Video Viewer',
    body: 'A full-featured player with scrubbing, frame stepping, picture-in-picture, and keyboard shortcuts — plus graceful fallbacks for unsupported codecs.',
    Comp: VideoMock
  },
  {
    key: 'duplicates',
    label: 'Duplicates',
    icon: Copy,
    title: 'GalleryX — Check for Duplicates',
    body: 'Exact hashes, RAW+JPEG pairs, and perceptual similarity are grouped for review. Nothing is ever deleted without your explicit confirmation.',
    Comp: DuplicatesMock
  }
] as const

export function Showcase(): JSX.Element {
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('gallery')
  const activeTab = TABS.find((t) => t.key === active)!

  return (
    <section id="showcase" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-xl mb-10">
          <div className="section-label mb-3">See it in motion</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">A tour of GalleryX</h2>
        </Reveal>

        <Reveal delay={0.1} className="flex flex-wrap gap-2 mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-colors duration-200 ${
                active === tab.key
                  ? 'bg-accent text-white'
                  : 'bg-white/[0.05] text-neutral-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </Reveal>

        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-8 items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <h3 className="text-xl font-semibold text-white mb-3">{activeTab.title.split('— ')[1]}</h3>
              <p className="text-[14.5px] text-neutral-400 leading-relaxed">{activeTab.body}</p>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab.key}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <MockWindow title={activeTab.title}>
                <div className="h-[280px] sm:h-[340px]">
                  <activeTab.Comp />
                </div>
              </MockWindow>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
