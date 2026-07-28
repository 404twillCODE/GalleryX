import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import type { Photo, SortField } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import { dayKey, formatGroupLabel } from '../../lib/format'
import { PhotoTile } from './PhotoTile'
import { EmptyState } from './EmptyState'

const GAP = 8
const PADDING_X = 16
const HEADER_ROW_HEIGHT = 44
// Date headers only make sense while the gallery is ordered by one of these fields — sorting
// by name/size/etc. would otherwise scatter same-day photos across the grid.
const DATE_SORT_FIELDS: SortField[] = ['dateTaken', 'dateCreated', 'dateModified']

type PhotoRow = { type: 'photos'; items: (Photo & { renderWidth: number })[]; height: number }
type HeaderRow = { type: 'header'; label: string; key: string }
type Row = PhotoRow | HeaderRow

export interface GalleryGridHandle {
  scrollToGroupKey: (key: string) => void
}

export type GroupOfFn = (photo: Photo) => { key: string; label: string } | null

function buildRows(
  items: Photo[],
  containerWidth: number,
  targetHeight: number,
  groupOf: GroupOfFn | null
): Row[] {
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
      type: 'photos',
      items: current.map(({ photo, naturalWidth }) => ({ ...photo, renderWidth: Math.round(naturalWidth * scale) })),
      height: Math.round(targetHeight * scale)
    })
    current = []
    currentWidth = 0
  }

  let lastGroupKey: string | null = null
  for (const photo of items) {
    if (groupOf) {
      const group = groupOf(photo)
      if (group && group.key !== lastGroupKey) {
        flush(true)
        rows.push({ type: 'header', label: group.label, key: group.key })
        lastGroupKey = group.key
      }
    }
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

/** Structural subset of both `useGalleryPhotos` and `useTimelinePhotos` — GalleryGrid only
 *  needs these fields, so it can render either kind of paginated media list. */
interface GallerySource {
  items: Photo[]
  total: number
  loading: boolean
  hasMore: boolean
  loadMore: () => void
}

interface Props {
  gallery: GallerySource
  /** Overrides the default "group by day when sorted by a date field" behavior — used by the
   *  Timeline view to group by year/month/shoot/camera/lens/folder/drive instead. */
  groupOf?: GroupOfFn
}

export const GalleryGrid = forwardRef<GalleryGridHandle, Props>(function GalleryGrid({ gallery, groupOf }, ref) {
  const { items, loading, hasMore, loadMore, total } = gallery
  const thumbnailSize = useAppStore((s) => s.thumbnailSize)
  const sortField = useAppStore((s) => s.sortField)
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

  const defaultGroupField = DATE_SORT_FIELDS.includes(sortField) ? sortField : null
  const effectiveGroupOf: GroupOfFn | null = useMemo(() => {
    if (groupOf) return groupOf
    if (!defaultGroupField) return null
    return (photo) => {
      const dateValue = photo[defaultGroupField] as string | null
      return { key: dayKey(dateValue), label: formatGroupLabel(dateValue) }
    }
  }, [groupOf, defaultGroupField])

  const rows = useMemo(
    () => buildRows(items, containerWidth, thumbnailSize, effectiveGroupOf),
    [items, containerWidth, thumbnailSize, effectiveGroupOf]
  )

  useEffect(() => {
    const photoRows = rows.filter((r): r is PhotoRow => r.type === 'photos')
    if (photoRows.length > 2) {
      const sample = photoRows.slice(0, Math.min(6, photoRows.length))
      const avgCols = Math.round(sample.reduce((s, r) => s + r.items.length, 0) / sample.length)
      setGridColumns(Math.max(1, avgCols))
    }
  }, [rows, setGridColumns])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.type === 'header' ? HEADER_ROW_HEIGHT : thumbnailSize + GAP),
    overscan: 6
  })

  useImperativeHandle(
    ref,
    () => ({
      scrollToGroupKey: (key: string) => {
        // Exact match first (e.g. day/shoot/camera keys), then prefix match so a "jump to year"
        // request still lands correctly when the active grouping is finer (e.g. year-month).
        let idx = rows.findIndex((r) => r.type === 'header' && r.key === key)
        if (idx < 0) idx = rows.findIndex((r) => r.type === 'header' && r.key.startsWith(key))
        if (idx >= 0) rowVirtualizer.scrollToIndex(idx, { align: 'start' })
      }
    }),
    [rows, rowVirtualizer]
  )

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
        if (!row || row.type !== 'photos') continue
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
    for (const row of rows) {
      if (row.type !== 'photos') continue
      for (const p of row.items) map.set(p.id, i++)
    }
    return map
  }, [rows])

  const flatOrder = useMemo(() => {
    const arr: string[] = []
    for (const row of rows) {
      if (row.type !== 'photos') continue
      for (const p of row.items) arr.push(p.id)
    }
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

            if (row.type === 'header') {
              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{ position: 'absolute', top: virtualRow.start, left: 0, width: '100%' }}
                  className={clsx('flex items-baseline px-1', virtualRow.index === 0 ? 'pt-1 pb-2.5' : 'pt-5 pb-2.5')}
                >
                  <h3 className="text-[15px] font-semibold text-neutral-100 tracking-tight">{row.label}</h3>
                </div>
              )
            }

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
})
