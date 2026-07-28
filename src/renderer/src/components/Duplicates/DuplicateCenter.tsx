import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Film,
  Heart,
  ImageOff,
  Pause,
  Play,
  Search,
  Star,
  Trash2,
  WifiOff,
  X
} from 'lucide-react'
import clsx from 'clsx'
import type {
  Drive,
  DuplicateGroup,
  DuplicateGroupKind,
  DuplicateGroupStatus,
  DuplicateMember,
  DuplicateScanOptions,
  DuplicateScanProgress,
  Photo,
  SimilarityThreshold
} from '../../../../shared/types'
import { DEFAULT_DUPLICATE_SCAN_OPTIONS, isRawExtension } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import { formatAperture, formatBytes, formatDate, formatDuration } from '../../lib/format'

type Tab = DuplicateGroupKind | 'ignored'

const TABS: { key: Tab; label: string }[] = [
  { key: 'exact', label: 'Exact Duplicates' },
  { key: 'raw_jpeg', label: 'RAW + JPEG Pairs' },
  { key: 'similar', label: 'Similar Images' },
  { key: 'burst', label: 'Burst Groups' },
  { key: 'video', label: 'Duplicate Videos' },
  { key: 'ignored', label: 'Previously Ignored' }
]

const THRESHOLD_OPTIONS: { value: SimilarityThreshold; label: string }[] = [
  { value: 'very-strict', label: 'Very strict' },
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'broad', label: 'Broad' }
]

function groupsForTab(groups: DuplicateGroup[], tab: Tab): DuplicateGroup[] {
  if (tab === 'ignored') return groups.filter((g) => g.status !== 'pending')
  return groups.filter((g) => g.kind === tab && g.status === 'pending')
}

interface SelectionKey {
  photoId: string
  groupId: string
}

// ---------------------------------------------------------------------------
// Scan setup screen
// ---------------------------------------------------------------------------

