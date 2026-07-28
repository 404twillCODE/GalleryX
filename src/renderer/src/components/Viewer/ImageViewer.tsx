import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Heart, Info, Maximize, Minimize, X } from 'lucide-react'
import clsx from 'clsx'
import type { Photo } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import { Filmstrip } from './Filmstrip'
import { basename, formatAperture, formatDate, formatFocalLength } from '../../lib/format'

interface Props {
  items: Photo[]
}

export function ImageViewer({ items }: Props): JSX.Element | null {
  const activePhotoId = useAppStore((s) => s.activePhotoId)
  const setActivePhoto = useAppStore((s) => s.setActivePhoto)
  const setSelection = useAppStore((s) => s.setSelection)
  const closeViewer = useAppStore((s) => s.closeViewer)

  const index = useMemo(() => items.findIndex((p) => p.id === activePhotoId), [items, activePhotoId])
  const photo = index >= 0 ? items[index] : null

  const [zoomFactor, setZoomFactor] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [mode, setMode] = useState<'fit' | 'actual'>('fit')
  const [showMetadata, setShowMetadata] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const goTo = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(items.length - 1, newIndex))
      const id = items[clamped]?.id
      if (!id) return
      setActivePhoto(id)
      setSelection([id], id)
      setZoomFactor(1)
      setPan({ x: 0, y: 0 })
      setMode('fit')
      setLoaded(false)
    },
    [items, setActivePhoto, setSelection]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goTo(index + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, goTo])

  const handleWheel = useCallback((e: React.WheelEvent): void => {
    e.preventDefault()
    const delta = -e.deltaY * 0.002
    setZoomFactor((z) => Math.min(8, Math.max(0.5, z * (1 + delta))))
    setMode('fit')
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    },
    [pan]
  )
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy })
  }, [])
  const handleMouseUp = useCallback(() => {
    dragState.current = null
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void containerRef.current?.requestFullscreen()
      setFullscreen(true)
    } else {
      void document.exitFullscreen()
      setFullscreen(false)
    }
  }, [])

  const toggleFavorite = useCallback(async () => {
    if (!photo) return
    await window.gx.setFavorite(photo.id, !photo.isFavorite)
  }, [photo])

  if (!photo) return null

  const scale = mode === 'actual' ? zoomFactor * 1.5 : zoomFactor

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="h-14 flex items-center px-4 gap-3 text-neutral-300 flex-shrink-0">
        <button className="btn-ghost !p-1.5" onClick={closeViewer} title="Close (Esc)">
          <X size={18} />
        </button>
        <div className="text-sm truncate max-w-md">{photo.filename}</div>
        <span className="text-xs text-neutral-500 tabular-nums">
          {index + 1} / {items.length}
        </span>
        <div className="flex-1" />
        <button
          className={clsx('btn-ghost !p-1.5', photo.isFavorite && 'text-accent')}
          onClick={toggleFavorite}
          title="Favorite (F)"
        >
          <Heart size={17} fill={photo.isFavorite ? 'currentColor' : 'none'} />
        </button>
        <button
          className={clsx('btn-ghost !p-1.5', showMetadata && 'text-accent')}
          onClick={() => setShowMetadata((v) => !v)}
          title="Toggle metadata overlay"
        >
          <Info size={17} />
        </button>
        <button
          className="btn-ghost !p-1.5"
          onClick={() => {
            setMode('fit')
            setZoomFactor(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          Fit
        </button>
        <button
          className="btn-ghost !p-1.5"
          onClick={() => {
            setMode('actual')
            setZoomFactor(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          100%
        </button>
        <button className="btn-ghost !p-1.5" onClick={toggleFullscreen} title="Fullscreen">
          {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
      </div>

      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        {!loaded && <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">Loading full preview…</div>}
        <img
          key={photo.id}
          src={window.gx.previewUrl(photo.id)}
          alt={photo.filename}
          draggable={false}
          onLoad={() => setLoaded(true)}
          className="max-w-none select-none transition-opacity duration-150"
          style={{
            opacity: loaded ? 1 : 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            maxWidth: mode === 'fit' ? '92vw' : 'none',
            maxHeight: mode === 'fit' ? '78vh' : 'none',
            objectFit: 'contain'
          }}
        />

        {showMetadata && (
          <div className="absolute bottom-4 left-4 panel px-4 py-3 text-xs text-neutral-300 space-y-0.5 animate-fade-in">
            <div className="font-medium text-white text-sm">{basename(photo.path)}</div>
            <div>{formatDate(photo.dateTaken)}</div>
            <div>
              {[photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ')}
              {photo.lens ? ` · ${photo.lens}` : ''}
            </div>
            <div>
              {photo.iso ? `ISO ${photo.iso}` : ''} {photo.shutterSpeed ?? ''} {formatAperture(photo.aperture)}{' '}
              {formatFocalLength(photo.focalLength)}
            </div>
            <div>
              {photo.width && photo.height ? `${photo.width} × ${photo.height}` : ''}
            </div>
          </div>
        )}
      </div>

      <Filmstrip items={items} activeIndex={index} onSelect={goTo} />
    </div>
  )
}
