import { useEffect, useState } from 'react'
import { Camera, Film, Folder, Heart, Info, MapPin, PanelRightClose, Star, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import type { Photo, WorkflowStatus } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import type { GalleryPhotosState } from '../../hooks/useGalleryPhotos'
import { basename, dirname, formatAperture, formatBytes, formatDate, formatDuration, formatFocalLength } from '../../lib/format'

const WORKFLOW_OPTIONS: { value: WorkflowStatus; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'edited', label: 'Edited' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' }
]

interface Props {
  gallery: GalleryPhotosState
}

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-500 flex-shrink-0">{label}</span>
      <span className="text-neutral-200 text-right truncate" title={typeof value === 'string' ? value : undefined}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export function MetadataPanel({ gallery }: Props): JSX.Element {
  const activePhotoId = useAppStore((s) => s.activePhotoId)
  const selectedIds = useAppStore((s) => s.selectedIds)
  const toggleMetadataPanel = useAppStore((s) => s.toggleMetadataPanel)
  const [photo, setPhoto] = useState<Photo | null>(null)

  useEffect(() => {
    if (!activePhotoId) {
      setPhoto(null)
      return
    }
    let mounted = true
    void window.gx.getPhoto(activePhotoId).then((p) => mounted && setPhoto(p))
    return () => {
      mounted = false
    }
  }, [activePhotoId])

  useEffect(() => {
    return window.gx.onThumbnailsReady(({ ids }) => {
      if (photo && ids.includes(photo.id)) setPhoto((p) => (p ? { ...p, thumbStatus: 'ready' } : p))
    })
  }, [photo])

  const toggleFavorite = async (): Promise<void> => {
    if (!photo) return
    const next = !photo.isFavorite
    setPhoto({ ...photo, isFavorite: next })
    gallery.updateOne(photo.id, { isFavorite: next })
    await window.gx.setFavorite(photo.id, next)
  }

  const setRating = async (rating: number): Promise<void> => {
    if (!photo) return
    const next = photo.rating === rating ? 0 : rating
    setPhoto({ ...photo, rating: next })
    gallery.updateOne(photo.id, { rating: next })
    await window.gx.setRating(photo.id, next)
  }

  const setWorkflow = async (status: WorkflowStatus): Promise<void> => {
    if (!photo) return
    setPhoto({ ...photo, workflowStatus: status })
    gallery.updateOne(photo.id, { workflowStatus: status })
    await window.gx.setWorkflowStatus(photo.id, status)
  }

  return (
    <div className="w-[320px] flex-shrink-0 h-full flex flex-col bg-base-surface border-l border-white/[0.06]">
      <div className="h-14 flex items-center px-4 border-b border-white/[0.06] flex-shrink-0">
        <span className="text-sm font-medium text-white flex items-center gap-2">
          <Info size={14} className="text-neutral-500" />
          Info
        </span>
        {selectedIds.length > 1 && (
          <span className="ml-2 text-xs text-neutral-500">({selectedIds.length} selected)</span>
        )}
        <div className="flex-1" />
        <button className="btn-ghost !p-1" onClick={toggleMetadataPanel} title="Hide panel">
          <PanelRightClose size={15} />
        </button>
      </div>

      {!photo ? (
        <div className="flex-1 flex items-center justify-center text-sm text-neutral-500 px-6 text-center">
          Select a photo to see its details
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="aspect-[4/3] bg-black/40 flex items-center justify-center overflow-hidden">
            {photo.thumbStatus === 'ready' ? (
              <img
                src={window.gx.thumbUrl(photo.id, photo.thumbStatus)}
                alt={photo.filename}
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="skeleton w-full h-full" />
            )}
          </div>

          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate flex items-center gap-1.5" title={photo.filename}>
                  {photo.mediaType === 'video' && <Film size={13} className="text-neutral-400 flex-shrink-0" />}
                  {photo.filename}
                </div>
                <div className="text-xs text-neutral-500 truncate" title={photo.folderPath}>
                  {basename(photo.folderPath)}
                </div>
              </div>
              <button
                onClick={toggleFavorite}
                className={clsx(
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors no-drag',
                  photo.isFavorite ? 'text-accent bg-accent/15' : 'text-neutral-400 hover:bg-white/[0.06]'
                )}
                title="Favorite (F)"
              >
                <Heart size={16} fill={photo.isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>

            {photo.isOffline && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 rounded-md px-2 py-1">
                <WifiOff size={12} />
                Drive offline — full resolution and edits unavailable until it's reconnected.
              </div>
            )}

            <div className="mt-2 flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className="text-neutral-500 hover:text-amber-400 no-drag" title={`Rate ${n} star${n > 1 ? 's' : ''}`}>
                  <Star size={14} className={photo.rating >= n ? 'text-amber-400' : ''} fill={photo.rating >= n ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>

            <select
              value={photo.workflowStatus}
              onChange={(e) => void setWorkflow(e.target.value as WorkflowStatus)}
              className="mt-2 w-full bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-xs text-neutral-300 no-drag"
            >
              {WORKFLOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Workflow: {o.label}
                </option>
              ))}
            </select>

            <button
              className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-accent no-drag"
              onClick={() => window.gx.revealInFinder(photo.path)}
            >
              <Folder size={12} />
              Show in Folder
            </button>
          </div>

          <div className="px-4 py-3 border-b border-white/[0.06] space-y-0.5">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">File</div>
            <Row label="Full path" value={photo.path} />
            <Row label="Folder" value={dirname(photo.path)} />
            <Row label="Extension" value={photo.extension.toUpperCase()} />
            <Row label="Size" value={formatBytes(photo.sizeBytes)} />
            <Row label="Dimensions" value={photo.width && photo.height ? `${photo.width} × ${photo.height}` : '—'} />
          </div>

          <div className="px-4 py-3 border-b border-white/[0.06] space-y-0.5">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">Dates</div>
            <Row label="Date Taken" value={formatDate(photo.dateTaken)} />
            <Row label="Date Created" value={formatDate(photo.dateCreated)} />
            <Row label="Date Modified" value={formatDate(photo.dateModified)} />
          </div>

          {photo.mediaType === 'video' ? (
            <div className="px-4 py-3 border-b border-white/[0.06] space-y-0.5">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1 flex items-center gap-1.5">
                <Film size={11} /> Video
              </div>
              <Row label="Duration" value={formatDuration(photo.durationMs)} />
              <Row label="Container" value={photo.container?.split(',')[0]} />
              <Row label="Video Codec" value={photo.videoCodec?.toUpperCase()} />
              <Row label="Audio Codec" value={photo.audioCodec?.toUpperCase() ?? 'None'} />
              <Row label="Frame Rate" value={photo.frameRate ? `${photo.frameRate.toFixed(2)} fps` : '—'} />
              <Row label="Bitrate" value={photo.bitrate ? `${Math.round(photo.bitrate / 1000)} kbps` : '—'} />
              {!photo.codecSupported && <Row label="Playback" value="Unsupported codec" />}
            </div>
          ) : (
            <div className="px-4 py-3 border-b border-white/[0.06] space-y-0.5">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1 flex items-center gap-1.5">
                <Camera size={11} /> Camera
              </div>
              <Row label="Camera" value={[photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ') || '—'} />
              <Row label="Lens" value={photo.lens} />
              <Row label="ISO" value={photo.iso ?? '—'} />
              <Row label="Shutter" value={photo.shutterSpeed} />
              <Row label="Aperture" value={formatAperture(photo.aperture)} />
              <Row label="Focal Length" value={formatFocalLength(photo.focalLength)} />
            </div>
          )}

          <div className="px-4 py-3 border-b border-white/[0.06] space-y-0.5">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1 flex items-center gap-1.5">
              <MapPin size={11} /> Location & Color
            </div>
            <Row
              label="GPS"
              value={photo.gpsLat != null && photo.gpsLon != null ? `${photo.gpsLat.toFixed(5)}, ${photo.gpsLon.toFixed(5)}` : '—'}
            />
            <Row label="Color Profile" value={photo.colorProfile} />
            <Row label="Orientation" value={photo.orientation ?? '—'} />
          </div>

          <div className="px-4 py-3 flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
            {photo.isExport && (
              <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                Exported{photo.exportFolderName ? ` · ${photo.exportFolderName}` : ''}
              </span>
            )}
            {photo.isRaw && <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300">RAW</span>}
          </div>
        </div>
      )}
    </div>
  )
}
