import { useState } from 'react'
import { Heart, ImageOff } from 'lucide-react'
import clsx from 'clsx'
import type { Photo } from '../../../../shared/types'

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

  return (
    <div
      id={`photo-tile-${photo.id}`}
      onMouseDown={(e) => onSelect(e)}
      onDoubleClick={onOpen}
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
            loaded ? 'opacity-100' : 'opacity-0'
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

      {photo.isFavorite && (
        <div className="absolute top-1.5 right-1.5 text-accent drop-shadow">
          <Heart size={14} fill="currentColor" />
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
