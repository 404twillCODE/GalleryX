import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { Photo } from '../../../../shared/types'

interface Props {
  items: Photo[]
  activeIndex: number
  onSelect: (index: number) => void
}

const WINDOW = 40

export function Filmstrip({ items, activeIndex, onSelect }: Props): JSX.Element {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  const start = Math.max(0, activeIndex - WINDOW)
  const end = Math.min(items.length, activeIndex + WINDOW)
  const visible = items.slice(start, end)

  return (
    <div className="h-24 flex-shrink-0 border-t border-white/[0.06] bg-black/40 flex items-center gap-1.5 px-3 overflow-x-auto">
      {visible.map((photo, i) => {
        const realIndex = start + i
        const isActive = realIndex === activeIndex
        return (
          <button
            key={photo.id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSelect(realIndex)}
            className={clsx(
              'relative flex-shrink-0 h-16 w-16 rounded-md overflow-hidden transition-all',
              isActive ? 'ring-2 ring-accent scale-105' : 'ring-1 ring-white/10 opacity-70 hover:opacity-100'
            )}
          >
            {photo.thumbStatus === 'ready' ? (
              <img
                src={window.gx.thumbUrl(photo.id, photo.thumbStatus)}
                alt={photo.filename}
                draggable={false}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full skeleton" />
            )}
          </button>
        )
      })}
    </div>
  )
}
