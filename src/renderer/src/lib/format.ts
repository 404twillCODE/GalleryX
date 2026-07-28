export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, exp)
  return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

export function formatAperture(f: number | null): string {
  return f ? `f/${f.toFixed(1)}` : '—'
}

export function formatFocalLength(mm: number | null): string {
  return mm ? `${Math.round(mm)}mm` : '—'
}

/** Stable per-calendar-day grouping key (local time), or 'none' when there's no usable date. */
export function dayKey(iso: string | null): string {
  if (!iso) return 'none'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'none'
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Apple-Photos-style day header: "Today" / "Yesterday" / "Monday, July 27" / "Monday, July 27, 2024". */
export function formatGroupLabel(iso: string | null): string {
  if (!iso) return 'No Date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No Date'

  const now = new Date()
  const startOfDay = (dt: Date): number => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'

  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' })
  if (d.getFullYear() === now.getFullYear()) {
    return `${weekday}, ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
  }
  return `${weekday}, ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
}

export function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '0:00'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "2024-03" -> "March 2024"; "2024" -> "2024"; "2024-03-14" -> "March 14, 2024". */
export function formatBucketLabel(key: string): string {
  const parts = key.split('-').map(Number)
  if (parts.length === 1) return String(parts[0])
  const [year, month, day] = parts
  const d = new Date(year, (month ?? 1) - 1, day ?? 1)
  if (parts.length === 2) return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export function basename(p: string): string {
  const clean = p.replace(/[\\/]+$/, '')
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return idx >= 0 ? clean.slice(idx + 1) : clean
}

export function dirname(p: string): string {
  const clean = p.replace(/[\\/]+$/, '')
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return idx >= 0 ? clean.slice(0, idx) : ''
}
