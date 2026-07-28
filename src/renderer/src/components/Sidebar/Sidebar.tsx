import { useMemo } from 'react'
import { Images, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { ScanProgressEvent } from '../../../../shared/types'
import { SmartCollections } from './SmartCollections'
import { FolderTree } from './FolderTree'
import { SearchBox } from './SearchBox'
import { ScanProgressList } from './ScanProgressList'
import { DriveSection } from './DriveSection'

interface Props {
  collapsed: boolean
  scanProgress: Record<string, ScanProgressEvent>
}

// macOS draws the native traffic-light (close/minimize/zoom) buttons on top of whatever is
// rendered underneath them at a fixed window-level inset (see trafficLightPosition in
// main/index.ts). Reserve a clear strip above our own header content so nothing overlaps them.
const isMac = window.gx.platform === 'darwin'

export function Sidebar({ collapsed, scanProgress }: Props): JSX.Element {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const collectionCounts = useAppStore((s) => s.collectionCounts)
  const drives = useAppStore((s) => s.drives)

  const totalPhotoCount = useMemo(
    () => drives.filter((d) => d.enabled).reduce((sum, d) => sum + d.photoCount, 0),
    [drives]
  )

  if (collapsed) {
    return (
      <div className="w-[64px] flex-shrink-0 h-full flex flex-col items-center py-3 gap-4 bg-base-surface border-r border-white/[0.06] drag-region">
        {isMac && <div className="h-5 w-full flex-shrink-0" />}
        <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center no-drag">
          <Images size={18} />
        </div>
        <button
          className="btn-ghost no-drag"
          onClick={toggleSidebar}
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen size={18} />
        </button>
        <div className="flex-1" />
        <button className="btn-ghost no-drag" onClick={() => setSettingsOpen(true)} title="Settings">
          <SettingsIcon size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="w-[280px] flex-shrink-0 h-full flex flex-col bg-base-surface border-r border-white/[0.06]">
      {isMac && <div className="h-6 drag-region flex-shrink-0" />}
      <div className="h-14 flex items-center gap-2 px-4 drag-region flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center no-drag">
          <Images size={16} />
        </div>
        <span className="font-semibold text-[15px] text-white tracking-tight">GalleryX</span>
        <div className="flex-1" />
        <button
          className="btn-ghost no-drag"
          onClick={toggleSidebar}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <SearchBox />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
        <SmartCollections counts={collectionCounts} />
        <FolderTree />
      </div>

      <ScanProgressList scanProgress={scanProgress} />

      <DriveSection totalPhotoCount={totalPhotoCount} />

      <div className="px-3 py-2.5 border-t border-white/[0.06] flex-shrink-0">
        <button
          className="btn-ghost w-full flex items-center gap-2 justify-start no-drag"
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon size={16} />
          Settings
        </button>
      </div>
    </div>
  )
}
