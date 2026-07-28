import { Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { ScanProgressEvent } from '../../../../shared/types'

interface Props {
  scanProgress: Record<string, ScanProgressEvent>
}

export function ScanProgressList({ scanProgress }: Props): JSX.Element | null {
  const drives = useAppStore((s) => s.drives)
  const active = Object.values(scanProgress).filter((e) => e.phase !== 'idle' && e.phase !== 'error')

  if (!active.length) return null

  return (
    <div className="px-3 pb-2 flex-shrink-0 space-y-1.5">
      {active.map((evt) => {
        const drive = drives.find((d) => d.id === evt.driveId)
        return (
          <div key={evt.driveId} className="panel px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <Loader2 size={12} className="animate-spin text-accent flex-shrink-0" />
              <span className="truncate font-medium">{drive?.label ?? 'Scanning'}</span>
            </div>
            <div className="text-neutral-500 mt-0.5 truncate">
              {evt.phase === 'scanning' ? 'Scanning' : 'Processing'} · {evt.scanned.toLocaleString()} photos
              {evt.currentPath ? ` · ${evt.currentPath.split('/').pop()}` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}
