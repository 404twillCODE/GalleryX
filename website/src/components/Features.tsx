import { motion } from 'framer-motion'
import {
  Copy,
  Film,
  Gauge,
  HardDriveDownload,
  LayoutList,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle
} from 'lucide-react'
import { Reveal } from './Reveal'

const FEATURES = [
  {
    icon: Gauge,
    title: 'Built for scale',
    body: 'Virtualized, justified grids stay silky smooth through 100k+ photos and 20k+ videos, with instant search and sort.'
  },
  {
    icon: LayoutList,
    title: 'Timeline browsing',
    body: 'Sticky year and month headers, jump-to-year navigation, and automatic Shoot grouping by time, location, and camera.'
  },
  {
    icon: Film,
    title: 'Full video support',
    body: 'MP4, MOV, HEVC, ProRes and more, with real thumbnails, a full-featured player, scrubbing, PIP, and frame stepping.'
  },
  {
    icon: Copy,
    title: 'Duplicate detection',
    body: 'Exact-hash duplicates, RAW+JPEG pairing, and perceptual similarity — reviewed side-by-side before anything is ever removed.'
  },
  {
    icon: HardDriveDownload,
    title: 'Multi-drive, offline-first',
    body: 'Disconnect a drive and its photos stay browsable with cached thumbnails. Reconnect, and GalleryX reconciles automatically.'
  },
  {
    icon: ShieldCheck,
    title: 'Non-destructive, always',
    body: 'Nothing is copied, moved, or renamed on disk. Deletions go to Trash or the Recycle Bin, with a full undo-friendly audit log.'
  },
  {
    icon: SlidersHorizontal,
    title: 'Deep filtering',
    body: 'Filter by camera, lens, rating, favorite, export status, codec, resolution, orientation, and capture date — instantly.'
  },
  {
    icon: Search,
    title: 'Search that keeps up',
    body: 'A local SQLite index means search, sort, and filters return instantly, even across terabytes of media.'
  },
  {
    icon: Sparkle,
    title: 'Configurable exports',
    body: 'Recognize Export, Delivered, Final, or your own custom folder names — case-sensitive, exact, or nested subfolder matching.'
  }
]

export function Features(): JSX.Element {
  return (
    <section id="features" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-xl mb-14">
          <div className="section-label mb-3">Everything, indexed</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            One app for every photo you've ever taken
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className="panel h-full p-6 group"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center mb-4 group-hover:bg-accent/25 transition-colors">
                  <f.icon size={18} />
                </div>
                <h3 className="text-[15px] font-semibold text-white mb-1.5">{f.title}</h3>
                <p className="text-[13.5px] text-neutral-400 leading-relaxed">{f.body}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
