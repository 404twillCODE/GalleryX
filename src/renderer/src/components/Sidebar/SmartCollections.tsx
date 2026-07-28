import { Clock, Heart, ImageIcon, Upload } from 'lucide-react'
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

  const rows: { id: string; label: string; icon: JSX.Element; view: ViewId; count: number }[] = [
    { id: 'all', label: 'All Photos', icon: <ImageIcon size={16} />, view: { kind: 'all' }, count: counts.all },
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
            sameView(view, row.view)
              ? 'bg-accent/15 text-accent'
              : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
          )}
        >
          {row.icon}
          <span className="flex-1 text-left truncate">{row.label}</span>
          <span className="text-xs text-neutral-500 tabular-nums">{row.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  )
}
