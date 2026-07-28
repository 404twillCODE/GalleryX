import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaKindFilter, Photo, PhotoQuery } from '../../../shared/types'
import { DEFAULT_FILTERS } from '../../../shared/types'
import { useAppStore } from '../store/useAppStore'

const PAGE_SIZE = 240

export interface TimelinePhotosState {
  items: Photo[]
  total: number
  loading: boolean
  loadMore: () => void
  hasMore: boolean
  mediaKind: MediaKindFilter
  setMediaKind: (m: MediaKindFilter) => void
  updateOne: (id: string, patch: Partial<Photo>) => void
}

/** Timeline is a self-contained browsing mode — it deliberately does NOT read/write the
 *  global gallery `view`/`sortField`/`filters` in the app store, so switching into Timeline
 *  and back never disturbs whatever the user had the main library gallery showing. */
export function useTimelinePhotos(): TimelinePhotosState {
  const libraryVersion = useAppStore((s) => s.libraryVersion)
  const [mediaKind, setMediaKind] = useState<MediaKindFilter>('both')
  const [items, setItems] = useState<Photo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const requestSeq = useRef(0)

  const buildQuery = useCallback(
    (offset: number): PhotoQuery => ({
      view: { kind: 'timeline' },
      sortField: 'dateTaken',
      sortDirection: 'desc',
      filters: { ...DEFAULT_FILTERS, mediaKind },
      searchText: '',
      offset,
      limit: PAGE_SIZE
    }),
    [mediaKind]
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
  }, [mediaKind, libraryVersion])

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

  const updateOne = useCallback((id: string, patch: Partial<Photo>) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  return { items, total, loading, loadMore, hasMore: items.length < total, mediaKind, setMediaKind, updateOne }
}
