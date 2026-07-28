import { Minus, PanelRight, Plus } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { viewTitle } from '../../lib/viewTitle'
import { SortMenu } from './SortMenu'
import { FilterPopover } from './FilterPopover'

const THUMB_MIN = 100
const THUMB_MAX = 420

interface Props {
  total: number
}

export function Toolbar({ total }: Props): JSX.Element {
  const view = useAppStore((s) => s.view)
  const thumbnailSize = useAppStore((s) => s.thumbnailSize)
  const setThumbnailSize = useAppStore((s) => s.setThumbnailSize)
  const metadataPanelCollapsed = useAppStore((s) => s.metadataPanelCollapsed)
  const toggleMetadataPanel = useAppStore((s) => s.toggleMetadataPanel)

  return (
    <div className="h-14 flex-shrink-0 flex items-center gap-3 px-4 border-b border-white/[0.06] drag-region">
      <div className="min-w-0 no-drag">
        <div className="text-[15px] font-semibold text-white truncate">{viewTitle(view)}</div>
      </div>
      <span className="text-xs text-neutral-500 tabular-nums no-drag">{total.toLocaleString()} photos</span>

      <div className="flex-1" />

      <div className="flex items-center gap-2 no-drag">
        <FilterPopover />
        <SortMenu />

        <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-white/[0.06]">
          <button className="btn-ghost !p-1.5" onClick={() => setThumbnailSize(Math.max(THUMB_MIN, thumbnailSize - 30))}>
            <Minus size={13} />
          </button>
          <input
            type="range"
            min={THUMB_MIN}
            max={THUMB_MAX}
            step={10}
            value={thumbnailSize}
            onChange={(e) => setThumbnailSize(Number(e.target.value))}
            className="w-24 accent-accent"
            title="Thumbnail size"
          />
          <button className="btn-ghost !p-1.5" onClick={() => setThumbnailSize(Math.min(THUMB_MAX, thumbnailSize + 30))}>
            <Plus size={13} />
          </button>
        </div>

        {metadataPanelCollapsed && (
          <button
            className="btn-ghost !p-1.5 pl-2 ml-1 border-l border-white/[0.06]"
            onClick={toggleMetadataPanel}
            title="Show info panel"
          >
            <PanelRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
