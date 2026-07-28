import { contextBridge, ipcRenderer } from 'electron'
import { IpcEvent, IpcInvoke, type GalleryApi } from '../shared/ipc'
import type {
  Drive,
  DuplicateScanProgress,
  LibraryChangedEvent,
  ScanProgressEvent,
  ThumbnailsReadyEvent
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: GalleryApi = {
  platform: process.platform,

  chooseFolder: () => ipcRenderer.invoke(IpcInvoke.ChooseFolder),
  listDrives: () => ipcRenderer.invoke(IpcInvoke.DrivesList),
  addDrive: (rootPath) => ipcRenderer.invoke(IpcInvoke.DrivesAdd, rootPath),
  removeDrive: (id) => ipcRenderer.invoke(IpcInvoke.DrivesRemove, id),
  setDriveEnabled: (id, enabled) => ipcRenderer.invoke(IpcInvoke.DrivesSetEnabled, id, enabled),
  rescanDrive: (id) => ipcRenderer.invoke(IpcInvoke.DrivesRescan, id),
  rescanAll: () => ipcRenderer.invoke(IpcInvoke.DrivesRescanAll),
  cancelScan: (driveId) => ipcRenderer.invoke(IpcInvoke.DrivesCancelScan, driveId),
  confirmDriveIdentity: (id, newPath) => ipcRenderer.invoke(IpcInvoke.DrivesConfirmIdentity, id, newPath),

  queryPhotos: (query) => ipcRenderer.invoke(IpcInvoke.PhotosQuery, query),
  getPhoto: (id) => ipcRenderer.invoke(IpcInvoke.PhotosGet, id),
  setFavorite: (id, favorite) => ipcRenderer.invoke(IpcInvoke.PhotosSetFavorite, id, favorite),
  setRating: (id, rating) => ipcRenderer.invoke(IpcInvoke.PhotosSetRating, id, rating),
  setWorkflowStatus: (id, status) => ipcRenderer.invoke(IpcInvoke.PhotosSetWorkflowStatus, id, status),

  getFolderTree: (driveId) => ipcRenderer.invoke(IpcInvoke.FoldersTree, driveId),
  getCollectionCounts: () => ipcRenderer.invoke(IpcInvoke.CollectionsCounts),
  getFacets: () => ipcRenderer.invoke(IpcInvoke.FacetsGet),

  getSettings: () => ipcRenderer.invoke(IpcInvoke.SettingsGet),
  setSettings: (partial) => ipcRenderer.invoke(IpcInvoke.SettingsSet, partial),
  resetDatabase: () => ipcRenderer.invoke(IpcInvoke.SettingsResetDatabase),
  clearCache: () => ipcRenderer.invoke(IpcInvoke.SettingsClearCache),
  chooseCacheDir: () => ipcRenderer.invoke(IpcInvoke.SettingsChooseCacheDir),

  prioritizeThumbnails: (ids) => ipcRenderer.send(IpcInvoke.ThumbnailsPrioritize, ids),
  revealInFinder: (filePath) => ipcRenderer.send(IpcInvoke.RevealInFinder, filePath),

  listExportRules: () => ipcRenderer.invoke(IpcInvoke.ExportRulesList),
  addExportRule: (name) => ipcRenderer.invoke(IpcInvoke.ExportRulesAdd, name),
  removeExportRule: (id) => ipcRenderer.invoke(IpcInvoke.ExportRulesRemove, id),
  setExportRuleEnabled: (id, enabled) => ipcRenderer.invoke(IpcInvoke.ExportRulesSetEnabled, id, enabled),
  resetExportRules: () => ipcRenderer.invoke(IpcInvoke.ExportRulesReset),

  getTimelineBuckets: (groupBy) => ipcRenderer.invoke(IpcInvoke.TimelineBuckets, groupBy),
  renameShoot: (shootKey, name) => ipcRenderer.invoke(IpcInvoke.TimelineRenameShoot, shootKey, name),
  listShootNames: () => ipcRenderer.invoke(IpcInvoke.TimelineShootNamesList),

  startDuplicateScan: (options) => ipcRenderer.invoke(IpcInvoke.DuplicateScanStart, options),
  pauseDuplicateScan: (sessionId) => ipcRenderer.invoke(IpcInvoke.DuplicateScanPause, sessionId),
  resumeDuplicateScan: (sessionId) => ipcRenderer.invoke(IpcInvoke.DuplicateScanResume, sessionId),
  cancelDuplicateScan: (sessionId) => ipcRenderer.invoke(IpcInvoke.DuplicateScanCancel, sessionId),
  listDuplicateGroups: (kind) => ipcRenderer.invoke(IpcInvoke.DuplicateGroupsList, kind),
  setDuplicateGroupStatus: (groupId, status) => ipcRenderer.invoke(IpcInvoke.DuplicateGroupSetStatus, groupId, status),
  deleteDuplicates: (requests, permanent) => ipcRenderer.invoke(IpcInvoke.DuplicateDeleteSelected, requests, permanent),
  listDeletionLog: () => ipcRenderer.invoke(IpcInvoke.DeletionLogList),

  onScanProgress: (cb) => subscribe<ScanProgressEvent>(IpcEvent.ScanProgress, cb),
  onLibraryChanged: (cb) => subscribe<LibraryChangedEvent>(IpcEvent.LibraryChanged, cb),
  onThumbnailsReady: (cb) => subscribe<ThumbnailsReadyEvent>(IpcEvent.ThumbnailsReady, cb),
  onDrivesChanged: (cb) => subscribe<Drive[]>(IpcEvent.DrivesChanged, cb),
  onDuplicateScanProgress: (cb) => subscribe<DuplicateScanProgress>(IpcEvent.DuplicateScanProgress, cb),

  thumbUrl: (id, token) => `gx-thumb://${id}${token ? `?t=${token}` : ''}`,
  previewUrl: (id) => `gx-preview://${id}`,
  fileUrl: (filePath) => `gx-file://${encodeURIComponent(filePath)}`
}

contextBridge.exposeInMainWorld('gx', api)
