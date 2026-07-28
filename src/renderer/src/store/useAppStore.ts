import { create } from 'zustand'
import type {
  Drive,
  FilterState,
  FolderNode,
  Settings,
  SmartCollectionCounts,
  SortDirection,
  SortField,
  ViewId
} from '../../../shared/types'
import { DEFAULT_FILTERS } from '../../../shared/types'

interface AppState {
  drives: Drive[]
  setDrives: (drives: Drive[]) => void

  folderTree: FolderNode[]
  setFolderTree: (tree: FolderNode[]) => void

  collectionCounts: SmartCollectionCounts
  setCollectionCounts: (c: SmartCollectionCounts) => void

  settings: Settings | null
  setSettings: (s: Settings) => void

  view: ViewId
  setView: (v: ViewId) => void

  sortField: SortField
  sortDirection: SortDirection
  setSort: (field: SortField, direction: SortDirection) => void

  filters: FilterState
  setFilters: (f: Partial<FilterState>) => void
  resetFilters: () => void

  searchText: string
  setSearchText: (s: string) => void

  thumbnailSize: number
  setThumbnailSize: (n: number) => void

  sidebarCollapsed: boolean
  toggleSidebar: () => void

  metadataPanelCollapsed: boolean
  toggleMetadataPanel: () => void

  selectedIds: string[]
  anchorId: string | null
  setSelection: (ids: string[], anchor?: string | null) => void

  activePhotoId: string | null
  setActivePhoto: (id: string | null) => void

  viewerOpen: boolean
  openViewer: (id: string) => void
  closeViewer: () => void

  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void

  libraryVersion: number
  bumpLibraryVersion: () => void

  gridColumns: number
  setGridColumns: (n: number) => void

  searchFocusToken: number
  requestSearchFocus: () => void

  driveErrors: Record<string, string>
  setDriveError: (driveId: string, message: string | null) => void

  toasts: { id: number; tone: 'error' | 'info'; message: string }[]
  pushToast: (tone: 'error' | 'info', message: string) => void
  dismissToast: (id: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  drives: [],
  setDrives: (drives) => set({ drives }),

  folderTree: [],
  setFolderTree: (folderTree) => set({ folderTree }),

  collectionCounts: { all: 0, favorites: 0, exports: 0, recent: 0 },
  setCollectionCounts: (collectionCounts) => set({ collectionCounts }),

  settings: null,
  setSettings: (settings) => set({ settings, thumbnailSize: settings.thumbnailSize }),

  view: { kind: 'all' },
  setView: (view) => set({ view, selectedIds: [], anchorId: null }),

  sortField: 'dateTaken',
  sortDirection: 'desc',
  setSort: (sortField, sortDirection) => set({ sortField, sortDirection }),

  filters: DEFAULT_FILTERS,
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  searchText: '',
  setSearchText: (searchText) => set({ searchText }),

  thumbnailSize: 220,
  setThumbnailSize: (thumbnailSize) => set({ thumbnailSize }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  metadataPanelCollapsed: false,
  toggleMetadataPanel: () => set((s) => ({ metadataPanelCollapsed: !s.metadataPanelCollapsed })),

  selectedIds: [],
  anchorId: null,
  setSelection: (selectedIds, anchor) => set({ selectedIds, anchorId: anchor ?? selectedIds[selectedIds.length - 1] ?? null }),

  activePhotoId: null,
  setActivePhoto: (activePhotoId) => set({ activePhotoId }),

  viewerOpen: false,
  openViewer: (id) => set({ viewerOpen: true, activePhotoId: id }),
  closeViewer: () => set({ viewerOpen: false }),

  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  libraryVersion: 0,
  bumpLibraryVersion: () => set((s) => ({ libraryVersion: s.libraryVersion + 1 })),

  gridColumns: 6,
  setGridColumns: (gridColumns) => set({ gridColumns }),

  searchFocusToken: 0,
  requestSearchFocus: () => set((s) => ({ searchFocusToken: s.searchFocusToken + 1 })),

  driveErrors: {},
  setDriveError: (driveId, message) =>
    set((s) => {
      const next = { ...s.driveErrors }
      if (message) next[driveId] = message
      else delete next[driveId]
      return { driveErrors: next }
    }),

  toasts: [],
  pushToast: (tone, message) =>
    set((s) => ({ toasts: [...s.toasts, { id: Date.now() + Math.random(), tone, message }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
