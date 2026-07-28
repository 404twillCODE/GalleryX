import { Copy, Film, Folder, Heart, Images, LayoutList, Settings, Upload, Clock } from 'lucide-react'
import clsx from 'clsx'

const ITEMS = [
  { icon: Images, label: 'All Photos', count: '84.2k', active: false },
  { icon: Film, label: 'Videos', count: '15.6k', active: false },
  { icon: Heart, label: 'Favorites', count: '2,104', active: false },
  { icon: Upload, label: 'Exports', count: '9,481', active: false },
  { icon: Clock, label: 'Recently Added', count: '312', active: false },
  { icon: LayoutList, label: 'Timeline', count: null, active: false },
  { icon: Copy, label: 'Check for Duplicates', count: null, active: false }
]

export function MockSidebar({ activeIndex = 0 }: { activeIndex?: number }): JSX.Element {
  return (
    <div className="w-[168px] flex-shrink-0 bg-[#161617] border-r border-white/[0.06] py-2 px-2 hidden sm:flex flex-col gap-0.5">
      {ITEMS.map((item, i) => (
        <div
          key={item.label}
          className={clsx(
            'flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px]',
            i === activeIndex ? 'bg-accent/20 text-accent' : 'text-neutral-400'
          )}
        >
          <item.icon size={12.5} className="flex-shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
          {item.count && <span className="text-[10px] tabular-nums opacity-60">{item.count}</span>}
        </div>
      ))}
      <div className="h-px bg-white/[0.06] my-1.5" />
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-neutral-500">
        <Folder size={12.5} />
        <span>2024</span>
      </div>
      <div className="flex items-center gap-2 pl-6 py-1.5 rounded-lg text-[11px] text-neutral-500">
        <span>Wedding — Sept</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-neutral-500">
        <Settings size={12.5} />
        <span>Settings</span>
      </div>
    </div>
  )
}
