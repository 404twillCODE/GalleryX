import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { ScanProgressEvent } from '../../../shared/types'

export function useLibrarySync(): { scanProgress: Record<string, ScanProgressEvent> } {
  const setDrives = useAppStore((s) => s.setDrives)
  const setFolderTree = useAppStore((s) => s.setFolderTree)
  const setCollectionCounts = useAppStore((s) => s.setCollectionCounts)
  const setSettings = useAppStore((s) => s.setSettings)
  const bumpLibraryVersion = useAppStore((s) => s.bumpLibraryVersion)
  const setDriveError = useAppStore((s) => s.setDriveError)
  const pushToast = useAppStore((s) => s.pushToast)
  const [scanProgress, setScanProgress] = useState<Record<string, ScanProgressEvent>>({})
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true

    const refreshReferenceData = (): void => {
      void window.gx.listDrives().then((d) => mounted && setDrives(d))
      void window.gx.getFolderTree().then((t) => mounted && setFolderTree(t))
      void window.gx.getCollectionCounts().then((c) => mounted && setCollectionCounts(c))
    }

    const scheduleRefresh = (): void => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(refreshReferenceData, 250)
    }

    void window.gx.getSettings().then((s) => mounted && setSettings(s))
    refreshReferenceData()

    const offDrives = window.gx.onDrivesChanged((drives) => mounted && setDrives(drives))
    const offLibrary = window.gx.onLibraryChanged(() => {
      bumpLibraryVersion()
      scheduleRefresh()
    })
    const offScan = window.gx.onScanProgress((evt) => {
      setScanProgress((prev) => ({ ...prev, [evt.driveId]: evt }))
      if (evt.phase === 'idle' || evt.phase === 'error') scheduleRefresh()
      if (evt.phase === 'error' && evt.fatal) {
        const message = evt.error ?? 'Unknown error while scanning'
        setDriveError(evt.driveId, message)
        pushToast('error', message)
      } else if (evt.phase === 'idle') {
        setDriveError(evt.driveId, null)
      }
    })

    return () => {
      mounted = false
      offDrives()
      offLibrary()
      offScan()
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [setDrives, setFolderTree, setCollectionCounts, setSettings, bumpLibraryVersion])

  return { scanProgress }
}
