import { Clock, Copy, Film, Heart, ImageIcon, LayoutList, Upload } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../../store/useAppStore'
import type { SmartCollectionCounts, ViewId } from '../../../../shared/types'

interface Props {
  counts: SmartCollectionCounts
}

function sameView(a: ViewId, b: ViewId): boolean {
  return a.kind === b.kind && (a.kind !== 'folder' || (b.kind === 'folder' && a.path === b.path))
}

export function SmartCollections({ counts }: Props): JSX.Element {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const activeSection = useAppStore((s) => s.activeSection)
  const setActiveSection = useAppStore((s) => s.setActiveSection)

  const rows: { id: string; label: string; icon: JSX.Element; view: ViewId; count: number }[] = [
    { id: 'all', label: 'All Photos', icon: <ImageIcon size={16} />, view: { kind: 'all' }, count: counts.all },
    { id: 'videos', label: 'Videos', icon: <Film size={16} />, view: { kind: 'videos' }, count: counts.videos },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: <Heart size={16} />,
      view: { kind: 'favorites' },
      count: counts.favorites
    },
    {
      id: 'exports',
      label: 'Exports',
      icon: <Upload size={16} />,
      view: { kind: 'exports' },
      count: counts.exports
    },
    {
      id: 'recent',
      label: 'Recently Added',
      icon: <Clock size={16} />,
      view: { kind: 'recent' },
      count: counts.recent
    }
  ]

  return (
    <div className="space-y-0.5">
      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Library</div>
      {rows.map((row) => (
        <button
          key={row.id}
          onClick={() => setView(row.view)}
          className={clsx(
            'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors duration-150 no-drag',
            activeSection === 'library' && sameView(view, row.view)
              ? 'bg-accent/15 text-accent'
              : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
          )}
        >
          {row.icon}
          <span className="flex-1 text-left truncate">{row.label}</span>
          <span className="text-xs text-neutral-500 tabular-nums">{row.count.toLocaleString()}</span>
        </button>
      ))}

      <button
        onClick={() => setActiveSection('timeline')}
        className={clsx(
          'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors duration-150 no-drag',
          activeSection === 'timeline' ? 'bg-accent/15 text-accent' : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
        )}
        title="Browse your library chronologically by year, month, or shoot"
      >
        <LayoutList size={16} />
        <span className="flex-1 text-left truncate">Timeline</span>
      </button>

      <button
        onClick={() => setActiveSection('duplicates')}
        className={clsx(
          'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors duration-150 no-drag',
          activeSection === 'duplicates' ? 'bg-accent/15 text-accent' : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
        )}
        title="Scan for exact duplicates, RAW+JPEG pairs, and similar images"
      >
        <Copy size={16} />
        <span className="flex-1 text-left truncate">Check for Duplicates</span>
      </button>
    </div>
  )
}
