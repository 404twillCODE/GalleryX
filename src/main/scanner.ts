import fs from 'node:fs/promises'
import path from 'node:path'
import type { GalleryDatabase } from './db'
import { isExportFolderName, SUPPORTED_EXTENSIONS } from '../shared/types'
import type { ScanProgressEvent } from '../shared/types'

const IGNORED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '$RECYCLE.BIN',
  'System Volume Information',
  '.Trashes',
  '.Trash',
  '.fseventsd',
  '.Spotlight-V100',
  '.TemporaryItems',
  '@eaDir'
])

export type ProgressCallback = (event: ScanProgressEvent) => void

function describeFsError(err: NodeJS.ErrnoException, targetPath: string): string {
  if (err.code === 'EPERM' || err.code === 'EACCES') {
    return process.platform === 'darwin'
      ? `Permission denied reading "${targetPath}". On macOS, grant access under System Settings → Privacy & Security → Files and Folders (or Removable Volumes for external drives), then rescan.`
      : `Permission denied reading "${targetPath}". Check that your account has read access to this drive, then rescan.`
  }
  if (err.code === 'ENOENT') {
    return `"${targetPath}" no longer exists. The drive may be disconnected — reconnect it and rescan.`
  }
  if (err.code === 'ENOTDIR') {
    return `"${targetPath}" is not a folder.`
  }
  return err.message
}

export class ScannerService {
  private cancelled = new Set<string>()

  constructor(private db: GalleryDatabase) {}

  cancel(driveId: string): void {
    this.cancelled.add(driveId)
  }

  async scanDrive(driveId: string, rootPath: string, onProgress: ProgressCallback): Promise<void> {
    this.cancelled.delete(driveId)
    let scanned = 0
    this.db.beginScanPass(driveId)

    const walk = async (dir: string, withinExport: boolean, isRoot: boolean): Promise<void> => {
      if (this.cancelled.has(driveId)) return
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch (err) {
        onProgress({
          driveId,
          phase: 'error',
          scanned,
          currentPath: dir,
          error: describeFsError(err as NodeJS.ErrnoException, dir),
          fatal: isRoot
        })
        return
      }

      const subdirs: { name: string; full: string; isExport: boolean }[] = []

      for (const entry of entries) {
        if (this.cancelled.has(driveId)) return
        if (entry.name.startsWith('.') && entry.name !== '.') continue
        const full = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          if (IGNORED_DIR_NAMES.has(entry.name)) continue
          const isExport = isExportFolderName(entry.name)
          subdirs.push({ name: entry.name, full, isExport })
          continue
        }

        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.includes(ext)) continue

        try {
          const stat = await fs.stat(full)
          const fingerprint = `${stat.size}-${Math.round(stat.mtimeMs)}`
          this.db.upsertBaseline({
            driveId,
            path: full,
            folderPath: dir,
            filename: entry.name,
            extension: ext,
            sizeBytes: stat.size,
            dateCreated: (stat.birthtime ?? stat.ctime).toISOString(),
            dateModified: stat.mtime.toISOString(),
            mtimeMs: stat.mtimeMs,
            isExport: withinExport,
            fingerprint
          })
          scanned++
          if (scanned % 25 === 0) {
            onProgress({ driveId, phase: 'scanning', scanned, currentPath: full })
          }
        } catch {
          // Unreadable file (permissions, broken symlink, etc.) — skip gracefully.
        }
      }

      for (const sub of subdirs) {
        await walk(sub.full, withinExport || sub.isExport, false)
      }
    }

    try {
      await walk(rootPath, false, true)
    } catch (err) {
      onProgress({
        driveId,
        phase: 'error',
        scanned,
        error: describeFsError(err as NodeJS.ErrnoException, rootPath),
        fatal: true
      })
    }

    if (!this.cancelled.has(driveId)) {
      this.db.removeUnseen(driveId)
      this.db.touchDriveScanned(driveId)
    }
    this.cancelled.delete(driveId)
    onProgress({ driveId, phase: 'idle', scanned })
  }
}
