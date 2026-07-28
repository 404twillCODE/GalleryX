import fs from 'node:fs/promises'
import path from 'node:path'
import type { GalleryDatabase } from './db'
import { mediaTypeForExtension, SUPPORTED_EXTENSIONS, isVideoExtension } from '../shared/types'
import type { ScanProgressEvent } from '../shared/types'
import { ExportMatcher, isVideoAllowedInExports } from './exportRules'
import { settingsService } from './settings'

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

  /** Fast pre-pass: walks the tree counting files that match a supported extension, with no
   *  `fs.stat` calls and no database writes — just `readdir`. This is cheap enough to run ahead
   *  of the real scan purely so the UI can show a genuine `scanned / filesTotal` percentage
   *  instead of an indeterminate spinner or (worse) a fabricated estimate. */
  private async countFiles(driveId: string, rootPath: string, onCount: (n: number) => void): Promise<number> {
    let count = 0
    const walk = async (dir: string): Promise<void> => {
      if (this.cancelled.has(driveId)) return
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      const subdirs: string[] = []
      for (const entry of entries) {
        if (this.cancelled.has(driveId)) return
        if (entry.name.startsWith('.') && entry.name !== '.') continue
        if (entry.isDirectory()) {
          if (IGNORED_DIR_NAMES.has(entry.name)) continue
          subdirs.push(path.join(dir, entry.name))
          continue
        }
        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.includes(ext)) continue
        count++
        if (count % 100 === 0) onCount(count)
      }
      for (const sub of subdirs) await walk(sub)
    }
    await walk(rootPath)
    onCount(count)
    return count
  }

  async scanDrive(driveId: string, rootPath: string, onProgress: ProgressCallback): Promise<void> {
    this.cancelled.delete(driveId)
    let scanned = 0
    this.db.beginScanPass(driveId)

    onProgress({ driveId, phase: 'counting', scanned: 0 })
    const filesTotal = await this.countFiles(driveId, rootPath, (n) => {
      onProgress({ driveId, phase: 'counting', scanned: n })
    })

    if (this.cancelled.has(driveId)) {
      this.cancelled.delete(driveId)
      onProgress({ driveId, phase: 'idle', scanned: 0, filesTotal })
      return
    }

    const matchSettings = settingsService.get('exportMatch')
    const matcher = new ExportMatcher(this.db.listExportRules(), matchSettings)

    const walk = async (
      dir: string,
      withinExport: boolean,
      exportFolderName: string | null,
      isRoot: boolean
    ): Promise<void> => {
      if (this.cancelled.has(driveId)) return
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch (err) {
        onProgress({
          driveId,
          phase: 'error',
          scanned,
          filesTotal,
          currentPath: dir,
          error: describeFsError(err as NodeJS.ErrnoException, dir),
          fatal: isRoot
        })
        return
      }

      const subdirs: { name: string; full: string; matches: boolean }[] = []

      for (const entry of entries) {
        if (this.cancelled.has(driveId)) return
        if (entry.name.startsWith('.') && entry.name !== '.') continue
        const full = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          if (IGNORED_DIR_NAMES.has(entry.name)) continue
          subdirs.push({ name: entry.name, full, matches: matcher.matchesName(entry.name) })
          continue
        }

        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.includes(ext)) continue

        try {
          const stat = await fs.stat(full)
          const fingerprint = `${stat.size}-${Math.round(stat.mtimeMs)}`
          const isVideo = isVideoExtension(ext)
          const isExport = withinExport && isVideoAllowedInExports(matchSettings, isVideo)
          this.db.upsertBaseline({
            driveId,
            path: full,
            folderPath: dir,
            filename: entry.name,
            extension: ext,
            sizeBytes: stat.size,
            mediaType: mediaTypeForExtension(ext),
            dateCreated: (stat.birthtime ?? stat.ctime).toISOString(),
            dateModified: stat.mtime.toISOString(),
            mtimeMs: stat.mtimeMs,
            isExport,
            exportFolderName: isExport ? exportFolderName : null,
            fingerprint
          })
          scanned++
          if (scanned % 10 === 0) {
            onProgress({ driveId, phase: 'scanning', scanned, filesTotal, currentPath: full })
          }
        } catch {
          // Unreadable file (permissions, broken symlink, etc.) — skip gracefully.
        }
      }

      for (const sub of subdirs) {
        const childWithinExport = matchSettings.includeSubfolders ? withinExport || sub.matches : sub.matches
        const childExportFolderName = sub.matches
          ? sub.name
          : matchSettings.includeSubfolders
            ? exportFolderName
            : null
        await walk(sub.full, childWithinExport, childExportFolderName, false)
      }
    }

    try {
      await walk(rootPath, false, null, true)
    } catch (err) {
      onProgress({
        driveId,
        phase: 'error',
        scanned,
        filesTotal,
        error: describeFsError(err as NodeJS.ErrnoException, rootPath),
        fatal: true
      })
    }

    if (!this.cancelled.has(driveId)) {
      this.db.removeUnseen(driveId)
      this.db.touchDriveScanned(driveId)
    }
    this.cancelled.delete(driveId)
    onProgress({ driveId, phase: 'idle', scanned, filesTotal })
  }
}
