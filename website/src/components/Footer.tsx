import { LogoMark } from './LogoMark'

export function Footer(): JSX.Element {
  return (
    <footer className="relative border-t border-white/[0.06] py-10 px-5">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <LogoMark size={24} />
          <span className="text-[13px] text-neutral-500">© {new Date().getFullYear()} GalleryX. Built for photographers.</span>
        </div>
        <div className="flex items-center gap-5 text-[13px] text-neutral-500">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#showcase" className="hover:text-white transition-colors">
            Tour
          </a>
          <a href="#download" className="hover:text-white transition-colors">
            Download
          </a>
        </div>
      </div>
    </footer>
  )
}
