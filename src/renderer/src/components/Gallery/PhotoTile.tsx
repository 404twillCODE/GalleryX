import { useState } from 'react'
import { Heart, ImageOff, Play, Upload, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import type { Photo } from '../../../../shared/types'
import { formatDuration } from '../../lib/format'

interface Props {
  photo: Photo
  width: number
  height: number
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onOpen: () => void
}

export function PhotoTile({ photo, width, height, selected, onSelect, onOpen }: Props): JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const ready = photo.thumbStatus === 'ready'
  const isVideo = photo.mediaType === 'video'

  return (
    <div
      id={`photo-tile-${photo.id}`}
      onMouseDown={(e) => onSelect(e)}
      onDoubleClick={(e) => {
        // A single click only selects (handled on mousedown above); a double-click is required
        // to jump into the full-screen viewer. Shift/cmd/ctrl-double-click still just extends
        // the selection rather than opening, so range/multi-select stays predictable.
        if (e.shiftKey || e.metaKey || e.ctrlKey) return
        onOpen()
      }}
      className={clsx(
        'relative flex-shrink-0 rounded-lg overflow-hidden cursor-pointer group bg-base-raised transition-all duration-150',
        selected ? 'ring-2 ring-accent shadow-floating' : 'ring-1 ring-white/[0.04] hover:ring-white/20'
      )}
      style={{ width, height }}
    >
      {ready && !errored ? (
        <img
          src={window.gx.thumbUrl(photo.id, photo.thumbStatus)}
          alt={photo.filename}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={clsx(
            'w-full h-full object-cover select-none transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0',
            photo.isOffline && 'grayscale-[40%] opacity-70'
          )}
        />
      ) : null}

      {(!ready || !loaded || errored) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {errored || photo.thumbStatus === 'failed' ? (
            <ImageOff size={Math.min(28, width / 4)} className="text-neutral-600" />
          ) : (
            <div className="skeleton absolute inset-0" />
          )}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" />

      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-9 h-9 rounded-full bg-black/45 flex items-center justify-center backdrop-blur-sm opacity-90 group-hover:scale-110 transition-transform">
            <Play size={16} className="text-white fill-white ml-0.5" />
          </div>
        </div>
      )}

      {isVideo && photo.durationMs != null && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium text-white tabular-nums">
          {formatDuration(photo.durationMs)}
        </div>
      )}

      {photo.isOffline && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-medium text-amber-300">
          <WifiOff size={10} />
          Offline
        </div>
      )}

      {photo.isFavorite && (
        <div className="absolute top-1.5 right-1.5 text-accent drop-shadow">
          <Heart size={14} fill="currentColor" />
        </div>
      )}

      {photo.isExport && !photo.isFavorite && (
        <div className="absolute top-1.5 right-1.5 text-white/70 drop-shadow">
          <Upload size={13} />
        </div>
      )}

      {photo.isRaw && (
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/50 text-[10px] font-medium text-white/80 uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
          {photo.extension}
        </div>
      )}

      <div className="absolute bottom-1.5 right-1.5 max-w-[80%] truncate px-1.5 py-0.5 rounded bg-black/50 text-[10px] text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
        {photo.filename}
      </div>
    </div>
  )
}
