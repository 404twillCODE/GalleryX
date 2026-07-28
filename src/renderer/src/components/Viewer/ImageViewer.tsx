import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Heart, Info, Maximize, Minimize, WifiOff, X, ZoomIn, ZoomOut } from 'lucide-react'
import clsx from 'clsx'
import type { Photo } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import { Filmstrip } from './Filmstrip'
import { basename, formatAperture, formatDate, formatFocalLength } from '../../lib/format'

interface Props {
  items: Photo[]
}

// The viewer is a full-window overlay, so it sits directly under macOS's native traffic-light
// buttons too — same reservation as the Sidebar header.
const isMac = window.gx.platform === 'darwin'

// `scale` is always absolute: 1 = the image shown at its true native pixel size ("100%").
// `fitScale` (derived) is whatever multiplier makes the whole image fit inside the viewer.
const MIN_SCALE = 0.05
const MAX_SCALE = 8
const ZOOM_STEP = 1.35
const DOUBLE_CLICK_ZOOM = 2.5

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function ImageViewer({ items }: Props): JSX.Element | null {
  const activePhotoId = useAppStore((s) => s.activePhotoId)
  const setActivePhoto = useAppStore((s) => s.setActivePhoto)
  const setSelection = useAppStore((s) => s.setSelection)
  const closeViewer = useAppStore((s) => s.closeViewer)

  const index = useMemo(() => items.findIndex((p) => p.id === activePhotoId), [items, activePhotoId])
  const photo = index >= 0 ? items[index] : null

  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [showMetadata, setShowMetadata] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const imageAreaRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const fitScale = useMemo(() => {
    if (!natural.w || !natural.h || !containerSize.w || !containerSize.h) return 1
    return Math.min(containerSize.w / natural.w, containerSize.h / natural.h)
  }, [natural, containerSize])

  // Track the image-area's real size so "fit" always reflects the current window size.
  useEffect(() => {
    const el = imageAreaRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const clampPan = useCallback(
    (next: { x: number; y: number }, s: number): { x: number; y: number } => {
      const overX = Math.max(0, natural.w * s - containerSize.w) / 2
      const overY = Math.max(0, natural.h * s - containerSize.h) / 2
      return { x: clamp(next.x, -overX, overX), y: clamp(next.y, -overY, overY) }
    },
    [natural, containerSize]
  )

  const goTo = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(items.length - 1, newIndex))
      const id = items[clamped]?.id
      if (!id) return
      setActivePhoto(id)
      setSelection([id], id)
      setNatural({ w: 0, h: 0 })
      setPan({ x: 0, y: 0 })
      setScale(1)
      setLoaded(false)
    },
    [items, setActivePhoto, setSelection]
  )

  /** Zooms by `factor`, keeping the point under (anchorX, anchorY) — in viewport coordinates —
   *  visually stationary. Falls back to zooming around the image's own center when no anchor is
   *  given (buttons, keyboard shortcuts). */
  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      const el = imageAreaRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = anchor?.x ?? rect.left + rect.width / 2
      const cy = anchor?.y ?? rect.top + rect.height / 2
      const dx = cx - (rect.left + rect.width / 2)
      const dy = cy - (rect.top + rect.height / 2)

      setScale((oldScale) => {
        const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE)
        const k = newScale / oldScale
        setPan((oldPan) => clampPan({ x: dx * (1 - k) + oldPan.x * k, y: dy * (1 - k) + oldPan.y * k }, newScale))
        return newScale
      })
    },
    [clampPan]
  )

  const zoomTo = useCallback(
    (newScale: number, anchor?: { x: number; y: number }) => {
      if (scale <= 0) return
      zoomBy(newScale / scale, anchor)
    },
    [scale, zoomBy]
  )

  const resetToFit = useCallback(() => {
    setScale(fitScale)
    setPan({ x: 0, y: 0 })
  }, [fitScale])

  // The first time a photo's natural size + container size are both known, snap to "fit".
  const fittedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!photo || !loaded || !fitScale || fittedForRef.current === photo.id) return
    fittedForRef.current = photo.id
    setScale(fitScale)
    setPan({ x: 0, y: 0 })
  }, [photo, loaded, fitScale])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goTo(index + 1)
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomBy(ZOOM_STEP)
        return
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomBy(1 / ZOOM_STEP)
        return
      }
      if (e.key === '0') {
        e.preventDefault()
        resetToFit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, goTo, zoomBy, resetToFit])

  const handleWheel = useCallback(
    (e: React.WheelEvent): void => {
      e.preventDefault()
      // Trackpad pinch-to-zoom is reported by the browser as a wheel event with ctrlKey set;
      // plain scroll wheel/trackpad-swipe zoom uses a gentler multiplier.
      const intensity = e.ctrlKey ? 0.01 : 0.0025
      const factor = Math.exp(-e.deltaY * intensity)
      zoomBy(factor, { x: e.clientX, y: e.clientY })
    },
    [zoomBy]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (scale > fitScale * 1.1) {
        resetToFit()
      } else {
        zoomTo(Math.max(1, fitScale * DOUBLE_CLICK_ZOOM), { x: e.clientX, y: e.clientY })
      }
    },
    [scale, fitScale, resetToFit, zoomTo]
  )

  // Tracks whether the current mousedown→mouseup gesture actually dragged the image, so a
  // background click that happens to end a (non-)drag isn't mistaken for a request to close.
  const draggedRef = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      draggedRef.current = false
      dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    },
    [pan]
  )
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState.current) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true
      setPan(clampPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy }, scale))
    },
    [scale, clampPan]
  )
  const handleMouseUp = useCallback(() => {
    dragState.current = null
  }, [])

  // Clicking the empty backdrop around the photo (not the photo itself, not the metadata
  // card) closes the viewer — mirrors the click-outside-to-dismiss pattern of a lightbox.
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (draggedRef.current) return
      if (e.target === e.currentTarget) closeViewer()
    },
    [closeViewer]
  )

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

  const zoomPercent = Math.round(scale * 100)
  const isZoomedIn = scale > fitScale * 1.02
  const canZoomOut = scale > MIN_SCALE * 1.02

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {isMac && <div className="h-6 flex-shrink-0" />}
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

        <div className="flex items-center gap-0.5 ml-1">
          <button
            className="btn-ghost !p-1.5"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={!canZoomOut}
            title="Zoom out (-)"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="text-xs text-neutral-400 tabular-nums w-11 text-center hover:text-white transition-colors"
            onClick={resetToFit}
            title="Reset to fit (0)"
          >
            {zoomPercent}%
          </button>
          <button className="btn-ghost !p-1.5" onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in (+)">
            <ZoomIn size={16} />
          </button>
        </div>

        <button
          className={clsx('btn-ghost !p-1.5 text-xs px-2', !isZoomedIn && 'text-accent')}
          onClick={resetToFit}
        >
          Fit
        </button>
        <button
          className={clsx('btn-ghost !p-1.5 text-xs px-2', Math.abs(scale - 1) < 0.01 && 'text-accent')}
          onClick={() => zoomTo(1)}
        >
          100%
        </button>
        <button className="btn-ghost !p-1.5" onClick={toggleFullscreen} title="Fullscreen">
          {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
      </div>

      <div
        ref={imageAreaRef}
        className={clsx(
          'flex-1 relative overflow-hidden flex items-center justify-center',
          isZoomedIn ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onClick={handleBackgroundClick}
        onDoubleClick={handleDoubleClick}
      >
        {photo.isOffline ? (
          <div className="flex flex-col items-center gap-2 text-neutral-400">
            <WifiOff size={32} />
            <div className="text-sm">This photo's drive is offline.</div>
            <div className="text-xs text-neutral-600">The cached thumbnail is shown in the grid; reconnect the drive for full resolution.</div>
          </div>
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
                Loading full preview…
              </div>
            )}
            <img
              key={photo.id}
              src={window.gx.previewUrl(photo.id)}
              alt={photo.filename}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget
                setNatural({ w: img.naturalWidth, h: img.naturalHeight })
                setLoaded(true)
              }}
              className="max-w-none select-none"
              style={{
                opacity: loaded ? 1 : 0,
                width: natural.w || undefined,
                height: natural.h || undefined,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transition: 'opacity 150ms'
              }}
            />
          </>
        )}

        {showMetadata && !photo.isOffline && (
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
            <div>{photo.width && photo.height ? `${photo.width} × ${photo.height}` : ''}</div>
          </div>
        )}
      </div>

      <Filmstrip items={items} activeIndex={index} onSelect={goTo} />
    </div>
  )
}
