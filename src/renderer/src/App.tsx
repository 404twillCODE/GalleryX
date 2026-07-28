import { useCallback, useEffect, useMemo } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { GalleryPanel } from './components/Gallery/GalleryPanel'
import { MetadataPanel } from './components/MetadataPanel/MetadataPanel'
import { ImageViewer } from './components/Viewer/ImageViewer'
import { SettingsModal } from './components/Settings/SettingsModal'
import { ToastStack } from './components/common/ToastStack'
import { useAppStore } from './store/useAppStore'
import { useLibrarySync } from './hooks/useLibrarySync'
import { useGalleryPhotos } from './hooks/useGalleryPhotos'

const THUMB_MIN = 100
const THUMB_MAX = 420
const THUMB_DEFAULT = 220
const THUMB_STEP = 30

export default function App(): JSX.Element {
  const { scanProgress } = useLibrarySync()
  const gallery = useGalleryPhotos()

  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const metadataPanelCollapsed = useAppStore((s) => s.metadataPanelCollapsed)
  const viewerOpen = useAppStore((s) => s.viewerOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const closeViewer = useAppStore((s) => s.closeViewer)
  const openViewer = useAppStore((s) => s.openViewer)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const anchorId = useAppStore((s) => s.anchorId)
  const setSelection = useAppStore((s) => s.setSelection)
  const activePhotoId = useAppStore((s) => s.activePhotoId)
  const gridColumns = useAppStore((s) => s.gridColumns)
  const thumbnailSize = useAppStore((s) => s.thumbnailSize)
  const setThumbnailSize = useAppStore((s) => s.setThumbnailSize)
  const requestSearchFocus = useAppStore((s) => s.requestSearchFocus)

  const items = gallery.items
  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((p, i) => map.set(p.id, i))
    return map
  }, [items])

  const toggleFavoriteForSelection = useCallback(async () => {
    const ids = selectedIds.length ? selectedIds : activePhotoId ? [activePhotoId] : []
    if (!ids.length) return
    const targetFav = !items.find((p) => p.id === ids[0])?.isFavorite
    for (const id of ids) {
      gallery.updateOne(id, { isFavorite: targetFav })
      await window.gx.setFavorite(id, targetFav)
    }
  }, [selectedIds, activePhotoId, items, gallery])

  const moveSelection = useCallback(
    (delta: number, additive: boolean) => {
      const currentAnchor = anchorId ?? activePhotoId ?? items[0]?.id
      const currentIndex = currentAnchor ? indexById.get(currentAnchor) ?? 0 : 0
      const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + delta))
      const nextId = items[nextIndex]?.id
      if (!nextId) return
      if (additive) {
        setSelection(Array.from(new Set([...selectedIds, nextId])), nextId)
      } else {
        setSelection([nextId], nextId)
      }
      document.getElementById(`photo-tile-${nextId}`)?.scrollIntoView({ block: 'nearest' })
    },
    [anchorId, activePhotoId, indexById, items, selectedIds, setSelection]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const isEditable =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void window.gx.chooseFolder().then((p) => {
          if (p) void window.gx.addDrive(p)
        })
        return
      }
      if (meta && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        void window.gx.rescanAll()
        return
      }
      if (meta && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        requestSearchFocus()
        return
      }
      if (isEditable) return

      if (e.key === 'Escape') {
        if (viewerOpen) closeViewer()
        else if (settingsOpen) setSettingsOpen(false)
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        const id = anchorId ?? activePhotoId
        if (id) openViewer(id)
        return
      }
      if (e.key.toLowerCase() === 'f') {
        void toggleFavoriteForSelection()
        return
      }
      if (e.key === '+' || e.key === '=') {
        setThumbnailSize(Math.min(THUMB_MAX, thumbnailSize + THUMB_STEP))
        return
      }
      if (e.key === '-' || e.key === '_') {
        setThumbnailSize(Math.max(THUMB_MIN, thumbnailSize - THUMB_STEP))
        return
      }
      if (e.key === '0') {
        setThumbnailSize(THUMB_DEFAULT)
        return
      }
      if (!viewerOpen && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        const additive = e.shiftKey
        if (e.key === 'ArrowLeft') moveSelection(-1, additive)
        if (e.key === 'ArrowRight') moveSelection(1, additive)
        if (e.key === 'ArrowUp') moveSelection(-gridColumns, additive)
        if (e.key === 'ArrowDown') moveSelection(gridColumns, additive)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    anchorId,
    activePhotoId,
    viewerOpen,
    settingsOpen,
    thumbnailSize,
    gridColumns,
    moveSelection,
    toggleFavoriteForSelection,
    closeViewer,
    openViewer,
    setSettingsOpen,
    setThumbnailSize,
    requestSearchFocus
  ])

  return (
    <div className="h-screen w-screen flex bg-base-bg text-neutral-200 overflow-hidden select-none">
      <Sidebar collapsed={sidebarCollapsed} scanProgress={scanProgress} />
      <GalleryPanel gallery={gallery} />
      {!metadataPanelCollapsed && <MetadataPanel gallery={gallery} />}
      {viewerOpen && <ImageViewer items={items} />}
      {settingsOpen && <SettingsModal />}
      <ToastStack />
    </div>
  )
}
