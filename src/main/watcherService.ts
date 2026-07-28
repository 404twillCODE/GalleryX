import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { GalleryDatabase } from './db'
import { isExportFolderName, SUPPORTED_EXTENSIONS } from '../shared/types'

export class WatcherService {
  private watchers = new Map<string, FSWatcher>()

  constructor(
    private db: GalleryDatabase,
    private onChange: (driveId: string) => void
  ) {}

  watch(driveId: string, rootPath: string): void {
    this.unwatch(driveId)
    const watcher = chokidar.watch(rootPath, {
      ignoreInitial: true,
      ignored: (p: string) => /node_modules|\.git|\$RECYCLE\.BIN|System Volume Information/.test(p),
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
      depth: undefined
    })

    watcher
      .on('add', (filePath) => void this.handleAdd(driveId, filePath))
      .on('change', (filePath) => void this.handleAdd(driveId, filePath))
      .on('unlink', (filePath) => this.handleUnlink(filePath))
      .on('error', (err) => console.error('[watcher]', err))

    this.watchers.set(driveId, watcher)
  }

  unwatch(driveId: string): void {
    const w = this.watchers.get(driveId)
    if (w) {
      void w.close()
      this.watchers.delete(driveId)
    }
  }

  unwatchAll(): void {
    for (const id of Array.from(this.watchers.keys())) this.unwatch(id)
  }

  private async handleAdd(driveId: string, filePath: string): Promise<void> {
    const ext = path.extname(filePath).slice(1).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(ext)) return
    try {
      const stat = await fs.stat(filePath)
      const dir = path.dirname(filePath)
      const isExport = dir.split(path.sep).some((segment) => isExportFolderName(segment))
      this.db.upsertBaseline({
        driveId,
        path: filePath,
        folderPath: dir,
        filename: path.basename(filePath),
        extension: ext,
        sizeBytes: stat.size,
        dateCreated: (stat.birthtime ?? stat.ctime).toISOString(),
        dateModified: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
        isExport,
        fingerprint: `${stat.size}-${Math.round(stat.mtimeMs)}`
      })
      this.onChange(driveId)
    } catch {
      // File may have been removed again before we could stat it.
    }
  }

  private handleUnlink(filePath: string): void {
    const id = this.db.removeByPath(filePath)
    if (id) this.onChange('')
  }
}
