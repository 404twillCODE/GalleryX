import { useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, HardDrive, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { ScanProgressEvent } from '../../../../shared/types'

interface Props {
  scanProgress: Record<string, ScanProgressEvent>
}

/** Full-screen overlay shown right after "Add Drive" (and "Rescan"). Unlike the small sidebar
 *  scan indicator, this shows a real, working progress bar: the scanner runs a fast stat-free
 *  counting pre-pass to establish a genuine `filesTotal` before indexing starts, so the
 *  percentage here always reflects real progress — never a fabricated estimate. */
export function DriveScanOverlay({ scanProgress }: Props): JSX.Element | null {
  const driveId = useAppStore((s) => s.scanOverlayDriveId)
  const hide = useAppStore((s) => s.hideScanOverlay)
  const drives = useAppStore((s) => s.drives)
  const drive = drives.find((d) => d.id === driveId)
  const evt = driveId ? scanProgress[driveId] : undefined

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-dismiss a short beat after the scan finishes successfully, so the user gets a clear
  // "done" moment without having to close it themselves; failures and active scans stay open.
  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
    if (driveId && evt?.phase === 'idle') {
      dismissTimer.current = setTimeout(() => hide(), 2200)
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [driveId, evt?.phase, hide])

  if (!driveId) return null

  const phase = evt?.phase ?? 'counting'
  const scanned = evt?.scanned ?? 0
  const filesTotal = evt?.filesTotal
  const currentPath = evt?.currentPath
  const fatal = phase === 'error' && !!evt?.fatal
  const scanningLike = phase === 'scanning' || (phase === 'error' && !fatal)

  const pct = scanningLike && filesTotal ? Math.min(100, Math.round((scanned / filesTotal) * 100)) : null

  let title = 'Preparing to scan…'
  let subtitle = 'Getting ready'
  if (phase === 'counting') {
    title = 'Finding files…'
    subtitle = scanned > 0 ? `${scanned.toLocaleString()} files found so far` : 'Walking folders'
  } else if (phase === 'scanning') {
    title = 'Scanning drive…'
    subtitle = filesTotal
      ? `${scanned.toLocaleString()} / ${filesTotal.toLocaleString()} files indexed`
      : `${scanned.toLocaleString()} files indexed`
  } else if (phase === 'error' && !fatal) {
    title = 'Scanning drive…'
    subtitle = `Skipped an unreadable folder · ${scanned.toLocaleString()}${filesTotal ? ` / ${filesTotal.toLocaleString()}` : ''} files indexed`
  } else if (phase === 'idle') {
    title = 'Scan complete'
    subtitle = `${scanned.toLocaleString()} file${scanned === 1 ? '' : 's'} indexed`
  } else if (fatal) {
    title = 'Scan failed'
    subtitle = evt?.error ?? 'Something went wrong while scanning this drive.'
  }

  const handleCancel = (): void => {
    void window.gx.cancelScan(driveId)
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center animate-fade-in">
      <div className="panel w-[440px] p-6 animate-scale-in shadow-floating">
        <div className="flex items-start gap-3.5 mb-5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${
              fatal
                ? 'bg-red-500/15 text-red-400'
                : phase === 'idle'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-accent/15 text-accent animate-pulse-ring'
            }`}
          >
            {fatal ? (
              <AlertTriangle size={20} />
            ) : phase === 'idle' ? (
              <CheckCircle2 size={20} className="animate-pop-in" />
            ) : (
              <HardDrive size={20} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-white truncate">{drive?.label ?? 'Drive'}</div>
            <div className="text-xs text-neutral-500 truncate" title={drive?.rootPath}>
              {drive?.rootPath}
            </div>
          </div>
          <button className="btn-ghost !p-1.5 -mt-1 -mr-1" onClick={hide} title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="text-sm text-neutral-200 font-medium mb-1.5">{title}</div>
        <div className="text-xs text-neutral-500 mb-3 truncate">{subtitle}</div>

        {!fatal && phase !== 'idle' && (
          <>
            <div className="progress-track">
              {pct != null ? (
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              ) : (
                <div className="progress-fill-indeterminate" />
              )}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-neutral-600 truncate max-w-[70%]" title={currentPath}>
                {phase === 'scanning' && currentPath ? currentPath.split(/[/\\]/).pop() : ''}
              </span>
              {pct != null && <span className="text-[11px] text-neutral-500 tabular-nums flex-shrink-0">{pct}%</span>}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          {!fatal && phase !== 'idle' && (
            <button className="btn-ghost border border-white/10" onClick={handleCancel}>
              Cancel scan
            </button>
          )}
          {(phase === 'idle' || fatal) && (
            <button className="btn-accent" onClick={hide}>
              {fatal ? 'Close' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
