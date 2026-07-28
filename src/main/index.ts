import { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { GalleryDatabase } from './db'
import { ScannerService } from './scanner'
import { MetadataService } from './metadataService'
import { ThumbnailService } from './thumbnailService'
import { WatcherService } from './watcherService'
import { DuplicateService } from './duplicateService'
import { TrashService } from './trashService'
import { probeVolumeIdentity } from './driveIdentity'
import { settingsService } from './settings'
import { IpcEvent, IpcInvoke } from '../shared/ipc'
import type { PhotoQuery, Drive, DuplicateGroup, DuplicateMember, DuplicateScanProgress, TimelineGroupBy, WorkflowStatus } from '../shared/types'
import { DEFAULT_EXPORT_MATCH_SETTINGS } from '../shared/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.on('uncaughtException', (err) => {
  console.error('[main uncaughtException]', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main unhandledRejection]', reason)
})

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
let duplicateService: DuplicateService
let trashService: TrashService

function broadcast(channel: string, payload: unknown): void {
  // Background services (thumbnail/metadata workers, watchers) keep running briefly after the
  // window closes; guard against sending to a destroyed webContents (throws synchronously and
  // was surfacing as an unhandled promise rejection from async callers like onThumbsReady).
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function notifyLibraryChanged(reason: 'scan' | 'watch' | 'favorite' | 'settings' | 'duplicates' | 'drive-offline' | 'drive-online', driveId?: string): void {
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

/** Best-effort: records a stable volume identity for a drive the first time we see it online,
 *  so a future disconnect/reconnect (different drive letter / mount path) can be recognized
 *  automatically instead of silently looking like a missing drive. No-ops gracefully if the
 *  platform probe is unavailable. */
async function ensureDriveIdentity(drive: Drive): Promise<void> {
  if (drive.volumeId || !drive.online) return
  try {
    const identity = await probeVolumeIdentity(drive.rootPath)
    if (identity.volumeId) db.setDriveIdentity(drive.id, identity)
  } catch {
    /* best effort only */
  }
}

/** Looks for a previously-indexed, currently-offline drive among the volumes mounted right now
 *  (by stable volume identity, never by path alone), and reconnects it automatically when a
 *  confident match is found. Ambiguous cases are left for the user to resolve manually via
 *  DrivesConfirmIdentity — see the "Locate…" action in the Drives sidebar section. */
async function reconcileOfflineDrives(): Promise<void> {
  const drives = db.listDrives()
  const offline = drives.filter((d) => !d.online && d.volumeId)
  if (!offline.length) return

  const candidates: string[] = []
  try {
    if (process.platform === 'darwin') {
      candidates.push(...fs.readdirSync('/Volumes').map((n) => path.join('/Volumes', n)))
    } else if (process.platform === 'win32') {
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const p = `${letter}:\\`
        if (fs.existsSync(p)) candidates.push(p)
      }
    } else {
      for (const base of ['/media', '/mnt', '/run/media']) {
        try {
          candidates.push(...fs.readdirSync(base).map((n) => path.join(base, n)))
        } catch {
          /* base dir may not exist */
        }
      }
    }
  } catch {
    /* ignore enumeration failures */
  }

  const knownPaths = new Set(drives.map((d) => d.rootPath))
  for (const drive of offline) {
    for (const candidate of candidates) {
      if (knownPaths.has(candidate)) continue
      const identity = await probeVolumeIdentity(candidate).catch(() => null)
      if (identity?.volumeId && identity.volumeId === drive.volumeId) {
        db.touchDriveLastKnownPath(drive.id, candidate)
        watcherService.watch(drive.id, candidate)
        broadcast(IpcEvent.DrivesChanged, db.listDrives())
        notifyLibraryChanged('drive-online', drive.id)
        void runScan(drive.id, candidate) // incremental reconciliation scan, not a full rebuild
        break
      }
    }
  }
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
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 16 } : undefined,
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
    const photo = db.getById(id)
    if (photo?.isOffline) return new Response(null, { status: 423 }) // Locked — offline drive
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

function toDuplicateGroup(raw: { id: string; kind: any; status: any; members: { photoId: string; role: string | null; suggestedKeep: boolean }[] }): DuplicateGroup | null {
  const members: DuplicateMember[] = []
  for (const m of raw.members) {
    const photo = db.getById(m.photoId)
    if (!photo) continue
    members.push({ photo, role: (m.role as 'raw' | 'jpeg' | null) ?? null, suggestedKeep: m.suggestedKeep, online: !photo.isOffline })
  }
  if (!members.length) return null
  const totalBytes = members.reduce((s, m) => s + m.photo.sizeBytes, 0)
  const keptCount = members.filter((m) => m.suggestedKeep).length || 1
  const reclaimableBytes = members.filter((m) => !m.suggestedKeep).reduce((s, m) => s + m.photo.sizeBytes, 0)
  return { id: raw.id, kind: raw.kind, status: raw.status, members, totalBytes, reclaimableBytes: keptCount ? reclaimableBytes : 0 }
}

/** `DuplicateService.pauseScan`/`resumeScan` update the session row directly rather than going
 *  through the normal progress-emitting code path (the scan loop is blocked inside its
 *  checkpoint() wait, so it can't emit anything itself). Re-broadcast the last known progress
 *  snapshot — optionally with an overridden phase — so the renderer's pause/resume UI reflects
 *  the change immediately instead of waiting for the scan to unblock. */
function broadcastDuplicateSessionSnapshot(sessionId: string, overridePhase?: DuplicateScanProgress['phase']): void {
  const session = db.getDuplicateSession(sessionId)
  if (!session) return
  let progress: DuplicateScanProgress
  try {
    progress = session.progressJson
      ? JSON.parse(session.progressJson)
      : { sessionId, phase: 'sizing', filesScanned: 0, filesTotal: 0, groupsFound: 0 }
  } catch {
    progress = { sessionId, phase: 'sizing', filesScanned: 0, filesTotal: 0, groupsFound: 0 }
  }
  if (overridePhase) progress.phase = overridePhase
  broadcast(IpcEvent.DuplicateScanProgress, progress)
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
    void ensureDriveIdentity(drive)
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
    if (drive?.online) void runScan(drive.id, drive.rootPath)
  })

  ipcMain.handle(IpcInvoke.DrivesRescanAll, () => {
    for (const drive of db.listDrives()) {
      if (drive.enabled && drive.online) void runScan(drive.id, drive.rootPath)
    }
  })

  ipcMain.handle(IpcInvoke.DrivesCancelScan, (_e, id: string) => {
    scanner.cancel(id)
  })

  // User-confirmed manual reconnection for cases where automatic volume-identity matching
  // wasn't confident enough (see reconcileOfflineDrives) — e.g. the platform probe is
  // unavailable, or the user renamed/reformatted-then-restored a volume.
  ipcMain.handle(IpcInvoke.DrivesConfirmIdentity, async (_e, id: string, newPath: string) => {
    db.touchDriveLastKnownPath(id, newPath)
    const drive = db.getDrive(id)
    if (drive) {
      watcherService.watch(id, newPath)
      void ensureDriveIdentity(drive)
      void runScan(id, newPath)
    }
    broadcast(IpcEvent.DrivesChanged, db.listDrives())
    notifyLibraryChanged('drive-online', id)
  })

  ipcMain.handle(IpcInvoke.PhotosQuery, (_e, query: PhotoQuery) => db.queryPhotos(query))
  ipcMain.handle(IpcInvoke.PhotosGet, (_e, id: string) => db.getById(id) ?? null)
  ipcMain.handle(IpcInvoke.PhotosSetFavorite, (_e, id: string, favorite: boolean) => {
    db.setFavorite(id, favorite)
    notifyLibraryChanged('favorite')
  })
  ipcMain.handle(IpcInvoke.PhotosSetRating, (_e, id: string, rating: number) => {
    db.setRating(id, rating)
    notifyLibraryChanged('favorite')
  })
  ipcMain.handle(IpcInvoke.PhotosSetWorkflowStatus, (_e, id: string, status: WorkflowStatus) => {
    db.setWorkflowStatus(id, status)
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

  // ---------------- Export folder rules ----------------

  ipcMain.handle(IpcInvoke.ExportRulesList, () => db.listExportRules())
  ipcMain.handle(IpcInvoke.ExportRulesAdd, (_e, name: string) => {
    const rule = db.addExportRule(name)
    notifyLibraryChanged('settings')
    return rule
  })
  ipcMain.handle(IpcInvoke.ExportRulesRemove, (_e, id: string) => {
    db.removeExportRule(id)
    notifyLibraryChanged('settings')
  })
  ipcMain.handle(IpcInvoke.ExportRulesSetEnabled, (_e, id: string, enabled: boolean) => {
    db.setExportRuleEnabled(id, enabled)
    notifyLibraryChanged('settings')
  })
  ipcMain.handle(IpcInvoke.ExportRulesReset, () => {
    db.resetExportRules()
    settingsService.set({ exportMatch: DEFAULT_EXPORT_MATCH_SETTINGS })
    notifyLibraryChanged('settings')
  })

  // ---------------- Timeline ----------------

  ipcMain.handle(IpcInvoke.TimelineBuckets, (_e, groupBy: TimelineGroupBy) => {
    const normalized = groupBy === 'year' || groupBy === 'day' ? groupBy : 'year-month'
    return db.getTimelineBuckets(normalized as 'year' | 'day' | 'year-month')
  })
  ipcMain.handle(IpcInvoke.TimelineRenameShoot, (_e, shootKey: string, name: string) => {
    db.setShootName(shootKey, name)
  })
  ipcMain.handle(IpcInvoke.TimelineShootNamesList, () => db.listShootNames())

  // ---------------- Duplicate detection ----------------

  ipcMain.handle(IpcInvoke.DuplicateScanStart, (_e, options) => {
    return duplicateService.startScan(options, (progress) => broadcast(IpcEvent.DuplicateScanProgress, progress))
  })
  ipcMain.handle(IpcInvoke.DuplicateScanPause, (_e, sessionId: string) => {
    duplicateService.pauseScan(sessionId)
    broadcastDuplicateSessionSnapshot(sessionId, 'paused')
  })
  ipcMain.handle(IpcInvoke.DuplicateScanResume, (_e, sessionId: string) => {
    duplicateService.resumeScan(sessionId)
    broadcastDuplicateSessionSnapshot(sessionId)
  })
  ipcMain.handle(IpcInvoke.DuplicateScanCancel, (_e, sessionId: string) => duplicateService.cancelScan(sessionId))
  ipcMain.handle(IpcInvoke.DuplicateGroupsList, (_e, kind) => {
    return db
      .listDuplicateGroups(kind)
      .map(toDuplicateGroup)
      .filter((g): g is DuplicateGroup => g != null)
  })
  ipcMain.handle(IpcInvoke.DuplicateGroupSetStatus, (_e, groupId: string, status) => {
    db.setDuplicateGroupStatus(groupId, status)
  })
  ipcMain.handle(IpcInvoke.DuplicateDeleteSelected, async (_e, requests: { photoId: string; groupId: string | null }[], permanent: boolean) => {
    const permanentEnabled = settingsService.get('permanentDeleteEnabled')
    const outcomes = await trashService.deleteMany(
      requests.map((r) => ({ ...r, permanent })),
      permanentEnabled
    )
    notifyLibraryChanged('duplicates')
    return outcomes.map((o) => ({ photoId: o.photoId, success: o.success, error: o.error }))
  })
  ipcMain.handle(IpcInvoke.DeletionLogList, () => db.listDeletionLog())
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
    (ids) => broadcast(IpcEvent.ThumbnailsReady, { ids, tier: 'thumb' }),
    () => settingsService.get('videoThumbnailPosition')
  )
  watcherService = new WatcherService(db, (driveId) => notifyLibraryChanged('watch', driveId || undefined))
  duplicateService = new DuplicateService(db)
  trashService = new TrashService(db)

  registerProtocols()
  registerIpc()
  createWindow()

  thumbnailService.start()
  metadataService.start()

  if (settingsService.get('watchForChanges')) {
    for (const drive of db.listDrives()) {
      if (drive.enabled && drive.online) watcherService.watch(drive.id, drive.rootPath)
    }
  }

  for (const drive of db.listDrives()) {
    void ensureDriveIdentity(drive)
  }

  // Periodic best-effort check for previously-indexed drives reconnecting under a new path/
  // letter. Cheap when nothing is offline (bails out immediately), so a short interval is fine.
  setInterval(() => void reconcileOfflineDrives(), 20000)

  if (settingsService.get('autoRescan')) {
    const intervalMs = Math.max(5, settingsService.get('autoRescanIntervalMinutes')) * 60 * 1000
    setInterval(() => {
      for (const drive of db.listDrives()) {
        if (drive.enabled && drive.online) void runScan(drive.id, drive.rootPath)
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
