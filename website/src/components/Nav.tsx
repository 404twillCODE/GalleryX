import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Github } from 'lucide-react'
import { LogoMark } from './LogoMark'
import { GITHUB_SOURCE } from '../lib/github'

const LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Tour', href: '#showcase' },
  { label: 'Performance', href: '#performance' },
  { label: 'Download', href: '#download' }
]

export function Nav(): JSX.Element {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-base-bg/70 backdrop-blur-xl border-b border-white/[0.06]' : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
        <a href="#top" className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="font-semibold text-[15px] text-white tracking-tight">GalleryX</span>
        </a>
        <nav className="hidden md:flex items-center gap-1 ml-6">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <a
          href={GITHUB_SOURCE}
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 text-[13px] text-neutral-400 hover:text-white transition-colors px-3 py-2"
        >
          <Github size={15} />
          Source
        </a>
        <a href="#download" className="btn-primary !px-4 !py-2 text-[13px]">
          Get GalleryX
        </a>
      </div>
    </motion.header>
  )
}