function ScanSetup({
  drives,
  onStart
}: {
  drives: Drive[]
  onStart: (options: DuplicateScanOptions) => void
}): JSX.Element {
  const [options, setOptions] = useState<DuplicateScanOptions>(DEFAULT_DUPLICATE_SCAN_OPTIONS)
  const [scopeKind, setScopeKind] = useState<'library' | 'drive' | 'folder'>('library')
  const [driveId, setDriveId] = useState<string>(drives[0]?.id ?? '')
  const [folderPath, setFolderPath] = useState<string>('')

  const chooseFolder = async (): Promise<void> => {
    const chosen = await window.gx.chooseFolder()
    if (!chosen) return
    const drive = drives.find((d) => chosen.startsWith(d.rootPath))
    if (!drive) return
    setDriveId(drive.id)
    setFolderPath(chosen)
  }

  const start = (): void => {
    const scope: DuplicateScanOptions['scope'] =
      scopeKind === 'drive'
        ? { kind: 'drive', driveId }
        : scopeKind === 'folder'
          ? { kind: 'folder', driveId, path: folderPath || driveId }
          : { kind: 'library' }
    onStart({ ...options, scope })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h2 className="text-base font-semibold text-white mb-1">Check for Duplicates</h2>
          <p className="text-sm text-neutral-500">
            Scan your library for exact duplicates, RAW+JPEG pairs, and visually similar images. Nothing is deleted
            until you review and confirm.
          </p>
        </div>

        <div className="panel p-4 space-y-4">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Scope</div>
          <div className="flex gap-2">
            {(['library', 'drive', 'folder'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setScopeKind(k)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm capitalize border',
                  scopeKind === k ? 'bg-accent/20 border-accent/50 text-accent' : 'border-white/10 text-neutral-400 hover:text-white'
                )}
              >
                {k === 'library' ? 'Entire library' : k === 'drive' ? 'Selected drive' : 'Selected folder'}
              </button>
            ))}
          </div>
          {scopeKind === 'drive' && (
            <select
              value={driveId}
              onChange={(e) => setDriveId(e.target.value)}
              className="w-full bg-base-raised border border-white/10 rounded-lg px-2.5 py-1.5 text-sm"
            >
              {drives.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          {scopeKind === 'folder' && (
            <div className="flex items-center gap-2">
              <div className="flex-1 truncate text-sm text-neutral-400 bg-base-raised border border-white/10 rounded-lg px-2.5 py-1.5">
                {folderPath || 'No folder chosen'}
              </div>
              <button className="btn-ghost !px-3 !py-1.5 border border-white/10" onClick={() => void chooseFolder()}>
                Choose…
              </button>
            </div>
          )}
          {scopeKind === 'folder' && (
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={options.includeSubfolders}
                onChange={(e) => setOptions((o) => ({ ...o, includeSubfolders: e.target.checked }))}
              />
              Include subfolders
            </label>
          )}
        </div>

        <div className="panel p-4 space-y-4">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Media</div>
          <div className="flex gap-2">
            {(['both', 'photos', 'videos'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setOptions((o) => ({ ...o, media: m }))}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm capitalize border',
                  options.media === m ? 'bg-accent/20 border-accent/50 text-accent' : 'border-white/10 text-neutral-400 hover:text-white'
                )}
              >
                {m === 'both' ? 'Photos and videos' : m}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-neutral-500">What to look for</div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={options.exactDuplicates}
              onChange={(e) => setOptions((o) => ({ ...o, exactDuplicates: e.target.checked }))}
            />
            Exact duplicates (identical file content)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={options.rawJpegPairs}
              onChange={(e) => setOptions((o) => ({ ...o, rawJpegPairs: e.target.checked }))}
            />
            RAW + JPEG pairs
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={options.similarImages}
              onChange={(e) => setOptions((o) => ({ ...o, similarImages: e.target.checked }))}
            />
            Similar images (visual content, resized/recompressed/cropped/edited copies)
          </label>
          {options.similarImages && (
            <div className="pl-6 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Sensitivity:</span>
              <select
                value={options.similarityThreshold}
                onChange={(e) => setOptions((o) => ({ ...o, similarityThreshold: e.target.value as SimilarityThreshold }))}
                className="bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-xs"
              >
                {THRESHOLD_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-neutral-500 pt-1">
            Burst-photo grouping and duplicate-video detection always run alongside the options above.
          </p>
        </div>

        <button
          className="btn-accent w-full justify-center py-2.5"
          disabled={scopeKind === 'folder' && !folderPath}
          onClick={start}
        >
          Start Scan
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scanning progress screen
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<DuplicateScanProgress['phase'], string> = {
  sizing: 'Grouping files by size…',
  'partial-hash': 'Computing quick hashes…',
  'full-hash': 'Confirming exact matches…',
  pairing: 'Matching RAW + JPEG pairs…',
  perceptual: 'Comparing visual similarity…',
  done: 'Scan complete',
  paused: 'Scan paused',
  cancelled: 'Scan cancelled',
  error: 'Scan failed'
}

function ScanProgressView({
  progress,
  onPause,
  onResume,
  onCancel
}: {
  progress: DuplicateScanProgress
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}): JSX.Element {
  const pct = progress.filesTotal > 0 ? Math.min(100, Math.round((progress.filesScanned / progress.filesTotal) * 100)) : 0
  const paused = progress.phase === 'paused'
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="text-sm text-neutral-300">{PHASE_LABEL[progress.phase]}</div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-neutral-500 tabular-nums">
          {progress.filesScanned.toLocaleString()} / {progress.filesTotal.toLocaleString()} files · {progress.groupsFound.toLocaleString()} groups
          found so far
        </div>
        {progress.error && <div className="text-xs text-red-400">{progress.error}</div>}
        <div className="flex items-center justify-center gap-2 pt-2">
          {paused ? (
            <button className="btn-ghost !px-3 !py-1.5 border border-white/10" onClick={onResume}>
              <Play size={13} /> Resume
            </button>
          ) : (
            <button className="btn-ghost !px-3 !py-1.5 border border-white/10" onClick={onPause}>
              <Pause size={13} /> Pause
            </button>
          )}
          <button className="btn-ghost !px-3 !py-1.5 border border-red-500/30 text-red-400" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Member card
// ---------------------------------------------------------------------------

function roleLabel(member: DuplicateMember): string {
  if (member.role === 'raw') return 'RAW'
  if (member.role === 'jpeg') return 'JPEG'
  return isRawExtension(member.photo.extension) ? 'RAW' : 'JPEG/Original'
}

function MemberCard({
  member,
  drives,
  selected,
  disabled,
  onToggle,
  onPreview
}: {
  member: DuplicateMember
  drives: Drive[]
  selected: boolean
  disabled: boolean
  onToggle: () => void
  onPreview: () => void
}): JSX.Element {
  const p = member.photo
  const drive = drives.find((d) => d.id === p.driveId)
  const isVideo = p.mediaType === 'video'

  return (
    <div
      className={clsx(
        'rounded-lg border overflow-hidden bg-white/[0.02] flex flex-col',
        selected ? 'border-accent ring-1 ring-accent/50' : 'border-white/[0.06]'
      )}
    >
      <div className="relative aspect-[4/3] bg-base-raised cursor-pointer group" onClick={onPreview}>
        {p.thumbStatus === 'ready' ? (
          <img src={window.gx.thumbUrl(p.id, p.thumbStatus)} alt={p.filename} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageOff size={22} className="text-neutral-600" />
          </div>
        )}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 rounded-full bg-black/45 flex items-center justify-center">
              <Play size={14} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
        {isVideo && p.durationMs != null && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white tabular-nums">
            {formatDuration(p.durationMs)}
          </div>
        )}
        {!member.online && (
          <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-amber-300">
            <WifiOff size={10} /> Offline
          </div>
        )}
        <label
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center bg-black/60 border border-white/30 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <input type="checkbox" className="sr-only" checked={selected} disabled={disabled} onChange={onToggle} />
          {selected && <Check size={12} className="text-accent" />}
        </label>
        {member.suggestedKeep && (
          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-500/80 text-[9px] font-medium text-white uppercase tracking-wide">
            Suggested keep
          </div>
        )}
      </div>

      <div className="p-2 space-y-1 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-neutral-200 font-medium flex-1" title={p.path}>
            {p.filename}
          </span>
          {p.isFavorite && <Heart size={11} className="text-accent flex-shrink-0" fill="currentColor" />}
          {isVideo && <Film size={11} className="text-neutral-500 flex-shrink-0" />}
        </div>
        <div className="text-neutral-500 truncate" title={p.folderPath}>
          {drive?.label ?? p.driveId} · {p.folderPath}
        </div>
        <div className="flex items-center gap-2 text-neutral-500">
          <span>{formatBytes(p.sizeBytes)}</span>
          {p.width && p.height && <span>{p.width}×{p.height}</span>}
          <span className="px-1 py-0.5 rounded bg-white/5 text-[10px]">{roleLabel(member)}</span>
        </div>
        <div className="text-neutral-500">{formatDate(p.dateTaken)}</div>
        {p.cameraModel && <div className="text-neutral-600 truncate">{p.cameraModel}{p.lens ? ` · ${p.lens}` : ''}</div>}
        {(p.iso || p.aperture || p.shutterSpeed) && (
          <div className="text-neutral-600">
            {[p.iso ? `ISO ${p.iso}` : null, formatAperture(p.aperture), p.shutterSpeed].filter(Boolean).join(' · ')}
          </div>
        )}
        {isVideo && (
          <div className="text-neutral-600">
            {[p.videoCodec, p.audioCodec, p.frameRate ? `${p.frameRate.toFixed(1)}fps` : null, p.bitrate ? `${Math.round(p.bitrate / 1000)}kbps` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
        {p.isExport && <div className="text-accent/80">Exported{p.exportFolderName ? ` · ${p.exportFolderName}` : ''}</div>}
        {p.rating > 0 && (
          <div className="flex items-center gap-0.5 text-amber-400">
            {Array.from({ length: p.rating }).map((_, i) => (
              <Star key={i} size={9} fill="currentColor" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

function GroupCard({
  group,
  drives,
  selectedIds,
  onToggleMember,
  onSetStatus,
  onPreview
}: {
  group: DuplicateGroup
  drives: Drive[]
  selectedIds: Set<string>
  onToggleMember: (photoId: string, groupId: string) => void
  onSetStatus: (groupId: string, status: DuplicateGroupStatus) => void
  onPreview: (photo: Photo) => void
}): JSX.Element {
  const selectedInGroup = group.members.filter((m) => selectedIds.has(m.photo.id)).length
  // Never allow every member of a group to be selected at once — at least one copy must survive.
  const canSelectMore = selectedInGroup < group.members.length - 1

  const quickAction = (predicate: (m: DuplicateMember) => boolean): void => {
    for (const m of group.members) {
      const shouldSelect = !predicate(m)
      const isSelected = selectedIds.has(m.photo.id)
      if (shouldSelect !== isSelected) onToggleMember(m.photo.id, group.id)
    }
  }

  return (
    <div className="panel p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">
          {group.members.length} files · {formatBytes(group.totalBytes)} total
          {group.reclaimableBytes > 0 && <span className="text-emerald-400"> · up to {formatBytes(group.reclaimableBytes)} reclaimable</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {group.kind === 'raw_jpeg' && (
            <>
              <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => onSetStatus(group.id, 'kept_all')}>
                Keep Both
              </button>
              <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => quickAction((m) => m.role === 'raw')}>
                Keep RAW
              </button>
              <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => quickAction((m) => m.role === 'jpeg')}>
                Keep JPEG
              </button>
              <button
                className="btn-ghost !text-[11px] !px-2 !py-1"
                onClick={() => {
                  const largest = [...group.members].sort((a, b) => b.photo.sizeBytes - a.photo.sizeBytes)[0]
                  quickAction((m) => m.photo.id === largest.photo.id)
                }}
              >
                Keep Larger
              </button>
              <button
                className="btn-ghost !text-[11px] !px-2 !py-1"
                onClick={() => {
                  const fav = group.members.find((m) => m.photo.isFavorite) ?? group.members[0]
                  quickAction((m) => m.photo.id === fav.photo.id)
                }}
              >
                Keep Favorite
              </button>
            </>
          )}
          <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => onSetStatus(group.id, 'not_duplicates')}>
            Not Duplicates
          </button>
          <button className="btn-ghost !text-[11px] !px-2 !py-1 text-neutral-500" onClick={() => onSetStatus(group.id, 'ignored')}>
            Ignore
          </button>
        </div>
      </div>

      {group.kind === 'raw_jpeg' && (
        <div className="flex items-start gap-2 text-[11px] text-amber-400/80 bg-amber-500/[0.06] rounded-md px-2.5 py-1.5">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          RAW files hold more editing latitude; the JPEG may already be an edited/finished export. Review both before deleting either.
        </div>
      )}
      {group.kind === 'similar' && (
        <div className="text-[11px] text-neutral-500">
          Visually similar — not confirmed identical. Review carefully; nothing here is auto-selected.
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(group.members.length, 5)}, minmax(0, 1fr))` }}>
        {group.members.map((m) => {
          const isSelected = selectedIds.has(m.photo.id)
          const disabled = m.photo.isOffline || (!isSelected && !canSelectMore)
          return (
            <MemberCard
              key={m.photo.id}
              member={m}
              drives={drives}
              selected={isSelected}
              disabled={disabled}
              onToggle={() => onToggleMember(m.photo.id, group.id)}
              onPreview={() => onPreview(m.photo)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview modal (lightweight — avoids entangling the main library viewer stack)
// ---------------------------------------------------------------------------

function PreviewModal({ photo, onClose }: { photo: Photo; onClose: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="max-w-[85vw] max-h-[85vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {photo.mediaType === 'video' ? (
          <video src={window.gx.fileUrl(photo.path)} controls autoPlay className="max-w-[85vw] max-h-[75vh] rounded-lg" />
        ) : (
          <img src={window.gx.previewUrl(photo.id)} alt={photo.filename} className="max-w-[85vw] max-h-[75vh] rounded-lg object-contain" />
        )}
        <div className="flex items-center gap-3 text-sm text-neutral-300">
          <span>{photo.filename}</span>
          <span className="text-neutral-500">{photo.path}</span>
          <button className="btn-ghost !p-1.5" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

function ConfirmDeleteModal({
  photos,
  drives,
  permanentAllowed,
  onCancel,
  onConfirm
}: {
  photos: Photo[]
  drives: Drive[]
  permanentAllowed: boolean
  onCancel: () => void
  onConfirm: (permanent: boolean) => void
}): JSX.Element {
  const [permanent, setPermanent] = useState(false)
  const totalBytes = photos.reduce((s, p) => s + p.sizeBytes, 0)
  const driveLabels = Array.from(new Set(photos.map((p) => drives.find((d) => d.id === p.driveId)?.label ?? p.driveId)))

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center animate-fade-in">
      <div className="panel w-[520px] max-h-[80vh] flex flex-col animate-scale-in">
        <div className="h-14 flex items-center px-5 border-b border-white/[0.06] flex-shrink-0">
          <AlertTriangle size={16} className="text-amber-400 mr-2" />
          <span className="text-sm font-semibold text-white flex-1">Confirm Deletion</span>
          <button className="btn-ghost !p-1.5" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <p className="text-sm text-neutral-300">
            {photos.length} file{photos.length === 1 ? '' : 's'} ({formatBytes(totalBytes)}) will be moved to{' '}
            {window.gx.platform === 'darwin' ? 'the Trash' : 'the Recycle Bin'}
            {permanent && permanentAllowed ? ', permanently, bypassing the Trash/Recycle Bin' : ''}.
          </p>
          <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>
              Files on external drives ({driveLabels.join(', ')}) will be affected. If a drive doesn't support the
              Trash/Recycle Bin, those files will be skipped with an error rather than deleted.
            </span>
          </div>
          {permanentAllowed && (
            <label className="flex items-center gap-2 text-xs text-red-400">
              <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
              Delete permanently instead (cannot be undone)
            </label>
          )}
          <div className="rounded-lg border border-white/[0.06] divide-y divide-white/[0.06] max-h-56 overflow-y-auto">
            {photos.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className="truncate flex-1 text-neutral-300">{p.path}</span>
                <span className="text-neutral-500 flex-shrink-0">{formatBytes(p.sizeBytes)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-white/[0.06] flex items-center justify-end gap-2 flex-shrink-0">
          <button className="btn-ghost !px-3 !py-1.5 border border-white/10" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-accent !bg-red-500 hover:!bg-red-600" onClick={() => onConfirm(permanent && permanentAllowed)}>
            <Trash2 size={14} /> Delete {photos.length} File{photos.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DuplicateCenter(): JSX.Element {
  const setActiveSection = useAppStore((s) => s.setActiveSection)
  const drives = useAppStore((s) => s.drives)
  const settings = useAppStore((s) => s.settings)
  const pushToast = useAppStore((s) => s.pushToast)

  const [stage, setStage] = useState<'setup' | 'scanning' | 'results'>('setup')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [progress, setProgress] = useState<DuplicateScanProgress | null>(null)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [tab, setTab] = useState<Tab>('exact')
  const [selection, setSelection] = useState<Map<string, string>>(new Map())
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refreshGroups = useCallback(async () => {
    const all = await window.gx.listDuplicateGroups()
    setGroups(all)
  }, [])

  useEffect(() => {
    return window.gx.onDuplicateScanProgress((p) => {
      setProgress(p)
      if (p.phase === 'done') {
        void refreshGroups().then(() => setStage('results'))
      } else if (p.phase === 'cancelled' || p.phase === 'error') {
        setStage('setup')
      }
    })
  }, [refreshGroups])

  const startScan = async (options: DuplicateScanOptions): Promise<void> => {
    setSelection(new Map())
    setStage('scanning')
    const id = await window.gx.startDuplicateScan(options)
    setSessionId(id)
  }

  const visibleGroups = useMemo(() => groupsForTab(groups, tab), [groups, tab])

  const summary = useMemo(() => {
    const counts: Record<Tab, { groups: number; files: number }> = {
      exact: { groups: 0, files: 0 },
      raw_jpeg: { groups: 0, files: 0 },
      similar: { groups: 0, files: 0 },
      burst: { groups: 0, files: 0 },
      video: { groups: 0, files: 0 },
      ignored: { groups: 0, files: 0 }
    }
    for (const g of groups) {
      const key: Tab = g.status !== 'pending' ? 'ignored' : g.kind
      counts[key].groups += 1
      counts[key].files += g.members.length
    }
    return counts
  }, [groups])

  const toggleMember = (photoId: string, groupId: string): void => {
    setSelection((prev) => {
      const next = new Map(prev)
      if (next.has(photoId)) next.delete(photoId)
      else next.set(photoId, groupId)
      return next
    })
  }

  const setStatus = async (groupId: string, status: DuplicateGroupStatus): Promise<void> => {
    await window.gx.setDuplicateGroupStatus(groupId, status)
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, status } : g)))
    setSelection((prev) => {
      const next = new Map(prev)
      for (const [photoId, gId] of prev) if (gId === groupId) next.delete(photoId)
      return next
    })
  }

  const selectedPhotos = useMemo(() => {
    const map = new Map<string, Photo>()
    for (const g of groups) for (const m of g.members) map.set(m.photo.id, m.photo)
    return Array.from(selection.keys())
      .map((id) => map.get(id))
      .filter((p): p is Photo => !!p)
  }, [groups, selection])

  const selectionStats = useMemo(() => {
    const bytes = selectedPhotos.reduce((s, p) => s + p.sizeBytes, 0)
    const driveCount = new Set(selectedPhotos.map((p) => p.driveId)).size
    const groupCount = new Set(selection.values()).size
    return { bytes, driveCount, groupCount, count: selectedPhotos.length }
  }, [selectedPhotos, selection])

  const bulkSelect = (predicate: (m: DuplicateMember, group: DuplicateGroup) => boolean): void => {
    setSelection((prev) => {
      const next = new Map(prev)
      for (const g of visibleGroups) {
        const keepCount = g.members.length - g.members.filter((m) => predicate(m, g)).length
        if (keepCount < 1) continue // never let a bulk action empty out an entire group
        for (const m of g.members) {
          if (m.photo.isOffline) continue
          if (predicate(m, g)) next.set(m.photo.id, g.id)
        }
      }
      return next
    })
  }

  const clearSelection = (): void => setSelection(new Map())

  const confirmDelete = async (permanent: boolean): Promise<void> => {
    setDeleting(true)
    try {
      const requests = Array.from(selection.entries()).map(([photoId, groupId]) => ({ photoId, groupId }))
      const outcomes = await window.gx.deleteDuplicates(requests, permanent)
      const succeeded = outcomes.filter((o) => o.success).length
      const failed = outcomes.length - succeeded
      pushToast(
        failed ? 'error' : 'info',
        failed ? `Deleted ${succeeded} file(s), ${failed} failed` : `Deleted ${succeeded} file(s)`
      )
      setConfirming(false)
      setSelection(new Map())
      await refreshGroups()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-base-bg">
      <div className="h-14 flex-shrink-0 flex items-center gap-3 px-4 border-b border-white/[0.06]">
        <Copy size={16} className="text-neutral-400" />
        <div className="text-[15px] font-semibold text-white">Check for Duplicates</div>
        <div className="flex-1" />
        {stage === 'results' && (
          <button className="btn-ghost text-xs !px-2.5 !py-1 border border-white/10" onClick={() => setStage('setup')}>
            <Search size={12} /> New Scan
          </button>
        )}
        <button className="btn-ghost !p-1.5" onClick={() => setActiveSection('library')} title="Close">
          <X size={16} />
        </button>
      </div>

      {stage === 'setup' && <ScanSetup drives={drives} onStart={(o) => void startScan(o)} />}

      {stage === 'scanning' && progress && (
        <ScanProgressView
          progress={progress}
          onPause={() => sessionId && void window.gx.pauseDuplicateScan(sessionId)}
          onResume={() => sessionId && void window.gx.resumeDuplicateScan(sessionId)}
          onCancel={() => sessionId && void window.gx.cancelDuplicateScan(sessionId)}
        />
      )}

      {stage === 'results' && (
        <>
          <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] overflow-x-auto flex-shrink-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors',
                  tab === t.key ? 'bg-accent/20 text-accent' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                )}
              >
                {t.label}
                <span className="ml-1.5 text-neutral-500 tabular-nums">
                  {summary[t.key].groups} / {summary[t.key].files}
                </span>
              </button>
            ))}
          </div>

          {visibleGroups.length > 0 && (
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.06] flex-shrink-0 overflow-x-auto">
              <span className="text-[11px] text-neutral-500 mr-1">Select:</span>
              <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => bulkSelect((m) => !m.suggestedKeep)}>
                Suggested
              </button>
              <button
                className="btn-ghost !text-[11px] !px-2 !py-1"
                onClick={() => bulkSelect((m, g) => g.members.indexOf(m) !== 0)}
              >
                All but one per group
              </button>
              <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => bulkSelect((m) => !isRawExtension(m.photo.extension))}>
                All JPEG
              </button>
              <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => bulkSelect((m) => isRawExtension(m.photo.extension))}>
                All RAW
              </button>
              <button className="btn-ghost !text-[11px] !px-2 !py-1" onClick={() => bulkSelect((m) => m.photo.isExport)}>
                All Exported
              </button>
              <button
                className="btn-ghost !text-[11px] !px-2 !py-1"
                onClick={() =>
                  bulkSelect((m, g) => {
                    const maxRes = Math.max(...g.members.map((mm) => (mm.photo.width ?? 0) * (mm.photo.height ?? 0)))
                    return (m.photo.width ?? 0) * (m.photo.height ?? 0) < maxRes
                  })
                }
              >
                All lower-resolution copies
              </button>
              {selection.size > 0 && (
                <button className="btn-ghost !text-[11px] !px-2 !py-1 text-neutral-500 ml-1" onClick={clearSelection}>
                  Clear selection
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {visibleGroups.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-neutral-500">
                {tab === 'ignored' ? 'No ignored groups.' : 'No duplicate files found in this category.'}
              </div>
            ) : (
              visibleGroups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  drives={drives}
                  selectedIds={new Set(selection.keys())}
                  onToggleMember={toggleMember}
                  onSetStatus={(groupId, status) => void setStatus(groupId, status)}
                  onPreview={setPreviewPhoto}
                />
              ))
            )}
          </div>

          {selection.size > 0 && (
            <div className="flex-shrink-0 border-t border-white/[0.06] bg-base-surface px-4 py-3 flex items-center gap-4">
              <div className="text-sm text-neutral-300">
                <span className="font-medium text-white">{selectionStats.count}</span> selected · reclaim{' '}
                <span className="text-emerald-400 font-medium">{formatBytes(selectionStats.bytes)}</span> · {selectionStats.driveCount} drive
                {selectionStats.driveCount === 1 ? '' : 's'} · {selectionStats.groupCount} group{selectionStats.groupCount === 1 ? '' : 's'}
              </div>
              <div className="flex-1" />
              <button className="btn-ghost !px-3 !py-1.5 border border-white/10" onClick={clearSelection}>
                Clear
              </button>
              <button className="btn-accent !bg-red-500 hover:!bg-red-600" onClick={() => setConfirming(true)}>
                <Trash2 size={14} /> Move to {window.gx.platform === 'darwin' ? 'Trash' : 'Recycle Bin'}
              </button>
            </div>
          )}
        </>
      )}

      {previewPhoto && <PreviewModal photo={previewPhoto} onClose={() => setPreviewPhoto(null)} />}
      {confirming && (
        <ConfirmDeleteModal
          photos={selectedPhotos}
          drives={drives}
          permanentAllowed={!!settings?.permanentDeleteEnabled}
          onCancel={() => setConfirming(false)}
          onConfirm={(permanent) => void confirmDelete(permanent)}
        />
      )}
      {deleting && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center">
          <div className="panel px-5 py-3 text-sm text-neutral-300">Deleting…</div>
        </div>
      )}
    </div>
  )
}
