import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'
import type { MediaKindFilter, Photo, TimelineBucket, TimelineGroupBy } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import { useTimelinePhotos } from '../../hooks/useTimelinePhotos'
import { GalleryGrid, type GalleryGridHandle, type GroupOfFn } from '../Gallery/GalleryGrid'
import { formatBucketLabel } from '../../lib/format'
import { MONTH_NAMES, bestDate, bucketKeyFor, computeShootKeys } from '../../lib/timelineGrouping'

const GROUP_OPTIONS: { value: TimelineGroupBy; label: string }[] = [
  { value: 'year-month', label: 'Year & Month' },
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'day', label: 'Day' },
  { value: 'shoot', label: 'Shoot' },
  { value: 'camera', label: 'Camera' },
  { value: 'lens', label: 'Lens' },
  { value: 'folder', label: 'Folder' },
  { value: 'drive', label: 'Drive' }
]

const MEDIA_TABS: { value: MediaKindFilter; label: string }[] = [
  { value: 'both', label: 'All' },
  { value: 'photo', label: 'Photos' },
  { value: 'video', label: 'Videos' }
]

export function TimelineView(): JSX.Element {
  const setActiveSection = useAppStore((s) => s.setActiveSection)
  const thumbnailSize = useAppStore((s) => s.thumbnailSize)
  const setThumbnailSize = useAppStore((s) => s.setThumbnailSize)
  const settings = useAppStore((s) => s.settings)

  const timeline = useTimelinePhotos()
  const { items, mediaKind, setMediaKind } = timeline

  const [groupBy, setGroupBy] = useState<TimelineGroupBy>(settings?.timelineDefaultGroupBy ?? 'year-month')
  const [yearBuckets, setYearBuckets] = useState<TimelineBucket[]>([])
  const [shootNames, setShootNames] = useState<Record<string, string>>({})
  const gridRef = useRef<GalleryGridHandle>(null)

  useEffect(() => {
    void window.gx.getTimelineBuckets('year').then(setYearBuckets)
    void window.gx.listShootNames().then(setShootNames)
  }, [])

  const shootGapMinutes = settings?.shootGapMinutes ?? 180
  const shootKeyByPhoto = useMemo(
    () => (groupBy === 'shoot' ? computeShootKeys(items, shootGapMinutes) : null),
    [groupBy, items, shootGapMinutes]
  )

  const groupOf: GroupOfFn = useMemo(() => {
    return (photo: Photo) => {
      switch (groupBy) {
        case 'year':
        case 'year-month':
        case 'month':
        case 'day': {
          const iso = bestDate(photo)
          const key = bucketKeyFor(groupBy, iso)
          const label =
            key === 'unknown'
              ? 'Date Unavailable'
              : groupBy === 'month'
                ? MONTH_NAMES[Number(key) - 1]
                : formatBucketLabel(key)
          return { key, label }
        }
        case 'shoot': {
          const key = shootKeyByPhoto?.get(photo.id) ?? 'shoot:unknown'
          if (key === 'shoot:unknown') return { key, label: 'Unknown Date' }
          const custom = shootNames[key]
          const iso = key.slice('shoot:'.length)
          return { key, label: custom ?? `Shoot — ${formatBucketLabel(bucketKeyFor('day', iso))}` }
        }
        case 'camera': {
          const label = [photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ') || 'Unknown Camera'
          return { key: label, label }
        }
        case 'lens': {
          const label = photo.lens || 'Unknown Lens'
          return { key: label, label }
        }
        case 'folder':
          return { key: photo.folderPath, label: photo.folderPath }
        case 'drive':
          return { key: photo.driveId, label: photo.driveId }
        default:
          return null
      }
    }
  }, [groupBy, shootKeyByPhoto, shootNames])

  const handleRenameActiveShoot = async (): Promise<void> => {
    // Renames the shoot the first currently-loaded item belongs to — a lightweight affordance
    // given Timeline doesn't have a per-header action slot in this virtualized layout.
    if (groupBy !== 'shoot' || !items.length || !shootKeyByPhoto) return
    const key = shootKeyByPhoto.get(items[0].id)
    if (!key || key === 'shoot:unknown') return
    const name = window.prompt('Rename this shoot', shootNames[key] ?? '')
    if (!name) return
    await window.gx.renameShoot(key, name)
    setShootNames((prev) => ({ ...prev, [key]: name }))
  }

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-base-bg">
      <div className="h-14 flex-shrink-0 flex items-center gap-3 px-4 border-b border-white/[0.06]">
        <div className="text-[15px] font-semibold text-white">Timeline</div>
        <span className="text-xs text-neutral-500 tabular-nums">{timeline.total.toLocaleString()} items</span>

        <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 ml-2">
          {MEDIA_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setMediaKind(tab.value)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-xs transition-colors',
                mediaKind === tab.value ? 'bg-accent/20 text-accent' : 'text-neutral-400 hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as TimelineGroupBy)}
          className="bg-base-raised border border-white/10 rounded-lg px-2 py-1.5 text-xs text-neutral-300"
        >
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Group by: {o.label}
            </option>
          ))}
        </select>

        {groupBy === 'shoot' && (
          <button className="btn-ghost text-xs px-2" onClick={() => void handleRenameActiveShoot()}>
            Rename first shoot…
          </button>
        )}

        <div className="flex-1" />

        <input
          type="range"
          min={100}
          max={420}
          step={10}
          value={thumbnailSize}
          onChange={(e) => setThumbnailSize(Number(e.target.value))}
          className="w-24 accent-accent"
          title="Thumbnail size"
        />

        <button className="btn-ghost !p-1.5" onClick={() => setActiveSection('library')} title="Close Timeline">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Jump-to-year rail */}
        {yearBuckets.length > 1 && (
          <div className="w-14 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-2 flex flex-col items-center gap-1">
            {yearBuckets.map((b) => (
              <button
                key={b.key}
                className="text-[11px] text-neutral-500 hover:text-accent tabular-nums py-0.5"
                title={`${b.photoCount + b.videoCount} items in ${b.key}`}
                onClick={() => gridRef.current?.scrollToGroupKey(b.key)}
              >
                {b.key}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {timeline.total === 0 && !timeline.loading ? (
            <div className="h-full flex items-center justify-center text-sm text-neutral-500">
              No photos or videos found. Add a drive from the sidebar to get started.
            </div>
          ) : (
            <GalleryGrid ref={gridRef} gallery={timeline} groupOf={groupOf} />
          )}
        </div>
      </div>
    </div>
  )
}
