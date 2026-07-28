import { useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ, ChevronDown } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { SortField } from '../../../../shared/types'

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'dateTaken', label: 'Date Taken' },
  { field: 'dateModified', label: 'Date Modified' },
  { field: 'dateCreated', label: 'Date Created' },
  { field: 'filename', label: 'Filename' },
  { field: 'sizeBytes', label: 'File Size' },
  { field: 'width', label: 'Image Width' },
  { field: 'height', label: 'Image Height' },
  { field: 'cameraModel', label: 'Camera' },
  { field: 'lens', label: 'Lens' }
]

export function SortMenu(): JSX.Element {
  const sortField = useAppStore((s) => s.sortField)
  const sortDirection = useAppStore((s) => s.sortDirection)
  const setSort = useAppStore((s) => s.setSort)
  const [open, setOpen] = useState(false)

  const currentLabel = SORT_OPTIONS.find((o) => o.field === sortField)?.label ?? 'Sort'

  return (
    <div className="relative no-drag">
      <button
        className="btn-ghost flex items-center gap-1.5 !px-2.5"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      >
        {sortDirection === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownAZ size={14} />}
        {currentLabel}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 panel py-1 w-48 animate-scale-in">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.field}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/[0.06] flex items-center justify-between"
              onClick={() => {
                setSort(opt.field, sortField === opt.field && sortDirection === 'asc' ? 'desc' : 'asc')
                setOpen(false)
              }}
            >
              {opt.label}
              {sortField === opt.field && (sortDirection === 'asc' ? <ArrowUpAZ size={13} /> : <ArrowDownAZ size={13} />)}
            </button>
          ))}
          <div className="border-t border-white/[0.06] mt-1 pt-1">
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/[0.06] text-neutral-400"
              onClick={() => {
                setSort(sortField, sortDirection === 'asc' ? 'desc' : 'asc')
                setOpen(false)
              }}
            >
              Reverse order
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
