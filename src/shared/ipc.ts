import type {
  Drive,
  FolderNode,
  LibraryChangedEvent,
  Photo,
  PhotoQuery,
  PhotoQueryResult,
  ScanProgressEvent,
  Settings,
  SmartCollectionCounts,
  ThumbnailsReadyEvent
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
  PhotosQuery: 'photos:query',
  PhotosGet: 'photos:get',
  PhotosSetFavorite: 'photos:setFavorite',
  FoldersTree: 'folders:tree',
  CollectionsCounts: 'collections:counts',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsResetDatabase: 'settings:resetDatabase',
  SettingsClearCache: 'settings:clearCache',
  SettingsChooseCacheDir: 'settings:chooseCacheDir',
  ThumbnailsPrioritize: 'thumbnails:prioritize',
  FacetsGet: 'facets:get',
  RevealInFinder: 'app:revealInFinder'
} as const

/** Channel names used for ipcRenderer.on (main -> renderer push events). */
export const IpcEvent = {
  ScanProgress: 'event:scanProgress',
  LibraryChanged: 'event:libraryChanged',
  ThumbnailsReady: 'event:thumbnailsReady',
  DrivesChanged: 'event:drivesChanged'
} as const

export interface FacetOptions {
  cameraModels: string[]
  lensModels: string[]
}

export interface GalleryApi {
  chooseFolder(): Promise<string | null>
  listDrives(): Promise<Drive[]>
  addDrive(rootPath: string): Promise<Drive | null>
  removeDrive(id: string): Promise<void>
  setDriveEnabled(id: string, enabled: boolean): Promise<void>
  rescanDrive(id: string): Promise<void>
  rescanAll(): Promise<void>

  queryPhotos(query: PhotoQuery): Promise<PhotoQueryResult>
  getPhoto(id: string): Promise<Photo | null>
  setFavorite(id: string, favorite: boolean): Promise<void>

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

  onScanProgress(cb: (e: ScanProgressEvent) => void): () => void
  onLibraryChanged(cb: (e: LibraryChangedEvent) => void): () => void
  onThumbnailsReady(cb: (e: ThumbnailsReadyEvent) => void): () => void
  onDrivesChanged(cb: (drives: Drive[]) => void): () => void

  thumbUrl(id: string, updatedAtToken?: string): string
  previewUrl(id: string): string
  fileUrl(path: string): string
}
