// Shared type contracts between main, preload, and renderer processes.

export type ThumbStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type MetaStatus = 'pending' | 'processing' | 'done' | 'failed'
export type MediaType = 'image' | 'video'
export type WorkflowStatus = 'none' | 'flagged' | 'edited' | 'approved' | 'rejected'

export interface Drive {
  id: string
  label: string
  rootPath: string
  enabled: boolean
  createdAt: string
  lastScannedAt: string | null
  /** True when the root path currently resolves on disk. */
  online: boolean
  photoCount: number
  /** Best-effort stable identity (volume UUID on macOS, volume serial on Windows). Null when
   *  the platform probe isn't available/failed — the drive still works, just via path matching. */
  volumeId: string | null
  volumeLabel: string | null
  /** Last path this drive was actually seen mounted/attached at — used to detect a drive
   *  reconnecting under a new drive letter (Windows) or mount path (macOS). */
  lastKnownPath: string
}

export interface Photo {
  id: string
  driveId: string
  path: string
  folderPath: string
  filename: string
  extension: string
  sizeBytes: number
  mediaType: MediaType
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
  /** Name of the matching export-folder rule, e.g. "Export" / "Delivered". Null outside exports. */
  exportFolderName: string | null
  rating: number
  workflowStatus: WorkflowStatus
  thumbStatus: ThumbStatus
  metaStatus: MetaStatus
  /** True once the video's codec/container has been probed and found undecodable. */
  codecSupported: boolean
  /** True when the owning drive is currently disconnected. Files stay in the library, browsable
   *  via cached thumbnails/metadata, but full-resolution access and mutation are disabled. */
  isOffline: boolean

  // --- video-only fields (null for images) ---
  durationMs: number | null
  videoCodec: string | null
  audioCodec: string | null
  container: string | null
  frameRate: number | null
  bitrate: number | null
}

export type SortField =
  | 'filename'
  | 'dateTaken'
  | 'dateModified'
  | 'dateCreated'
  | 'dateIndexed'
  | 'sizeBytes'
  | 'width'
  | 'height'
  | 'cameraModel'
  | 'lens'
  | 'durationMs'
  | 'frameRate'
export type SortDirection = 'asc' | 'desc'

export type ViewId =
  | { kind: 'all' }
  | { kind: 'videos' }
  | { kind: 'favorites' }
  | { kind: 'exports' }
  | { kind: 'recent' }
  | { kind: 'folder'; path: string; driveId: string }
  | { kind: 'search'; query: string }
  | { kind: 'timeline' }

export type AspectFilter = 'any' | 'portrait' | 'landscape' | 'square'
export type FormatFilter = 'any' | 'raw' | 'jpeg' | 'png'
/** Which media types a (non media-locked) view should include. 'all'/'videos' views ignore
 *  this and force image/video respectively — it only matters for favorites/exports/recent/
 *  folder/search, which can show either or both. */
export type MediaKindFilter = 'both' | 'photo' | 'video'

export interface FilterState {
  favoritesOnly: boolean
  exportsOnly: boolean
  format: FormatFilter
  aspect: AspectFilter
  mediaKind: MediaKindFilter
  cameraModel: string | null
  lensModel: string | null
  isoMin: number | null
  isoMax: number | null
  focalMin: number | null
  focalMax: number | null
  recentDays: number | null
  ratingMin: number | null
  exportFolderName: string | null
  durationMinSec: number | null
  durationMaxSec: number | null
  codecFilter: string | null
}

export const DEFAULT_FILTERS: FilterState = {
  favoritesOnly: false,
  exportsOnly: false,
  format: 'any',
  aspect: 'any',
  mediaKind: 'both',
  cameraModel: null,
  lensModel: null,
  isoMin: null,
  isoMax: null,
  focalMin: null,
  focalMax: null,
  recentDays: null,
  ratingMin: null,
  exportFolderName: null,
  durationMinSec: null,
  durationMaxSec: null,
  codecFilter: null
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
  videoCount: number
  sizeBytes: number
  hasExport: boolean
  children: FolderNode[]
}

export interface SmartCollectionCounts {
  all: number
  videos: number
  favorites: number
  exports: number
  recent: number
}

export interface ScanProgressEvent {
  driveId: string
  /** 'counting' is a fast, stat-free pre-pass that walks the tree purely to establish a real
   *  `filesTotal` so the 'scanning' phase can show a genuine (not fabricated) percentage. */
  phase: 'counting' | 'scanning' | 'metadata' | 'thumbnails' | 'idle' | 'error'
  scanned: number
  /** Known only once the 'counting' phase finishes; absent during 'counting' itself. */
  filesTotal?: number
  currentPath?: string
  error?: string
  /** True when the error prevented scanning the drive's root at all (e.g. permission denied). */
  fatal?: boolean
}

export interface LibraryChangedEvent {
  driveId?: string
  reason: 'scan' | 'watch' | 'favorite' | 'settings' | 'duplicates' | 'drive-offline' | 'drive-online'
}

export interface ThumbnailsReadyEvent {
  ids: string[]
  tier: 'thumb' | 'preview'
}

// ---------------- Export folder rules ----------------

export interface ExportFolderRule {
  id: string
  name: string
  enabled: boolean
  isDefault: boolean
}

export interface ExportMatchSettings {
  caseSensitive: boolean
  exactMatch: boolean
  includeSubfolders: boolean
  includeVideos: boolean
}

export const DEFAULT_EXPORT_FOLDER_NAMES = ['Export', 'Exports', 'Edited', 'Final', 'Finals', 'Delivered']

