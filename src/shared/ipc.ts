import type {
  DeletionLogEntry,
  Drive,
  DuplicateGroup,
  DuplicateGroupKind,
  DuplicateGroupStatus,
  DuplicateResultsSummary,
  DuplicateScanOptions,
  DuplicateScanProgress,
  ExportFolderRule,
  FolderNode,
  LibraryChangedEvent,
  Photo,
  PhotoQuery,
  PhotoQueryResult,
  ScanProgressEvent,
  Settings,
  SmartCollectionCounts,
  ThumbnailsReadyEvent,
  TimelineBucket,
  TimelineGroupBy,
  WorkflowStatus
} from './types'

/** Channel names used for ipcRenderer.invoke / ipcMain.handle (request/response). */
export const IpcInvoke = {
  ChooseFolder: 'app:chooseFolder',
  DrivesList: 'drives:list',
  DrivesAdd: 'drives:add',
  DrivesRemove: 'drives:remove',
  DrivesSetEnabled: 'drives:setEnabled',
  DrivesRescan: 'drives:rescan',
  DrivesRescanAll: 'drives:rescanAll',
  DrivesCancelScan: 'drives:cancelScan',
  DrivesConfirmIdentity: 'drives:confirmIdentity',
  PhotosQuery: 'photos:query',
  PhotosGet: 'photos:get',
  PhotosSetFavorite: 'photos:setFavorite',
  PhotosSetRating: 'photos:setRating',
  PhotosSetWorkflowStatus: 'photos:setWorkflowStatus',
  FoldersTree: 'folders:tree',
  CollectionsCounts: 'collections:counts',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsResetDatabase: 'settings:resetDatabase',
  SettingsClearCache: 'settings:clearCache',
  SettingsChooseCacheDir: 'settings:chooseCacheDir',
  ThumbnailsPrioritize: 'thumbnails:prioritize',
  FacetsGet: 'facets:get',
  RevealInFinder: 'app:revealInFinder',

  ExportRulesList: 'exportRules:list',
  ExportRulesAdd: 'exportRules:add',
  ExportRulesRemove: 'exportRules:remove',
  ExportRulesSetEnabled: 'exportRules:setEnabled',
  ExportRulesReset: 'exportRules:reset',

  TimelineBuckets: 'timeline:buckets',
  TimelineRenameShoot: 'timeline:renameShoot',
  TimelineShootNamesList: 'timeline:shootNamesList',

  DuplicateScanStart: 'duplicates:scanStart',
  DuplicateScanPause: 'duplicates:scanPause',
  DuplicateScanResume: 'duplicates:scanResume',
  DuplicateScanCancel: 'duplicates:scanCancel',
  DuplicateGroupsList: 'duplicates:groupsList',
  DuplicateGroupSetStatus: 'duplicates:groupSetStatus',
  DuplicateDeleteSelected: 'duplicates:deleteSelected',
  DeletionLogList: 'duplicates:deletionLog'
} as const

/** Channel names used for ipcRenderer.on (main -> renderer push events). */
export const IpcEvent = {
  ScanProgress: 'event:scanProgress',
  LibraryChanged: 'event:libraryChanged',
  ThumbnailsReady: 'event:thumbnailsReady',
  DrivesChanged: 'event:drivesChanged',
  DuplicateScanProgress: 'event:duplicateScanProgress'
} as const

export interface FacetOptions {
  cameraModels: string[]
  lensModels: string[]
  videoCodecs: string[]
}

export interface GalleryApi {
  platform: 'darwin' | 'win32' | 'linux' | string

  chooseFolder(): Promise<string | null>
  listDrives(): Promise<Drive[]>
  addDrive(rootPath: string): Promise<Drive | null>
  removeDrive(id: string): Promise<void>
  setDriveEnabled(id: string, enabled: boolean): Promise<void>
  rescanDrive(id: string): Promise<void>
  rescanAll(): Promise<void>
  cancelScan(driveId: string): Promise<void>
  confirmDriveIdentity(id: string, newPath: string): Promise<void>

  queryPhotos(query: PhotoQuery): Promise<PhotoQueryResult>
  getPhoto(id: string): Promise<Photo | null>
  setFavorite(id: string, favorite: boolean): Promise<void>
  setRating(id: string, rating: number): Promise<void>
  setWorkflowStatus(id: string, status: WorkflowStatus): Promise<void>

  getFolderTree(driveId?: string): Promise<FolderNode[]>
  getCollectionCounts(): Promise<SmartCollectionCounts>
  getFacets(): Promise<FacetOptions>

  getSettings(): Promise<Settings>
  setSettings(partial: Partial<Settings>): Promise<Settings>
  resetDatabase(): Promise<void>
  clearCache(): Promise<void>
  chooseCacheDir(): Promise<string | null>

  prioritizeThumbnails(ids: string[]): void
  revealInFinder(path: string): void

  listExportRules(): Promise<ExportFolderRule[]>
  addExportRule(name: string): Promise<ExportFolderRule>
  removeExportRule(id: string): Promise<void>
  setExportRuleEnabled(id: string, enabled: boolean): Promise<void>
  resetExportRules(): Promise<void>

  getTimelineBuckets(groupBy: TimelineGroupBy): Promise<TimelineBucket[]>
  renameShoot(shootKey: string, name: string): Promise<void>
  listShootNames(): Promise<Record<string, string>>

  startDuplicateScan(options: DuplicateScanOptions): Promise<string>
  pauseDuplicateScan(sessionId: string): Promise<void>
  resumeDuplicateScan(sessionId: string): Promise<void>
  cancelDuplicateScan(sessionId: string): Promise<void>
  listDuplicateGroups(kind?: DuplicateGroupKind): Promise<DuplicateGroup[]>
  setDuplicateGroupStatus(groupId: string, status: DuplicateGroupStatus): Promise<void>
  deleteDuplicates(photoIds: { photoId: string; groupId: string | null }[], permanent: boolean): Promise<{ photoId: string; success: boolean; error: string | null }[]>
  listDeletionLog(): Promise<DeletionLogEntry[]>

  onScanProgress(cb: (e: ScanProgressEvent) => void): () => void
  onLibraryChanged(cb: (e: LibraryChangedEvent) => void): () => void
  onThumbnailsReady(cb: (e: ThumbnailsReadyEvent) => void): () => void
  onDrivesChanged(cb: (drives: Drive[]) => void): () => void
  onDuplicateScanProgress(cb: (e: DuplicateScanProgress) => void): () => void

  thumbUrl(id: string, updatedAtToken?: string): string
  previewUrl(id: string): string
  fileUrl(path: string): string
}

export type { DuplicateResultsSummary }
