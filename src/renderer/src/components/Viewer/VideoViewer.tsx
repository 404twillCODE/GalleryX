import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Heart,
  Info,
  Maximize,
  Minimize,
  PictureInPicture2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  WifiOff,
  X
} from 'lucide-react'
import clsx from 'clsx'
import type { Photo } from '../../../../shared/types'
import { useAppStore } from '../../store/useAppStore'
import { Filmstrip } from './Filmstrip'
import { basename, formatDate, formatDuration } from '../../lib/format'

interface Props {
  items: Photo[]
}

const isMac = window.gx.platform === 'darwin'
const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2]
const FRAME_STEP_SEC = 1 / 30

export function VideoViewer({ items }: Props): JSX.Element | null {
  const activePhotoId = useAppStore((s) => s.activePhotoId)
  const setActivePhoto = useAppStore((s) => s.setActivePhoto)
  const setSelection = useAppStore((s) => s.setSelection)
  const closeViewer = useAppStore((s) => s.closeViewer)

  const index = useMemo(() => items.findIndex((p) => p.id === activePhotoId), [items, activePhotoId])
  const photo = index >= 0 ? items[index] : null

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [showMetadata, setShowMetadata] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const goTo = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(items.length - 1, newIndex))
      const id = items[clamped]?.id
      if (!id) return
      setActivePhoto(id)
      setSelection([id], id)
      setPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      setLoadError(false)
    },
    [items, setActivePhoto, setSelection]
  )

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }, [])

  const seekBy = useCallback((deltaSec: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + deltaSec))
  }, [])

  const stepFrame = useCallback(
    (dir: 1 | -1) => {
      const v = videoRef.current
      if (!v) return
      v.pause()
      v.currentTime = Math.max(0, v.currentTime + dir * FRAME_STEP_SEC)
    },
    []
  )

  const setVolumeClamped = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolume(clamped)
    if (videoRef.current) videoRef.current.volume = clamped
    if (clamped > 0 && muted) setMuted(false)
  }, [muted])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m
      return !m
    })
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

  const togglePip = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {
      /* PiP unsupported on this platform/build — silently ignore */
    }
  }, [])

  const toggleFavorite = useCallback(async () => {
    if (!photo) return
    await window.gx.setFavorite(photo.id, !photo.isFavorite)
  }, [photo])

  // Context-sensitive keyboard handling — Space/arrows control playback while this viewer is
  // open; Shift+Left/Right switch videos instead of seeking, avoiding the "favorite (F) vs
  // fullscreen (F)" clash called out in the spec by giving fullscreen sole ownership of F here.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
        return
      }
      if (e.key === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault()
        goTo(index - 1)
        return
      }
      if (e.key === 'ArrowRight' && e.shiftKey) {
        e.preventDefault()
        goTo(index + 1)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        seekBy(-5)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        seekBy(5)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setVolumeClamped(volume + 0.1)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setVolumeClamped(volume - 0.1)
        return
      }
      if (e.key.toLowerCase() === 'm') {
        toggleMute()
        return
      }
      if (e.key.toLowerCase() === 'f') {
        toggleFullscreen()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, goTo, togglePlay, seekBy, volume, setVolumeClamped, toggleMute, toggleFullscreen])

  if (!photo) return null

  const unsupported = !photo.codecSupported
  const offline = photo.isOffline
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-fade-in select-none">
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
          title="Favorite"
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
        <button className="btn-ghost !p-1.5" onClick={togglePip} title="Picture in picture">
          <PictureInPicture2 size={16} />
        </button>
        <button className="btn-ghost !p-1.5" onClick={toggleFullscreen} title="Fullscreen (F)">
          {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {offline ? (
          <div className="flex flex-col items-center gap-2 text-neutral-400">
            <WifiOff size={32} />
            <div className="text-sm">This video's drive is offline.</div>
            <div className="text-xs text-neutral-600">Reconnect the drive to play it back.</div>
          </div>
        ) : unsupported ? (
          <div className="flex flex-col items-center gap-2 text-neutral-400 max-w-sm text-center">
            <AlertTriangle size={32} className="text-amber-400" />
            <div className="text-sm">Unsupported codec{photo.videoCodec ? ` (${photo.videoCodec})` : ''}</div>
            <div className="text-xs text-neutral-600">
              GalleryX indexed this file, but the built-in player can&apos;t decode it. Try an external player, or
              re-encode to H.264/VP9 for in-app playback.
            </div>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 text-neutral-400 max-w-sm text-center">
            <AlertTriangle size={32} />
            <div className="text-sm">Could not play this video.</div>
            <div className="text-xs text-neutral-600">
              {photo.videoCodec === 'hevc'
                ? 'This system may not have hardware HEVC (H.265) decoding available. The file is fully indexed and its thumbnail is still shown in the grid.'
                : "GalleryX indexed this file, but playback failed. It may be corrupt, or use a feature the built-in player can't handle."}
            </div>
          </div>
        ) : (
          <video
            key={photo.id}
            ref={videoRef}
            src={window.gx.fileUrl(photo.path)}
            className="max-w-full max-h-full"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setLoadError(true)}
            onClick={togglePlay}
          />
        )}

        {showMetadata && !offline && !unsupported && (
          <div className="absolute bottom-20 left-4 panel px-4 py-3 text-xs text-neutral-300 space-y-0.5 animate-fade-in pointer-events-none">
            <div className="font-medium text-white text-sm">{basename(photo.path)}</div>
            <div>{formatDate(photo.dateTaken)}</div>
            <div>
              {photo.container ? `${photo.container.split(',')[0]} · ` : ''}
              {photo.videoCodec?.toUpperCase()} {photo.audioCodec ? `+ ${photo.audioCodec.toUpperCase()}` : ''}
            </div>
            <div>
              {photo.width && photo.height ? `${photo.width} × ${photo.height}` : ''}
              {photo.frameRate ? ` · ${photo.frameRate.toFixed(2)} fps` : ''}
            </div>
          </div>
        )}
      </div>

      {!offline && !unsupported && !loadError && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div
            className="relative h-1.5 rounded-full bg-white/10 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              if (videoRef.current) videoRef.current.currentTime = pct * (duration || 0)
            }}
          >
            <div className="absolute inset-y-0 left-0 bg-accent rounded-full" style={{ width: `${progressPct}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-3 mt-2 text-neutral-300">
            <button className="btn-ghost !p-1.5" onClick={() => goTo(index - 1)} title="Previous video (Shift+←)">
              <SkipBack size={15} />
            </button>
            <button className="btn-ghost !p-2" onClick={togglePlay} title="Play/Pause (Space)">
              {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
            </button>
            <button className="btn-ghost !p-1.5" onClick={() => goTo(index + 1)} title="Next video (Shift+→)">
              <SkipForward size={15} />
            </button>
            <button className="btn-ghost !p-1.5" onClick={() => stepFrame(-1)} title="Previous frame (when paused)">
              ⏮
            </button>
            <button className="btn-ghost !p-1.5" onClick={() => stepFrame(1)} title="Next frame (when paused)">
              ⏭
            </button>

            <span className="text-xs tabular-nums text-neutral-500 w-24">
              {formatDuration(currentTime * 1000)} / {formatDuration(duration * 1000)}
            </span>

            <div className="flex items-center gap-1.5">
              <button className="btn-ghost !p-1.5" onClick={toggleMute} title="Mute (M)">
                {muted || volume === 0 ? <VolumeX size={15} /> : volume < 0.5 ? <Volume1 size={15} /> : <Volume2 size={15} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => setVolumeClamped(Number(e.target.value))}
                className="w-16 accent-accent"
              />
            </div>

            <div className="flex-1" />

            <select
              value={speed}
              onChange={(e) => {
                const s = Number(e.target.value)
                setSpeed(s)
                if (videoRef.current) videoRef.current.playbackRate = s
              }}
              className="bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-xs text-neutral-300"
              title="Playback speed"
            >
              {PLAYBACK_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <Filmstrip items={items} activeIndex={index} onSelect={goTo} />
    </div>
  )
}
