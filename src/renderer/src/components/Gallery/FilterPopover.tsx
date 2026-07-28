import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../../store/useAppStore'
import type { AspectFilter, FormatFilter } from '../../../../shared/types'

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1 rounded-full text-xs border transition-colors',
        active
          ? 'bg-accent/20 border-accent/40 text-accent'
          : 'border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
      )}
    >
      {children}
    </button>
  )
}

export function FilterPopover(): JSX.Element {
  const filters = useAppStore((s) => s.filters)
  const setFilters = useAppStore((s) => s.setFilters)
  const resetFilters = useAppStore((s) => s.resetFilters)
  const [open, setOpen] = useState(false)
  const [facets, setFacets] = useState<{ cameraModels: string[]; lensModels: string[] }>({
    cameraModels: [],
    lensModels: []
  })

  useEffect(() => {
    if (open) void window.gx.getFacets().then(setFacets)
  }, [open])

  const activeCount =
    (filters.favoritesOnly ? 1 : 0) +
    (filters.exportsOnly ? 1 : 0) +
    (filters.format !== 'any' ? 1 : 0) +
    (filters.aspect !== 'any' ? 1 : 0) +
    (filters.cameraModel ? 1 : 0) +
    (filters.lensModel ? 1 : 0) +
    (filters.isoMin != null || filters.isoMax != null ? 1 : 0) +
    (filters.focalMin != null || filters.focalMax != null ? 1 : 0) +
    (filters.recentDays != null ? 1 : 0)

  const formatOptions: { value: FormatFilter; label: string }[] = [
    { value: 'any', label: 'All formats' },
    { value: 'raw', label: 'RAW Only' },
    { value: 'jpeg', label: 'JPEG Only' },
    { value: 'png', label: 'PNG Only' }
  ]
  const aspectOptions: { value: AspectFilter; label: string }[] = [
    { value: 'any', label: 'Any' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'landscape', label: 'Landscape' },
    { value: 'square', label: 'Square' }
  ]

  return (
    <div className="relative no-drag">
      <button
        className={clsx('btn-ghost flex items-center gap-1.5 !px-2.5', activeCount > 0 && 'text-accent')}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal size={14} />
        Filters
        {activeCount > 0 && (
          <span className="text-[10px] bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-30 panel p-4 w-80 space-y-4 animate-scale-in max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Filters</span>
              <button className="text-xs text-neutral-500 hover:text-accent" onClick={resetFilters}>
                Reset all
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Chip active={filters.favoritesOnly} onClick={() => setFilters({ favoritesOnly: !filters.favoritesOnly })}>
                Favorites
              </Chip>
              <Chip active={filters.exportsOnly} onClick={() => setFilters({ exportsOnly: !filters.exportsOnly })}>
                Exports
              </Chip>
              <Chip
                active={filters.recentDays != null}
                onClick={() => setFilters({ recentDays: filters.recentDays != null ? null : 7 })}
              >
                Recently Added
              </Chip>
            </div>

            <div>
              <div className="text-xs text-neutral-500 mb-1.5">Format</div>
              <div className="flex flex-wrap gap-1.5">
                {formatOptions.map((o) => (
                  <Chip key={o.value} active={filters.format === o.value} onClick={() => setFilters({ format: o.value })}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-500 mb-1.5">Orientation</div>
              <div className="flex flex-wrap gap-1.5">
                {aspectOptions.map((o) => (
                  <Chip key={o.value} active={filters.aspect === o.value} onClick={() => setFilters({ aspect: o.value })}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-500 mb-1.5">Camera Model</div>
              <select
                className="w-full bg-base-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm text-neutral-200"
                value={filters.cameraModel ?? ''}
                onChange={(e) => setFilters({ cameraModel: e.target.value || null })}
              >
                <option value="">Any camera</option>
                {facets.cameraModels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-neutral-500 mb-1.5">Lens Model</div>
              <select
                className="w-full bg-base-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm text-neutral-200"
                value={filters.lensModel ?? ''}
                onChange={(e) => setFilters({ lensModel: e.target.value || null })}
              >
                <option value="">Any lens</option>
                {facets.lensModels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-neutral-500 mb-1.5">ISO min</div>
                <input
                  type="number"
                  className="w-full bg-base-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm"
                  value={filters.isoMin ?? ''}
                  onChange={(e) => setFilters({ isoMin: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1.5">ISO max</div>
                <input
                  type="number"
                  className="w-full bg-base-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm"
                  value={filters.isoMax ?? ''}
                  onChange={(e) => setFilters({ isoMax: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1.5">Focal min (mm)</div>
                <input
                  type="number"
                  className="w-full bg-base-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm"
                  value={filters.focalMin ?? ''}
                  onChange={(e) => setFilters({ focalMin: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1.5">Focal max (mm)</div>
                <input
                  type="number"
                  className="w-full bg-base-raised border border-white/10 rounded-lg px-2 py-1.5 text-sm"
                  value={filters.focalMax ?? ''}
                  onChange={(e) => setFilters({ focalMax: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
