import { useState } from 'react'
import { AlertTriangle, FolderPlus, HardDrive, MoreVertical, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../../store/useAppStore'

interface Props {
  totalPhotoCount: number
}

export function DriveSection({ totalPhotoCount }: Props): JSX.Element {
  const drives = useAppStore((s) => s.drives)
  const driveErrors = useAppStore((s) => s.driveErrors)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const handleAddDrive = async (): Promise<void> => {
    const folder = await window.gx.chooseFolder()
    if (folder) await window.gx.addDrive(folder)
  }

  return (
    <div className="border-t border-white/[0.06] px-3 py-2.5 flex-shrink-0 max-h-[220px] overflow-y-auto">
      <div className="flex items-center px-1 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 flex-1">Drives</span>
        <button className="btn-ghost !p-1 no-drag" onClick={handleAddDrive} title="Add drive or folder (⌘O)">
          <FolderPlus size={14} />
        </button>
      </div>

      {drives.length === 0 && (
        <button
          onClick={handleAddDrive}
          className="w-full text-xs text-neutral-500 hover:text-accent border border-dashed border-white/10 rounded-lg py-2.5 no-drag"
        >
          Choose a drive or folder to index
        </button>
      )}

      <div className="space-y-0.5">
        {drives.map((drive) => (
          <div key={drive.id}>
          <div
            className="group flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-white/[0.04] relative"
          >
            <button
              onClick={() => window.gx.setDriveEnabled(drive.id, !drive.enabled)}
              title={drive.enabled ? 'Disable drive' : 'Enable drive'}
              className="no-drag flex-shrink-0"
            >
              {drive.online ? (
                <HardDrive size={14} className={drive.enabled ? 'text-accent' : 'text-neutral-600'} />
              ) : (
                <WifiOff size={14} className="text-red-400/70" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div
                className={clsx(
                  'text-sm truncate',
                  drive.enabled ? 'text-neutral-200' : 'text-neutral-500 line-through'
                )}
                title={drive.rootPath}
              >
                {drive.label}
              </div>
            </div>
            {driveErrors[drive.id] && (
              <span title={driveErrors[drive.id]} className="flex-shrink-0 text-red-400">
                <AlertTriangle size={13} />
              </span>
            )}
            <span className="text-xs text-neutral-500 tabular-nums flex-shrink-0">
              {drive.photoCount.toLocaleString()}
            </span>
            <button
              className="btn-ghost !p-1 no-drag opacity-0 group-hover:opacity-100"
              onClick={() => setMenuFor(menuFor === drive.id ? null : drive.id)}
            >
              <MoreVertical size={13} />
            </button>
            {menuFor === drive.id && (
              <div className="absolute right-0 top-8 z-20 panel py-1 w-36 text-sm animate-scale-in">
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] flex items-center gap-2 no-drag"
                  onClick={() => {
                    void window.gx.rescanDrive(drive.id)
                    setMenuFor(null)
                  }}
                >
                  <RefreshCw size={13} /> Rescan
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] flex items-center gap-2 text-red-400 no-drag"
                  onClick={() => {
                    void window.gx.removeDrive(drive.id)
                    setMenuFor(null)
                  }}
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            )}
          </div>
          {driveErrors[drive.id] && (
            <div className="text-[11px] text-red-400/80 leading-snug pl-6 pr-1 pb-1 pt-0.5">
              {driveErrors[drive.id]}
            </div>
          )}
          </div>
        ))}
      </div>

      <div className="pt-2 mt-1 border-t border-white/[0.06] px-1 text-xs text-neutral-500 flex justify-between">
        <span>Total indexed</span>
        <span className="tabular-nums text-neutral-300">{totalPhotoCount.toLocaleString()}</span>
      </div>
    </div>
  )
}