export const DEFAULT_EXPORT_MATCH_SETTINGS: ExportMatchSettings = {
  caseSensitive: false,
  exactMatch: true,
  includeSubfolders: true,
  includeVideos: true
}

// Legacy helper retained for any code path that hasn't migrated to the configurable
// ExportFolderRule engine (src/main/exportRules.ts) yet.
export const EXPORT_FOLDER_NAMES = DEFAULT_EXPORT_FOLDER_NAMES.map((n) => n.toLowerCase())
export function isExportFolderName(name: string): boolean {
  return EXPORT_FOLDER_NAMES.includes(name.toLowerCase())
}

// ---------------- File type support ----------------

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

export const IMAGE_EXTENSIONS = [...RASTER_EXTENSIONS, ...RAW_EXTENSIONS]

export const VIDEO_EXTENSIONS = [
  'mp4',
  'mov',
  'm4v',
  'avi',
  'mkv',
  'webm',
  'wmv',
  'mpg',
  'mpeg',
  'mts',
  'm2ts',
  'ts',
  '3gp',
  'flv',
  'mxf'
]

/** Everything the scanner will index, across both media types. */
export const SUPPORTED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]

export function isRawExtension(ext: string): boolean {
  return RAW_EXTENSIONS.includes(ext.toLowerCase().replace(/^\./, ''))
}

export function isVideoExtension(ext: string): boolean {
  return VIDEO_EXTENSIONS.includes(ext.toLowerCase().replace(/^\./, ''))
}

export function mediaTypeForExtension(ext: string): MediaType {
  return isVideoExtension(ext) ? 'video' : 'image'
}

// ---------------- Duplicate detection ----------------

export type DuplicateScanScope =
  | { kind: 'library' }
  | { kind: 'drive'; driveId: string }
  | { kind: 'folder'; path: string; driveId: string }

export type DuplicateMediaScope = 'photos' | 'videos' | 'both'

export type SimilarityThreshold = 'very-strict' | 'strict' | 'balanced' | 'broad'

export const SIMILARITY_HAMMING_LIMIT: Record<SimilarityThreshold, number> = {
  'very-strict': 2,
  strict: 6,
  balanced: 12,
  broad: 20
}

export interface DuplicateScanOptions {
  scope: DuplicateScanScope
  media: DuplicateMediaScope
  includeSubfolders: boolean
  exactDuplicates: boolean
  rawJpegPairs: boolean
  similarImages: boolean
  similarityThreshold: SimilarityThreshold
}

export const DEFAULT_DUPLICATE_SCAN_OPTIONS: DuplicateScanOptions = {
  scope: { kind: 'library' },
  media: 'both',
  includeSubfolders: true,
  exactDuplicates: true,
  rawJpegPairs: true,
  similarImages: true,
  similarityThreshold: 'balanced'
}

export type DuplicateGroupKind = 'exact' | 'raw_jpeg' | 'similar' | 'burst' | 'video'
export type DuplicateGroupStatus = 'pending' | 'kept_all' | 'not_duplicates' | 'ignored' | 'resolved'

export interface DuplicateMember {
  photo: Photo
  role: 'raw' | 'jpeg' | null
  suggestedKeep: boolean
  online: boolean
}

export interface DuplicateGroup {
  id: string
  kind: DuplicateGroupKind
  status: DuplicateGroupStatus
  members: DuplicateMember[]
  totalBytes: number
  reclaimableBytes: number
}

export interface DuplicateScanProgress {
  sessionId: string
  phase: 'sizing' | 'partial-hash' | 'full-hash' | 'pairing' | 'perceptual' | 'done' | 'paused' | 'cancelled' | 'error'
  filesScanned: number
  filesTotal: number
  groupsFound: number
  error?: string
}

export interface DuplicateResultsSummary {
  exact: { groups: number; files: number }
  rawJpeg: { groups: number; files: number }
  similar: { groups: number; files: number }
  burst: { groups: number; files: number }
  video: { groups: number; files: number }
  ignored: { groups: number; files: number }
}

export type KeepRule =
  | 'keep_favorite'
  | 'keep_highest_rating'
  | 'keep_export'
  | 'keep_raw'
  | 'keep_jpeg'
  | 'keep_largest'
  | 'keep_highest_resolution'
  | 'keep_newest'
  | 'keep_oldest'

export interface DeletionLogEntry {
  id: string
  path: string
  driveId: string
  deletedAt: string
  method: 'trash' | 'permanent'
  success: boolean
  error: string | null
  groupId: string | null
}

// ---------------- Timeline ----------------

export type TimelineGroupBy = 'year-month' | 'year' | 'month' | 'day' | 'shoot' | 'camera' | 'lens' | 'folder' | 'drive'

export interface TimelineBucket {
  key: string
  label: string
  photoCount: number
  videoCount: number
  usedFallbackDate: boolean
}

export type ShootGapMinutes = 30 | 60 | 180 | 360 | 720 | 1440

// ---------------- Settings ----------------

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

  // Export folders — the rule *names* live in the database (export_folder_rules table) so
  // they survive a settings reset; these are just the global matching toggles.
  exportMatch: ExportMatchSettings

  // Video
  videoThumbnailPosition: 'ten-percent' | 'middle' | 'first-frame'
  videoHoverPreview: boolean

  // Duplicates / deletion safety
  permanentDeleteEnabled: boolean
  duplicateHashConcurrency: number

  // Timeline
  timelineDefaultGroupBy: TimelineGroupBy
  shootGapMinutes: ShootGapMinutes
}
