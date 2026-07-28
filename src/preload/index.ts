import { contextBridge, ipcRenderer } from 'electron'
import { IpcEvent, IpcInvoke, type GalleryApi } from '../shared/ipc'
import type { LibraryChangedEvent, ScanProgressEvent, ThumbnailsReadyEvent, Drive } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: GalleryApi = {
  chooseFolder: () => ipcRenderer.invoke(IpcInvoke.ChooseFolder),
  listDrives: () => ipcRenderer.invoke(IpcInvoke.DrivesList),
  addDrive: (rootPath) => ipcRenderer.invoke(IpcInvoke.DrivesAdd, rootPath),
  removeDrive: (id) => ipcRenderer.invoke(IpcInvoke.DrivesRemove, id),
  setDriveEnabled: (id, enabled) => ipcRenderer.invoke(IpcInvoke.DrivesSetEnabled, id, enabled),
  rescanDrive: (id) => ipcRenderer.invoke(IpcInvoke.DrivesRescan, id),
  rescanAll: () => ipcRenderer.invoke(IpcInvoke.DrivesRescanAll),

  queryPhotos: (query) => ipcRenderer.invoke(IpcInvoke.PhotosQuery, query),
  getPhoto: (id) => ipcRenderer.invoke(IpcInvoke.PhotosGet, id),
  setFavorite: (id, favorite) => ipcRenderer.invoke(IpcInvoke.PhotosSetFavorite, id, favorite),

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

  onScanProgress: (cb) => subscribe<ScanProgressEvent>(IpcEvent.ScanProgress, cb),
  onLibraryChanged: (cb) => subscribe<LibraryChangedEvent>(IpcEvent.LibraryChanged, cb),
  onThumbnailsReady: (cb) => subscribe<ThumbnailsReadyEvent>(IpcEvent.ThumbnailsReady, cb),
  onDrivesChanged: (cb) => subscribe<Drive[]>(IpcEvent.DrivesChanged, cb),

  thumbUrl: (id, token) => `gx-thumb://${id}${token ? `?t=${token}` : ''}`,
  previewUrl: (id) => `gx-preview://${id}`,
  fileUrl: (filePath) => `gx-file://${encodeURIComponent(filePath)}`
}

contextBridge.exposeInMainWorld('gx', api)
