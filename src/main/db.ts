import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Drive,
  FilterState,
  FolderNode,
  MetaStatus,
  Photo,
  PhotoQuery,
  PhotoQueryResult,
  SmartCollectionCounts,
  ThumbStatus
} from '../shared/types'
import { isRawExtension } from '../shared/types'

export interface PhotoRow {
  id: string
  drive_id: string
  path: string
  folder_path: string
  filename: string
  extension: string
  size_bytes: number
  width: number | null
  height: number | null
  date_taken: string | null
  date_created: string | null
  date_modified: string | null
  date_indexed: string
  camera_make: string | null
  camera_model: string | null
  lens: string | null
  iso: number | null
  shutter_speed: string | null
  aperture: number | null
  focal_length: number | null
  gps_lat: number | null
  gps_lon: number | null
  color_profile: string | null
  orientation: number | null
  is_raw: number
  is_favorite: number
  is_export: number
  thumb_status: string
  meta_status: string
  fingerprint: string
  mtime_ms: number
}

function rowToPhoto(r: PhotoRow): Photo {
  return {
    id: r.id,
    driveId: r.drive_id,
    path: r.path,
    folderPath: r.folder_path,
    filename: r.filename,
    extension: r.extension,
    sizeBytes: r.size_bytes,
    width: r.width,
    height: r.height,
    dateTaken: r.date_taken,
    dateCreated: r.date_created,
    dateModified: r.date_modified,
    dateIndexed: r.date_indexed,
    cameraMake: r.camera_make,
    cameraModel: r.camera_model,
    lens: r.lens,
    iso: r.iso,
    shutterSpeed: r.shutter_speed,
    aperture: r.aperture,
    focalLength: r.focal_length,
    gpsLat: r.gps_lat,
    gpsLon: r.gps_lon,
    colorProfile: r.color_profile,
    orientation: r.orientation,
    isRaw: !!r.is_raw,
    isFavorite: !!r.is_favorite,
    isExport: !!r.is_export,
    thumbStatus: r.thumb_status as ThumbStatus,
    metaStatus: r.meta_status as MetaStatus
  }
}

const SORT_COLUMN: Record<string, string> = {
  filename: 'filename COLLATE NOCASE',
  dateTaken: 'date_taken',
  dateModified: 'date_modified',
  dateCreated: 'date_created',
  sizeBytes: 'size_bytes',
  width: 'width',
  height: 'height',
  cameraModel: 'camera_model',
  lens: 'lens'
}

