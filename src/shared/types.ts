// Shared type contracts between main, preload, and renderer processes.

export type ThumbStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type MetaStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface Drive {
  id: string
  label: string
  rootPath: string
  enabled: boolean
  createdAt: string
  lastScannedAt: string | null
  online: boolean
  photoCount: number
}

export interface Photo {
  id: string
  driveId: string
  path: string
  folderPath: string
  filename: string
  extension: string
  sizeBytes: number
  width: number | null
  height: number | null
  dateTaken: string | null
  dateCreated: string | null
  dateModified: string | null
  dateIndexed: string
  cameraMake: string | null
  cameraModel: string | null
  lens: string | null
  iso: number | null
  shutterSpeed: string | null
  aperture: number | null
  focalLength: number | null
  gpsLat: number | null
  gpsLon: number | null
  colorProfile: string | null
  orientation: number | null
  isRaw: boolean
  isFavorite: boolean
  isExport: boolean
  thumbStatus: ThumbStatus
  metaStatus: MetaStatus
}

export type SortField =
  | 'filename'
  | 'dateTaken'
  | 'dateModified'
  | 'dateCreated'
  | 'sizeBytes'
  | 'width'
  | 'height'
  | 'cameraModel'
  | 'lens'
export type SortDirection = 'asc' | 'desc'

export type ViewId =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'exports' }
  | { kind: 'recent' }
  | { kind: 'folder'; path: string; driveId: string }
  | { kind: 'search'; query: string }

export type AspectFilter = 'any' | 'portrait' | 'landscape' | 'square'
export type FormatFilter = 'any' | 'raw' | 'jpeg' | 'png'

export interface FilterState {
  favoritesOnly: boolean
  exportsOnly: boolean
  format: FormatFilter
  aspect: AspectFilter
  cameraModel: string | null
  lensModel: string | null
  isoMin: number | null
  isoMax: number | null
  focalMin: number | null
  focalMax: number | null
  recentDays: number | null
}

export const DEFAULT_FILTERS: FilterState = {
  favoritesOnly: false,
  exportsOnly: false,
  format: 'any',
  aspect: 'any',
  cameraModel: null,
  lensModel: null,
  isoMin: null,
  isoMax: null,
  focalMin: null,
  focalMax: null,
  recentDays: null
}

export interface PhotoQuery {
  view: ViewId
  sortField: SortField
  sortDirection: SortDirection
  filters: FilterState
  searchText: string
  offset: number
  limit: number
}

export interface PhotoQueryResult {
  items: Photo[]
  total: number
}

export interface FolderNode {
  name: string
  path: string
  driveId: string
  childCount: number
  photoCount: number
  hasExport: boolean
  children: FolderNode[]
}

export interface SmartCollectionCounts {
  all: number
  favorites: number
  exports: number
  recent: number
}

export interface ScanProgressEvent {
  driveId: string
  phase: 'scanning' | 'metadata' | 'thumbnails' | 'idle' | 'error'
  scanned: number
  currentPath?: string
  error?: string
  /** True when the error prevented scanning the drive's root at all (e.g. permission denied). */
  fatal?: boolean
}

export interface LibraryChangedEvent {
  driveId?: string
  reason: 'scan' | 'watch' | 'favorite' | 'settings'
}

export interface ThumbnailsReadyEvent {
  ids: string[]
  tier: 'thumb' | 'preview'
}

export interface Settings {
  thumbnailSize: number
  cacheSizeLimitMB: number
  cacheLocation: string
  databaseLocation: string
  autoRescan: boolean
  autoRescanIntervalMinutes: number
  rawSupport: boolean
  scanSubfolders: boolean
  watchForChanges: boolean
  theme: 'dark'
}

/** Folder names that should be treated as "Export" collections. Matched case-insensitively
 *  against the exact folder name (not a substring) — real libraries use "Export", "Exports",
 *  "export", "exports", etc. interchangeably. */
export const EXPORT_FOLDER_NAMES = ['export', 'exports']

export function isExportFolderName(name: string): boolean {
  return EXPORT_FOLDER_NAMES.includes(name.toLowerCase())
}

export const RAW_EXTENSIONS = [
  'arw',
  'cr2',
  'cr3',
  'nef',
  'nrw',
  'dng',
  'orf',
  'raf',
  'rw2',
  'srw',
  'pef',
  'raw',
  'srf',
  'sr2',
  'x3f',
  '3fr',
  'erf',
  'kdc',
  'mos',
  'mrw',
  'iiq'
]

export const RASTER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'heic', 'heif']

export const SUPPORTED_EXTENSIONS = [...RASTER_EXTENSIONS, ...RAW_EXTENSIONS]

export function isRawExtension(ext: string): boolean {
  return RAW_EXTENSIONS.includes(ext.toLowerCase().replace(/^\./, ''))
}
