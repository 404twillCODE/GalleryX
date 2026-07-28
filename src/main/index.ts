import { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { GalleryDatabase } from './db'
import { ScannerService } from './scanner'
import { MetadataService } from './metadataService'
import { ThumbnailService } from './thumbnailService'
import { WatcherService } from './watcherService'
import { settingsService } from './settings'
import { IpcEvent, IpcInvoke } from '../shared/ipc'
import type { PhotoQuery } from '../shared/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

protocol.registerSchemesAsPrivileged([
  { scheme: 'gx-thumb', privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: 'gx-preview', privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: 'gx-file', privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
])

let mainWindow: BrowserWindow | null = null
let db: GalleryDatabase
let scanner: ScannerService
let metadataService: MetadataService
let thumbnailService: ThumbnailService
let watcherService: WatcherService

function broadcast(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

function notifyLibraryChanged(reason: 'scan' | 'watch' | 'favorite' | 'settings', driveId?: string): void {
  broadcast(IpcEvent.LibraryChanged, { reason, driveId })
}

async function runScan(driveId: string, rootPath: string): Promise<void> {
  await scanner.scanDrive(driveId, rootPath, (evt) => {
    broadcast(IpcEvent.ScanProgress, evt)
    if (evt.phase === 'idle') {
      metadataService.wake()
      notifyLibraryChanged('scan', driveId)
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#141414',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (process.env.GX_DEBUG) {
    mainWindow.webContents.on('console-message', (_e, _level, message, line, sourceId) => {
      console.log(`[renderer] ${message} (${sourceId}:${line})`)
    })
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerProtocols(): void {
  protocol.handle('gx-thumb', async (request) => {
    const id = new URL(request.url).hostname || new URL(request.url).pathname.replace(/^\/+/, '')
    const filePath = thumbnailService.cachePathFor(id, 'thumb')
    if (!fs.existsSync(filePath)) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(filePath).toString())
  })

  protocol.handle('gx-preview', async (request) => {
    const id = new URL(request.url).hostname || new URL(request.url).pathname.replace(/^\/+/, '')
    const filePath = await thumbnailService.requestPreview(id)
    if (!filePath) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(filePath).toString())
  })

  protocol.handle('gx-file', async (request) => {
    const url = new URL(request.url)
    const encoded = url.hostname + url.pathname
    const filePath = decodeURIComponent(encoded)
    try {
      if (!fs.existsSync(filePath)) return new Response(null, { status: 404 })
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response(null, { status: 500 })
    }
  })
}

function registerIpc(): void {
  ipcMain.handle(IpcInvoke.ChooseFolder, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcInvoke.DrivesList, () => db.listDrives())

  ipcMain.handle(IpcInvoke.DrivesAdd, async (_e, rootPath: string) => {
    const label = path.basename(rootPath) || rootPath
    const drive = db.addDrive(rootPath, label)
    watcherService.watch(drive.id, drive.rootPath)
    void runScan(drive.id, drive.rootPath)
    broadcast(IpcEvent.DrivesChanged, db.listDrives())
    return drive
  })

  ipcMain.handle(IpcInvoke.DrivesRemove, (_e, id: string) => {
    watcherService.unwatch(id)
    db.removeDrive(id)
    broadcast(IpcEvent.DrivesChanged, db.listDrives())
    notifyLibraryChanged('scan')
  })

  ipcMain.handle(IpcInvoke.DrivesSetEnabled, (_e, id: string, enabled: boolean) => {
    db.setDriveEnabled(id, enabled)
    const drive = db.getDrive(id)
    if (drive) {
      if (enabled) watcherService.watch(id, drive.rootPath)
      else watcherService.unwatch(id)
    }
    broadcast(IpcEvent.DrivesChanged, db.listDrives())
    notifyLibraryChanged('scan')
  })

  ipcMain.handle(IpcInvoke.DrivesRescan, (_e, id: string) => {
    const drive = db.getDrive(id)
    if (drive) void runScan(drive.id, drive.rootPath)
  })

  ipcMain.handle(IpcInvoke.DrivesRescanAll, () => {
    for (const drive of db.listDrives()) {
      if (drive.enabled) void runScan(drive.id, drive.rootPath)
    }
  })

  ipcMain.handle(IpcInvoke.PhotosQuery, (_e, query: PhotoQuery) => db.queryPhotos(query))
  ipcMain.handle(IpcInvoke.PhotosGet, (_e, id: string) => db.getById(id) ?? null)
  ipcMain.handle(IpcInvoke.PhotosSetFavorite, (_e, id: string, favorite: boolean) => {
    db.setFavorite(id, favorite)
    notifyLibraryChanged('favorite')
  })

  ipcMain.handle(IpcInvoke.FoldersTree, (_e, driveId?: string) => db.getFolderTree(driveId))
  ipcMain.handle(IpcInvoke.CollectionsCounts, () => db.getCollectionCounts())
  ipcMain.handle(IpcInvoke.FacetsGet, () => db.getFacets())

  ipcMain.handle(IpcInvoke.SettingsGet, () => settingsService.getAll())
  ipcMain.handle(IpcInvoke.SettingsSet, (_e, partial) => {
    const updated = settingsService.set(partial)
    notifyLibraryChanged('settings')
    return updated
  })
  ipcMain.handle(IpcInvoke.SettingsResetDatabase, () => {
    watcherService.unwatchAll()
    db.close()
    const dbPath = settingsService.get('databaseLocation')
    try {
      fs.rmSync(dbPath, { force: true })
      fs.rmSync(`${dbPath}-wal`, { force: true })
      fs.rmSync(`${dbPath}-shm`, { force: true })
    } catch {
      /* ignore */
    }
    db = new GalleryDatabase(dbPath)
    notifyLibraryChanged('settings')
    broadcast(IpcEvent.DrivesChanged, db.listDrives())
  })
  ipcMain.handle(IpcInvoke.SettingsClearCache, async () => {
    const cacheDir = settingsService.get('cacheLocation')
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    fs.mkdirSync(cacheDir, { recursive: true })
    // All cached thumbnail files were just removed from disk — mark everything pending
    // so thumbnails regenerate lazily as the user browses.
    db.db.exec(`UPDATE photos SET thumb_status = 'pending'`)
    notifyLibraryChanged('settings')
  })
  ipcMain.handle(IpcInvoke.SettingsChooseCacheDir, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.on(IpcInvoke.ThumbnailsPrioritize, (_e, ids: string[]) => {
    thumbnailService.prioritize(ids)
  })

  ipcMain.on(IpcInvoke.RevealInFinder, (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
}

app.whenReady().then(() => {
  const settings = settingsService.getAll()
  db = new GalleryDatabase(settings.databaseLocation)
  scanner = new ScannerService(db)
  metadataService = new MetadataService(db, () => notifyLibraryChanged('scan'))
  thumbnailService = new ThumbnailService(
    db,
    path.join(__dirname, 'thumbnailWorker.js'),
    settings.cacheLocation,
    () => settingsService.get('cacheSizeLimitMB'),
    (ids) => broadcast(IpcEvent.ThumbnailsReady, { ids, tier: 'thumb' })
  )
  watcherService = new WatcherService(db, (driveId) => notifyLibraryChanged('watch', driveId || undefined))

  registerProtocols()
  registerIpc()
  createWindow()

  thumbnailService.start()
  metadataService.start()

  if (settingsService.get('watchForChanges')) {
    for (const drive of db.listDrives()) {
      if (drive.enabled) watcherService.watch(drive.id, drive.rootPath)
    }
  }

  if (settingsService.get('autoRescan')) {
    const intervalMs = Math.max(5, settingsService.get('autoRescanIntervalMinutes')) * 60 * 1000
    setInterval(() => {
      for (const drive of db.listDrives()) {
        if (drive.enabled) void runScan(drive.id, drive.rootPath)
      }
    }, intervalMs)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  watcherService?.unwatchAll()
  thumbnailService?.stop()
  metadataService?.stop()
  db?.close()
})
