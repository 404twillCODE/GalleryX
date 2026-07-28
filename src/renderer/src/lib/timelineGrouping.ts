import type { Photo } from '../../../shared/types'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/** Best-available date for a photo/video, in the priority order required by the Timeline spec:
 *  original capture date first (dateTaken already folds in EXIF/video-creation metadata at the
 *  scanning layer), then file creation, then file modification, then finally date-indexed —
 *  the last-resort fallback that's always present. */
export function bestDate(photo: Pick<Photo, 'dateTaken' | 'dateCreated' | 'dateModified' | 'dateIndexed'>): string | null {
  return photo.dateTaken || photo.dateCreated || photo.dateModified || photo.dateIndexed || null
}

/** True when `bestDate` had to fall all the way back past the original capture date — used to
 *  let the UI clearly flag "using a fallback date" per the spec. */
export function usedFallbackDate(photo: Pick<Photo, 'dateTaken'>): boolean {
  return !photo.dateTaken
}

export type DateBucketGrouping = 'year' | 'year-month' | 'month' | 'day'

export function bucketKeyFor(groupBy: DateBucketGrouping, iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  if (groupBy === 'year') return String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  if (groupBy === 'month') return mm
  if (groupBy === 'year-month') return `${d.getFullYear()}-${mm}`
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Groups a list into "shoots" by looking for gaps larger than the configured threshold between
 *  consecutive items. Input does NOT need to be pre-sorted — this sorts by best-available date
 *  ascending internally so the result is stable regardless of caller order. Purely virtual:
 *  never touches files or folders on disk. Returns a Map from photo id -> stable shoot key
 *  (`shoot:<ISO of the earliest item in the cluster>`, or `shoot:unknown` when no usable date
 *  exists for that item). */
export function computeShootKeys<T extends Pick<Photo, 'id' | 'dateTaken' | 'dateCreated' | 'dateModified' | 'dateIndexed'>>(
  items: T[],
  gapMinutes: number
): Map<string, string> {
  const map = new Map<string, string>()
  const withDates = items
    .map((item) => ({ item, time: (() => { const iso = bestDate(item); return iso ? new Date(iso).getTime() : null })() }))
    .filter((x): x is { item: T; time: number } => x.time != null)
    .sort((a, b) => a.time - b.time)

  for (const item of items) {
    if (bestDate(item) == null) map.set(item.id, 'shoot:unknown')
  }

  let clusterStartTime: number | null = null
  let prevTime: number | null = null
  for (const { item, time } of withDates) {
    if (prevTime == null || time - prevTime > gapMinutes * 60000) {
      clusterStartTime = time
    }
    map.set(item.id, `shoot:${new Date(clusterStartTime!).toISOString()}`)
    prevTime = time
  }
  return map
}
