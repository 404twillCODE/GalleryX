import { Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { ScanProgressEvent } from '../../../../shared/types'

interface Props {
  scanProgress: Record<string, ScanProgressEvent>
}

export function ScanProgressList({ scanProgress }: Props): JSX.Element | null {
  const drives = useAppStore((s) => s.drives)
  const showScanOverlay = useAppStore((s) => s.showScanOverlay)
  const active = Object.values(scanProgress).filter((e) => e.phase !== 'idle' && e.phase !== 'error')

  if (!active.length) return null

  return (
    <div className="px-3 pb-2 flex-shrink-0 space-y-1.5">
      {active.map((evt) => {
        const drive = drives.find((d) => d.id === evt.driveId)
        const pct = evt.phase === 'scanning' && evt.filesTotal ? Math.min(100, Math.round((evt.scanned / evt.filesTotal) * 100)) : null
        return (
          <button
            key={evt.driveId}
            className="panel px-3 py-2 text-xs w-full text-left hover:bg-white/[0.03] transition-colors animate-slide-fade-in"
            onClick={() => showScanOverlay(evt.driveId)}
            title="Show scan progress"
          >
            <div className="flex items-center gap-2 text-neutral-300">
              <Loader2 size={12} className="animate-spin text-accent flex-shrink-0" />
              <span className="truncate font-medium flex-1">{drive?.label ?? 'Scanning'}</span>
              {pct != null && <span className="text-neutral-500 tabular-nums flex-shrink-0">{pct}%</span>}
            </div>
            <div className="text-neutral-500 mt-0.5 truncate">
              {evt.phase === 'counting'
                ? 'Finding files…'
                : `${evt.scanned.toLocaleString()}${evt.filesTotal ? ` / ${evt.filesTotal.toLocaleString()}` : ''} files`}
            </div>
            {evt.phase !== 'counting' && (
              <div className="progress-track mt-1.5 !h-1">
                {pct != null ? (
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                ) : (
                  <div className="progress-fill-indeterminate" />
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
