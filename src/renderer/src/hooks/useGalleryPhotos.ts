import { useCallback, useEffect, useRef, useState } from 'react'
import type { Photo, PhotoQuery } from '../../../shared/types'
import { useAppStore } from '../store/useAppStore'

const PAGE_SIZE = 180

export interface GalleryPhotosState {
  items: Photo[]
  total: number
  loading: boolean
  loadMore: () => void
  hasMore: boolean
  reload: () => void
  updateOne: (id: string, patch: Partial<Photo>) => void
}

export function useGalleryPhotos(): GalleryPhotosState {
  const view = useAppStore((s) => s.view)
  const sortField = useAppStore((s) => s.sortField)
  const sortDirection = useAppStore((s) => s.sortDirection)
  const filters = useAppStore((s) => s.filters)
  const searchText = useAppStore((s) => s.searchText)
  const libraryVersion = useAppStore((s) => s.libraryVersion)

  const [items, setItems] = useState<Photo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const requestSeq = useRef(0)

  const buildQuery = useCallback(
    (offset: number): PhotoQuery => ({
      view,
      sortField,
      sortDirection,
      filters,
      searchText,
      offset,
      limit: PAGE_SIZE
    }),
    [view, sortField, sortDirection, filters, searchText]
  )

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      const seq = ++requestSeq.current
      setLoading(true)
      try {
        const result = await window.gx.queryPhotos(buildQuery(offset))
        if (seq !== requestSeq.current) return
        setTotal(result.total)
        setItems((prev) => (replace ? result.items : [...prev, ...result.items]))
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [buildQuery]
  )

  useEffect(() => {
    setItems([])
    setTotal(0)
    void fetchPage(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sortField, sortDirection, filters, searchText, libraryVersion])

  // Patch thumbnail status in place as background generation completes, so tiles
  // already on screen swap from skeleton -> image without a full reload/flicker.
  useEffect(() => {
    return window.gx.onThumbnailsReady(({ ids }) => {
      const idSet = new Set(ids)
      setItems((prev) => prev.map((p) => (idSet.has(p.id) ? { ...p, thumbStatus: 'ready' } : p)))
    })
  }, [])

  const loadMore = useCallback(() => {
    if (loading) return
    if (items.length >= total) return
    void fetchPage(items.length, false)
  }, [fetchPage, items.length, total, loading])

  const reload = useCallback(() => {
    void fetchPage(0, true)
  }, [fetchPage])

  const updateOne = useCallback((id: string, patch: Partial<Photo>) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  return { items, total, loading, loadMore, hasMore: items.length < total, reload, updateOne }
}
