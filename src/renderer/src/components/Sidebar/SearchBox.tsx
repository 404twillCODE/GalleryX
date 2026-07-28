import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

export function SearchBox(): JSX.Element {
  const searchText = useAppStore((s) => s.searchText)
  const setSearchText = useAppStore((s) => s.setSearchText)
  const searchFocusToken = useAppStore((s) => s.searchFocusToken)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchFocusToken > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [searchFocusToken])

  return (
    <div className="relative no-drag">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
      <input
        ref={inputRef}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search photos, folders, cameras..."
        className="w-full bg-base-raised border border-white/[0.06] rounded-lg pl-8 pr-8 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
      />
      {searchText && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
          onClick={() => setSearchText('')}
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
