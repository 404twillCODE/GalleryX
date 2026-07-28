import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Photo } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import type { GalleryPhotosState } from '../../hooks/useGalleryPhotos'
import { PhotoTile } from './PhotoTile'
import { EmptyState } from './EmptyState'

const GAP = 8
const PADDING_X = 16

interface Row {
  items: (Photo & { renderWidth: number })[]
  height: number
}

function buildRows(items: Photo[], containerWidth: number, targetHeight: number): Row[] {
  if (containerWidth <= 0) return []
  const availableWidth = containerWidth - PADDING_X * 2
  const rows: Row[] = []
  let current: { photo: Photo; naturalWidth: number }[] = []
  let currentWidth = 0

  const flush = (stretch: boolean): void => {
    if (!current.length) return
    const totalGap = GAP * (current.length - 1)
    const rawWidth = currentWidth
    const scale = stretch ? Math.min(1.35, Math.max(0.75, (availableWidth - totalGap) / Math.max(1, rawWidth))) : 1
    rows.push({
      items: current.map(({ photo, naturalWidth }) => ({ ...photo, renderWidth: Math.round(naturalWidth * scale) })),
      height: Math.round(targetHeight * scale)
    })
    current = []
    currentWidth = 0
  }

  for (const photo of items) {
    const ratio = photo.width && photo.height ? photo.width / photo.height : 1.5
    const naturalWidth = targetHeight * Math.max(0.4, Math.min(3, ratio))
    const totalGapIfAdded = GAP * current.length
    if (current.length > 0 && currentWidth + naturalWidth + totalGapIfAdded > availableWidth) {
      flush(true)
    }
    current.push({ photo, naturalWidth })
    currentWidth += naturalWidth
  }
  flush(false)

  return rows
}

interface Props {
  gallery: GalleryPhotosState
}

export function GalleryGrid({ gallery }: Props): JSX.Element {
  const { items, loading, hasMore, loadMore, total } = gallery
  const thumbnailSize = useAppStore((s) => s.thumbnailSize)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const setSelection = useAppStore((s) => s.setSelection)
  const anchorId = useAppStore((s) => s.anchorId)
  const openViewer = useAppStore((s) => s.openViewer)
  const setActivePhoto = useAppStore((s) => s.setActivePhoto)
  const setGridColumns = useAppStore((s) => s.setGridColumns)

  const scrollRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(0)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (Math.abs(w - widthRef.current) > 1) {
        widthRef.current = w
        setContainerWidth(w)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [setContainerWidth])

  const rows = useMemo(
    () => buildRows(items, containerWidth, thumbnailSize),
    [items, containerWidth, thumbnailSize]
  )

  useEffect(() => {
    if (rows.length > 2) {
      const avgCols = Math.round(rows.slice(0, Math.min(6, rows.length)).reduce((s, r) => s + r.items.length, 0) / Math.min(6, rows.length))
      setGridColumns(Math.max(1, avgCols))
    }
  }, [rows, setGridColumns])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => thumbnailSize + GAP,
    overscan: 6
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  // Infinite scroll: request the next page once we approach the end of loaded rows.
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1]
    if (!last) return
    if (last.index >= rows.length - 4 && hasMore && !loading) {
      loadMore()
    }
  }, [virtualItems, rows.length, hasMore, loading, loadMore])

  // Prioritize thumbnail generation for currently visible photos.
  const prioritizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (prioritizeTimer.current) clearTimeout(prioritizeTimer.current)
    prioritizeTimer.current = setTimeout(() => {
      const visibleIds: string[] = []
      for (const v of virtualItems) {
        const row = rows[v.index]
        if (!row) continue
        for (const p of row.items) visibleIds.push(p.id)
      }
      if (visibleIds.length) window.gx.prioritizeThumbnails(visibleIds)
    }, 120)
    return () => {
      if (prioritizeTimer.current) clearTimeout(prioritizeTimer.current)
    }
  }, [virtualItems, rows])

  const flatIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let i = 0
    for (const row of rows) for (const p of row.items) map.set(p.id, i++)
    return map
  }, [rows])

  const flatOrder = useMemo(() => {
    const arr: string[] = []
    for (const row of rows) for (const p of row.items) arr.push(p.id)
    return arr
  }, [rows])

  const handleSelect = useCallback(
    (photo: Photo, e: React.MouseEvent) => {
      setActivePhoto(photo.id)
      if (e.shiftKey && anchorId) {
        const a = flatIndexMap.get(anchorId) ?? 0
        const b = flatIndexMap.get(photo.id) ?? 0
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelection(flatOrder.slice(lo, hi + 1), photo.id)
      } else if (e.metaKey || e.ctrlKey) {
        const set = new Set(selectedIds)
        if (set.has(photo.id)) set.delete(photo.id)
        else set.add(photo.id)
        setSelection(Array.from(set), photo.id)
      } else {
        setSelection([photo.id], photo.id)
      }
    },
    [anchorId, flatIndexMap, flatOrder, selectedIds, setSelection, setActivePhoto]
  )

  const showEmptyState = !loading && total === 0 && items.length === 0

  return (
    // NOTE: this scroll container must always be mounted (never conditionally swapped out
    // for <EmptyState/>) — the ResizeObserver below attaches to it exactly once, so if the
    // node were unmounted/remounted the observer would silently stop tracking width changes
    // and every row-layout calculation downstream would freeze at containerWidth = 0.
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 relative">
      {showEmptyState ? (
        <EmptyState />
      ) : (
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: virtualRow.start,
                  left: 0,
                  width: '100%',
                  display: 'flex',
                  gap: GAP,
                  paddingBottom: GAP
                }}
              >
                {row.items.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    width={photo.renderWidth}
                    height={row.height}
                    selected={selectedIds.includes(photo.id)}
                    onSelect={(e) => handleSelect(photo, e)}
                    onOpen={() => openViewer(photo.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
      {loading && items.length === 0 && !showEmptyState && (
        <div className="text-center text-xs text-neutral-500 py-4">Loading photos…</div>
      )}
    </div>
  )
}
