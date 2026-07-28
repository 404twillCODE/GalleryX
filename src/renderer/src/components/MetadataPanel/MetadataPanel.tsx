import { useEffect, useState } from 'react'
import { Camera, Folder, Heart, Info, MapPin, PanelRightClose } from 'lucide-react'
import clsx from 'clsx'
import type { Photo } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import type { GalleryPhotosState } from '../../hooks/useGalleryPhotos'
import { basename, dirname, formatAperture, formatBytes, formatDate, formatFocalLength } from '../../lib/format'

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
                <div className="text-sm font-medium text-white truncate" title={photo.filename}>
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
            <button
              className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-accent no-drag"
              onClick={() => window.gx.revealInFinder(photo.path)}
            >
              <Folder size={12} />
              Reveal in file browser
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

          <div className="px-4 py-3 flex items-center gap-2 text-xs text-neutral-500">
            {photo.isExport && (
              <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent">Export</span>
            )}
            {photo.isRaw && <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300">RAW</span>}
          </div>
        </div>
      )}
    </div>
  )
}
