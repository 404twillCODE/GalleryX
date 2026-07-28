import { motion } from 'framer-motion'
import { Apple, MonitorDown } from 'lucide-react'
import { Reveal } from './Reveal'
import { DOWNLOAD_MAC_ARM64, DOWNLOAD_WIN, GITHUB_SOURCE } from '../lib/github'

const PLATFORMS = [
  { icon: Apple, name: 'macOS', detail: 'Apple Silicon & Intel · macOS 12+', href: DOWNLOAD_MAC_ARM64 },
  { icon: MonitorDown, name: 'Windows', detail: 'Windows 10 & 11 · 64-bit', href: DOWNLOAD_WIN }
]

export function Download(): JSX.Element {
  return (
    <section id="download" className="relative py-24 px-5">
      <div className="max-w-4xl mx-auto text-center">
        <Reveal>
          <div className="section-label mb-3 justify-center flex">Get started</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Your photos, organized in minutes
          </h2>
          <p className="mt-4 text-[15px] text-neutral-400 max-w-md mx-auto leading-relaxed">
            Free and open source. Point GalleryX at a drive and let it index in the background —
            nothing is ever uploaded, copied, or moved.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-10 grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          {PLATFORMS.map((p) => (
            <motion.a
              key={p.name}
              href={p.href}
              target="_blank"
              rel="noreferrer"
              whileHover={{ y: -3 }}
              className="panel p-6 flex flex-col items-center gap-3 group"
            >
              <div className="w-11 h-11 rounded-2xl bg-white/[0.06] flex items-center justify-center text-white group-hover:bg-accent/20 group-hover:text-accent transition-colors">
                <p.icon size={20} />
              </div>
              <div className="font-semibold text-white text-[15px]">{p.name}</div>
              <div className="text-[12px] text-neutral-500">{p.detail}</div>
            </motion.a>
          ))}
        </Reveal>

        <Reveal delay={0.2} className="mt-8 text-[12.5px] text-neutral-500">
          Prefer to build it yourself?{' '}
          <a href={GITHUB_SOURCE} className="text-accent-soft hover:text-white underline underline-offset-2" target="_blank" rel="noreferrer">
            Clone the source
          </a>{' '}
          and run <code className="px-1.5 py-0.5 rounded bg-white/[0.06]">npm install && npm run dev</code>.
        </Reveal>
      </div>
    </section>
  )
}