export class GalleryDatabase {
  db: Database.Database

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS drives (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_scanned_at TEXT
      );

      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        drive_id TEXT NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
        path TEXT NOT NULL UNIQUE,
        folder_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        width INTEGER,
        height INTEGER,
        date_taken TEXT,
        date_created TEXT,
        date_modified TEXT,
        date_indexed TEXT NOT NULL,
        camera_make TEXT,
        camera_model TEXT,
        lens TEXT,
        iso INTEGER,
        shutter_speed TEXT,
        aperture REAL,
        focal_length REAL,
        gps_lat REAL,
        gps_lon REAL,
        color_profile TEXT,
        orientation INTEGER,
        is_raw INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_export INTEGER NOT NULL DEFAULT 0,
        thumb_status TEXT NOT NULL DEFAULT 'pending',
        meta_status TEXT NOT NULL DEFAULT 'pending',
        fingerprint TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL,
        seen INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder_path);
      CREATE INDEX IF NOT EXISTS idx_photos_drive ON photos(drive_id);
      CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_photos_export ON photos(is_export);
      CREATE INDEX IF NOT EXISTS idx_photos_indexed ON photos(date_indexed);
      CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos(date_taken);
      CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos(filename);
      CREATE INDEX IF NOT EXISTS idx_photos_ext ON photos(extension);
      CREATE INDEX IF NOT EXISTS idx_photos_thumb_status ON photos(thumb_status);
      CREATE INDEX IF NOT EXISTS idx_photos_meta_status ON photos(meta_status);
    `)
  }

  close(): void {
    this.db.close()
  }

  // ---------------- Drives ----------------

  listDrives(): Drive[] {
    const rows = this.db
      .prepare(
        `SELECT d.*, (SELECT COUNT(*) FROM photos p WHERE p.drive_id = d.id) as photo_count
         FROM drives d ORDER BY created_at ASC`
      )
      .all() as any[]
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      rootPath: r.root_path,
      enabled: !!r.enabled,
      createdAt: r.created_at,
      lastScannedAt: r.last_scanned_at,
      online: fs.existsSync(r.root_path),
      photoCount: r.photo_count
    }))
  }

  addDrive(rootPath: string, label: string): Drive {
    const existing = this.db.prepare(`SELECT id FROM drives WHERE root_path = ?`).get(rootPath) as
      | { id: string }
      | undefined
    if (existing) {
      return this.listDrives().find((d) => d.id === existing.id)!
    }
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO drives (id, label, root_path, enabled, created_at, last_scanned_at) VALUES (?, ?, ?, 1, ?, NULL)`
      )
      .run(id, label, rootPath, new Date().toISOString())
    return this.listDrives().find((d) => d.id === id)!
  }

  removeDrive(id: string): void {
    this.db.prepare(`DELETE FROM drives WHERE id = ?`).run(id)
  }

  setDriveEnabled(id: string, enabled: boolean): void {
    this.db.prepare(`UPDATE drives SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id)
  }

  touchDriveScanned(id: string): void {
    this.db.prepare(`UPDATE drives SET last_scanned_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
  }

  getDrive(id: string): Drive | undefined {
    return this.listDrives().find((d) => d.id === id)
  }

  // ---------------- Photos: scanning helpers ----------------

  getFingerprint(filePath: string): string | undefined {
    const row = this.db.prepare(`SELECT fingerprint FROM photos WHERE path = ?`).get(filePath) as
      | { fingerprint: string }
      | undefined
    return row?.fingerprint
  }

  beginScanPass(driveId: string): void {
    this.db.prepare(`UPDATE photos SET seen = 0 WHERE drive_id = ?`).run(driveId)
  }

  markSeen(filePath: string): void {
    this.db.prepare(`UPDATE photos SET seen = 1 WHERE path = ?`).run(filePath)
  }

  removeUnseen(driveId: string): string[] {
    const rows = this.db.prepare(`SELECT id FROM photos WHERE drive_id = ? AND seen = 0`).all(driveId) as {
      id: string
    }[]
    this.db.prepare(`DELETE FROM photos WHERE drive_id = ? AND seen = 0`).run(driveId)
    return rows.map((r) => r.id)
  }

  upsertBaseline(entry: {
    driveId: string
    path: string
    folderPath: string
    filename: string
    extension: string
    sizeBytes: number
    dateCreated: string | null
    dateModified: string | null
    mtimeMs: number
    isExport: boolean
    fingerprint: string
  }): { id: string; changed: boolean } {
    const existing = this.db
      .prepare(`SELECT id, fingerprint FROM photos WHERE path = ?`)
      .get(entry.path) as { id: string; fingerprint: string } | undefined

    if (existing) {
      const changed = existing.fingerprint !== entry.fingerprint
      if (changed) {
        this.db
          .prepare(
            `UPDATE photos SET size_bytes=?, date_created=?, date_modified=?, mtime_ms=?, is_export=?, fingerprint=?,
             thumb_status='pending', meta_status='pending', seen=1 WHERE id=?`
          )
          .run(
            entry.sizeBytes,
            entry.dateCreated,
            entry.dateModified,
            entry.mtimeMs,
            entry.isExport ? 1 : 0,
            entry.fingerprint,
            existing.id
          )
      } else {
        this.db.prepare(`UPDATE photos SET is_export=?, seen=1 WHERE id=?`).run(entry.isExport ? 1 : 0, existing.id)
      }
      return { id: existing.id, changed }
    }

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO photos (
          id, drive_id, path, folder_path, filename, extension, size_bytes, width, height,
          date_taken, date_created, date_modified, date_indexed, camera_make, camera_model, lens, iso,
          shutter_speed, aperture, focal_length, gps_lat, gps_lon, color_profile, orientation,
          is_raw, is_favorite, is_export, thumb_status, meta_status, fingerprint, mtime_ms, seen
        ) VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,0,?,'pending','pending',?,?,1)`
      )
      .run(
        id,
        entry.driveId,
        entry.path,
        entry.folderPath,
        entry.filename,
        entry.extension,
        entry.sizeBytes,
        entry.dateCreated,
        entry.dateModified,
        new Date().toISOString(),
        isRawExtension(entry.extension) ? 1 : 0,
        entry.isExport ? 1 : 0,
        entry.fingerprint,
        entry.mtimeMs
      )
    return { id, changed: true }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  // ---------------- Metadata / thumbnail queues ----------------

  getPendingMeta(limit: number): { id: string; path: string; extension: string; isRaw: boolean }[] {
    const rows = this.db
      .prepare(`SELECT id, path, extension, is_raw FROM photos WHERE meta_status = 'pending' LIMIT ?`)
      .all(limit) as any[]
    return rows.map((r) => ({ id: r.id, path: r.path, extension: r.extension, isRaw: !!r.is_raw }))
  }

  markMetaProcessing(ids: string[]): void {
    if (!ids.length) return
    const stmt = this.db.prepare(`UPDATE photos SET meta_status = 'processing' WHERE id = ?`)
    this.transaction(() => ids.forEach((id) => stmt.run(id)))
  }

  applyMetadata(
    id: string,
    meta: Partial<{
      width: number | null
      height: number | null
      dateTaken: string | null
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
    }>,
    status: MetaStatus
  ): void {
    this.db
      .prepare(
        `UPDATE photos SET width=?, height=?, date_taken=?, camera_make=?, camera_model=?, lens=?, iso=?,
         shutter_speed=?, aperture=?, focal_length=?, gps_lat=?, gps_lon=?, color_profile=?, orientation=?, meta_status=?
         WHERE id=?`
      )
      .run(
        meta.width ?? null,
        meta.height ?? null,
        meta.dateTaken ?? null,
        meta.cameraMake ?? null,
        meta.cameraModel ?? null,
        meta.lens ?? null,
        meta.iso ?? null,
        meta.shutterSpeed ?? null,
        meta.aperture ?? null,
        meta.focalLength ?? null,
        meta.gpsLat ?? null,
        meta.gpsLon ?? null,
        meta.colorProfile ?? null,
        meta.orientation ?? null,
        status,
        id
      )
  }

  getPendingThumbs(limit: number): { id: string; path: string; extension: string; isRaw: boolean }[] {
    const rows = this.db
      .prepare(`SELECT id, path, extension, is_raw FROM photos WHERE thumb_status = 'pending' LIMIT ?`)
      .all(limit) as any[]
    return rows.map((r) => ({ id: r.id, path: r.path, extension: r.extension, isRaw: !!r.is_raw }))
  }

  getPhotosByIds(ids: string[]): { id: string; path: string; extension: string; isRaw: boolean }[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT id, path, extension, is_raw FROM photos WHERE id IN (${placeholders})`)
      .all(...ids) as any[]
    return rows.map((r) => ({ id: r.id, path: r.path, extension: r.extension, isRaw: !!r.is_raw }))
  }

  markThumbStatus(id: string, status: ThumbStatus): void {
    this.db.prepare(`UPDATE photos SET thumb_status = ? WHERE id = ?`).run(status, id)
  }

  markThumbStatusBulk(ids: string[], status: ThumbStatus): void {
    if (!ids.length) return
    const stmt = this.db.prepare(`UPDATE photos SET thumb_status = ? WHERE id = ?`)
    this.transaction(() => ids.forEach((id) => stmt.run(status, id)))
  }

  invalidateThumb(id: string): void {
    this.markThumbStatus(id, 'pending')
  }

  /** Backfill width/height only when unknown (e.g. RAW files with unreadable EXIF dims),
   *  using the aspect ratio of the generated thumbnail as a best-effort fallback. */
  setFallbackDimensions(id: string, width: number, height: number): void {
    this.db
      .prepare(`UPDATE photos SET width = COALESCE(width, ?), height = COALESCE(height, ?) WHERE id = ?`)
      .run(width, height, id)
  }

  // ---------------- Photo removal ----------------

  removeByPath(filePath: string): string | undefined {
    const row = this.db.prepare(`SELECT id FROM photos WHERE path = ?`).get(filePath) as { id: string } | undefined
    if (row) this.db.prepare(`DELETE FROM photos WHERE id = ?`).run(row.id)
    return row?.id
  }

  getByPath(filePath: string): Photo | undefined {
    const row = this.db.prepare(`SELECT * FROM photos WHERE path = ?`).get(filePath) as PhotoRow | undefined
    return row ? rowToPhoto(row) : undefined
  }

  getById(id: string): Photo | undefined {
    const row = this.db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as PhotoRow | undefined
    return row ? rowToPhoto(row) : undefined
  }

  setFavorite(id: string, favorite: boolean): void {
    this.db.prepare(`UPDATE photos SET is_favorite = ? WHERE id = ?`).run(favorite ? 1 : 0, id)
  }

  // ---------------- Querying ----------------

  private buildWhere(query: PhotoQuery): { clause: string; params: any[] } {
    const clauses: string[] = ['p.seen = 1']
    const params: any[] = []

    const enabledDrivesClause = `p.drive_id IN (SELECT id FROM drives WHERE enabled = 1)`
    clauses.push(enabledDrivesClause)

    switch (query.view.kind) {
      case 'favorites':
        clauses.push('p.is_favorite = 1')
        break
      case 'exports':
        clauses.push('p.is_export = 1')
        break
      case 'recent': {
        clauses.push(`p.date_indexed >= datetime('now', '-7 days')`)
        break
      }
      case 'folder':
        clauses.push('(p.folder_path = ? OR p.folder_path LIKE ?)')
        params.push(query.view.path, query.view.path + path.sep + '%')
        break
      case 'search':
      case 'all':
      default:
        break
    }

    const search = (query.searchText || (query.view.kind === 'search' ? query.view.query : '')).trim()
    if (search) {
      const like = `%${search.toLowerCase()}%`
      clauses.push(
        `(LOWER(p.filename) LIKE ? OR LOWER(p.folder_path) LIKE ? OR LOWER(p.extension) LIKE ? OR LOWER(COALESCE(p.camera_model,'')) LIKE ? OR LOWER(COALESCE(p.lens,'')) LIKE ?)`
      )
      params.push(like, like, like, like, like)
    }

    const f: FilterState = query.filters
    if (f.favoritesOnly) clauses.push('p.is_favorite = 1')
    if (f.exportsOnly) clauses.push('p.is_export = 1')
    if (f.format === 'raw') clauses.push('p.is_raw = 1')
    if (f.format === 'jpeg') clauses.push(`p.extension IN ('jpg','jpeg')`)
    if (f.format === 'png') clauses.push(`p.extension = 'png'`)
    if (f.aspect === 'portrait') clauses.push('p.width IS NOT NULL AND p.height IS NOT NULL AND p.height > p.width')
    if (f.aspect === 'landscape') clauses.push('p.width IS NOT NULL AND p.height IS NOT NULL AND p.width > p.height')
    if (f.aspect === 'square')
      clauses.push('p.width IS NOT NULL AND p.height IS NOT NULL AND ABS(p.width - p.height) <= 2')
    if (f.cameraModel) {
      clauses.push('p.camera_model = ?')
      params.push(f.cameraModel)
    }
    if (f.lensModel) {
      clauses.push('p.lens = ?')
      params.push(f.lensModel)
    }
    if (f.isoMin != null) {
      clauses.push('p.iso >= ?')
      params.push(f.isoMin)
    }
    if (f.isoMax != null) {
      clauses.push('p.iso <= ?')
      params.push(f.isoMax)
    }
    if (f.focalMin != null) {
      clauses.push('p.focal_length >= ?')
      params.push(f.focalMin)
    }
    if (f.focalMax != null) {
      clauses.push('p.focal_length <= ?')
      params.push(f.focalMax)
    }
    if (f.recentDays != null) {
      clauses.push(`p.date_indexed >= datetime('now', ?)`)
      params.push(`-${f.recentDays} days`)
    }

    return { clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
  }

  queryPhotos(query: PhotoQuery): PhotoQueryResult {
    const { clause, params } = this.buildWhere(query)
    const sortCol = SORT_COLUMN[query.sortField] || SORT_COLUMN.filename
    const dir = query.sortDirection === 'desc' ? 'DESC' : 'ASC'
    // Secondary sort by id keeps pagination stable for equal primary keys.
    const orderBy = `ORDER BY ${sortCol} ${dir} NULLS LAST, p.id ${dir}`

    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM photos p ${clause}`).get(...params) as { c: number })
      .c

    const rows = this.db
      .prepare(`SELECT p.* FROM photos p ${clause} ${orderBy} LIMIT ? OFFSET ?`)
      .all(...params, query.limit, query.offset) as PhotoRow[]

    return { items: rows.map(rowToPhoto), total }
  }

  getCollectionCounts(): SmartCollectionCounts {
    const base = `FROM photos p WHERE p.seen = 1 AND p.drive_id IN (SELECT id FROM drives WHERE enabled = 1)`
    const all = (this.db.prepare(`SELECT COUNT(*) c ${base}`).get() as any).c
    const favorites = (this.db.prepare(`SELECT COUNT(*) c ${base} AND p.is_favorite = 1`).get() as any).c
    const exports = (this.db.prepare(`SELECT COUNT(*) c ${base} AND p.is_export = 1`).get() as any).c
    const recent = (
      this.db.prepare(`SELECT COUNT(*) c ${base} AND p.date_indexed >= datetime('now', '-7 days')`).get() as any
    ).c
    return { all, favorites, exports, recent }
  }

  getFacets(): { cameraModels: string[]; lensModels: string[] } {
    const cams = (
      this.db
        .prepare(
          `SELECT DISTINCT camera_model FROM photos WHERE camera_model IS NOT NULL AND camera_model != '' ORDER BY camera_model`
        )
        .all() as any[]
    ).map((r) => r.camera_model)
    const lenses = (
      this.db
        .prepare(`SELECT DISTINCT lens FROM photos WHERE lens IS NOT NULL AND lens != '' ORDER BY lens`)
        .all() as any[]
    ).map((r) => r.lens)
    return { cameraModels: cams, lensModels: lenses }
  }

  getFolderTree(driveId?: string): FolderNode[] {
    const rows = this.db
      .prepare(
        driveId
          ? `SELECT folder_path, drive_id, COUNT(*) as cnt, SUM(is_export) as export_cnt FROM photos WHERE seen = 1 AND drive_id = ? GROUP BY folder_path`
          : `SELECT folder_path, drive_id, COUNT(*) as cnt, SUM(is_export) as export_cnt FROM photos p WHERE seen = 1 AND drive_id IN (SELECT id FROM drives WHERE enabled = 1) GROUP BY folder_path, drive_id`
      )
      .all(...(driveId ? [driveId] : [])) as { folder_path: string; drive_id: string; cnt: number; export_cnt: number }[]

    const roots = this.db.prepare(`SELECT id, root_path FROM drives WHERE enabled = 1`).all() as {
      id: string
      root_path: string
    }[]
    const rootByDrive = new Map(roots.map((r) => [r.id, r.root_path]))

    // Build a tree per drive, rooted at the drive's root path.
    const driveTrees = new Map<string, FolderNode>()

    for (const row of rows) {
      const rootPath = rootByDrive.get(row.drive_id)
      if (!rootPath) continue
      let driveRoot = driveTrees.get(row.drive_id)
      if (!driveRoot) {
        driveRoot = {
          name: path.basename(rootPath) || rootPath,
          path: rootPath,
          driveId: row.drive_id,
          childCount: 0,
          photoCount: 0,
          hasExport: false,
          children: []
        }
        driveTrees.set(row.drive_id, driveRoot)
      }

      const rel = path.relative(rootPath, row.folder_path)
      const segments = rel === '' || rel === '.' ? [] : rel.split(path.sep).filter(Boolean)

      let node = driveRoot
      let currentPath = rootPath
      node.photoCount += row.cnt
      if (row.export_cnt > 0) node.hasExport = true

      for (const seg of segments) {
        currentPath = path.join(currentPath, seg)
        let child = node.children.find((c) => c.name === seg)
        if (!child) {
          child = {
            name: seg,
            path: currentPath,
            driveId: row.drive_id,
            childCount: 0,
            photoCount: 0,
            hasExport: false,
            children: []
          }
          node.children.push(child)
        }
        child.photoCount += row.cnt
        if (row.export_cnt > 0) child.hasExport = true
        node = child
      }
    }

    const finalize = (node: FolderNode): void => {
      node.children.sort((a, b) => a.name.localeCompare(b.name))
      node.childCount = node.children.length
      node.children.forEach(finalize)
    }
    const result = Array.from(driveTrees.values())
    result.forEach(finalize)
    return result
  }
}
