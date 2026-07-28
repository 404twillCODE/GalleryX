import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  DeletionLogEntry,
  Drive,
  DuplicateGroupKind,
  DuplicateGroupStatus,
  DuplicateScanOptions,
  ExportFolderRule,
  FilterState,
  FolderNode,
  MediaType,
  MetaStatus,
  Photo,
  PhotoQuery,
  PhotoQueryResult,
  SmartCollectionCounts,
  ThumbStatus,
  WorkflowStatus
} from '../shared/types'
import { DEFAULT_EXPORT_FOLDER_NAMES, isRawExtension } from '../shared/types'

/** Bump whenever migrate() adds new tables/columns. Used only to decide whether a pre-existing
 *  database file is worth backing up before we touch it — brand-new databases skip this. */
const SCHEMA_VERSION = 2

export interface PhotoRow {
  id: string
  drive_id: string
  path: string
  folder_path: string
  filename: string
  extension: string
  size_bytes: number
  media_type: string
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
  export_folder_name: string | null
  rating: number
  workflow_status: string
  thumb_status: string
  meta_status: string
  codec_supported: number
  duration_ms: number | null
  video_codec: string | null
  audio_codec: string | null
  container: string | null
  frame_rate: number | null
  bitrate: number | null
  fingerprint: string
  mtime_ms: number
}

function rowToPhoto(r: PhotoRow, driveOnline: boolean): Photo {
  return {
    id: r.id,
    driveId: r.drive_id,
    path: r.path,
    folderPath: r.folder_path,
    filename: r.filename,
    extension: r.extension,
    sizeBytes: r.size_bytes,
    mediaType: r.media_type as MediaType,
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
    exportFolderName: r.export_folder_name,
    rating: r.rating,
    workflowStatus: r.workflow_status as WorkflowStatus,
    thumbStatus: r.thumb_status as ThumbStatus,
    metaStatus: r.meta_status as MetaStatus,
    codecSupported: !!r.codec_supported,
    isOffline: !driveOnline,
    durationMs: r.duration_ms,
    videoCodec: r.video_codec,
    audioCodec: r.audio_codec,
    container: r.container,
    frameRate: r.frame_rate,
    bitrate: r.bitrate
  }
}

const SORT_COLUMN: Record<string, string> = {
  filename: 'filename COLLATE NOCASE',
  dateTaken: 'date_taken',
  dateModified: 'date_modified',
  dateCreated: 'date_created',
  dateIndexed: 'date_indexed',
  sizeBytes: 'size_bytes',
  width: 'width',
  height: 'height',
  cameraModel: 'camera_model',
  lens: 'lens',
  durationMs: 'duration_ms',
  frameRate: 'frame_rate'
}

export class GalleryDatabase {
  db: Database.Database
  private driveOnlineCache: Map<string, boolean> | null = null

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')

    const hadPhotosTable = !!this.db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='photos'`)
      .get()
    const currentVersion = this.db.pragma('user_version', { simple: true }) as number
    if (hadPhotosTable && currentVersion < SCHEMA_VERSION) {
      this.backupBeforeMigration(dbPath)
    }

    this.migrate()
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
  }

  /** Best-effort snapshot of the database file before altering its schema. Never blocks
   *  startup — a failed backup is logged and skipped rather than treated as fatal. */
  private backupBeforeMigration(dbPath: string): void {
    try {
      const backupDir = path.join(path.dirname(dbPath), 'backups')
      fs.mkdirSync(backupDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const dest = path.join(backupDir, `${path.basename(dbPath)}-${stamp}.bak`)
      fs.copyFileSync(dbPath, dest)
      // Keep only the 5 most recent automatic backups.
      const backups = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith(path.basename(dbPath)))
        .sort()
      for (const old of backups.slice(0, Math.max(0, backups.length - 5))) {
        try {
          fs.unlinkSync(path.join(backupDir, old))
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error('[db] pre-migration backup failed (continuing anyway):', err)
    }
  }

  private ensureColumn(table: string, column: string, ddl: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
    }
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
        media_type TEXT NOT NULL DEFAULT 'image',
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
        export_folder_name TEXT,
        rating INTEGER NOT NULL DEFAULT 0,
        workflow_status TEXT NOT NULL DEFAULT 'none',
        thumb_status TEXT NOT NULL DEFAULT 'pending',
        meta_status TEXT NOT NULL DEFAULT 'pending',
        codec_supported INTEGER NOT NULL DEFAULT 1,
        duration_ms INTEGER,
        video_codec TEXT,
        audio_codec TEXT,
        container TEXT,
        frame_rate REAL,
        bitrate INTEGER,
        fingerprint TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL,
        seen INTEGER NOT NULL DEFAULT 1
      );
    `)

    // ---- Upgrade path for databases created before a given field/table existed ----
    this.ensureColumn('drives', 'volume_id', 'TEXT')
    this.ensureColumn('drives', 'volume_label', 'TEXT')
    this.ensureColumn('drives', 'last_known_path', 'TEXT')

    this.ensureColumn('photos', 'media_type', `TEXT NOT NULL DEFAULT 'image'`)
    this.ensureColumn('photos', 'export_folder_name', 'TEXT')
    this.ensureColumn('photos', 'rating', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureColumn('photos', 'workflow_status', `TEXT NOT NULL DEFAULT 'none'`)
    this.ensureColumn('photos', 'codec_supported', 'INTEGER NOT NULL DEFAULT 1')
    this.ensureColumn('photos', 'duration_ms', 'INTEGER')
    this.ensureColumn('photos', 'video_codec', 'TEXT')
    this.ensureColumn('photos', 'audio_codec', 'TEXT')
    this.ensureColumn('photos', 'container', 'TEXT')
    this.ensureColumn('photos', 'frame_rate', 'REAL')
    this.ensureColumn('photos', 'bitrate', 'INTEGER')

    this.db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_photos_media_type ON photos(media_type);
      CREATE INDEX IF NOT EXISTS idx_photos_rating ON photos(rating);
      CREATE INDEX IF NOT EXISTS idx_photos_path ON photos(path);

      CREATE TABLE IF NOT EXISTS export_folder_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS file_hashes (
        photo_id TEXT PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
        size_bytes INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        partial_hash TEXT,
        full_hash TEXT,
        phash TEXT,
        computed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hashes_full ON file_hashes(full_hash);
      CREATE INDEX IF NOT EXISTS idx_hashes_partial ON file_hashes(partial_hash);

      CREATE TABLE IF NOT EXISTS duplicate_scan_sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        options_json TEXT NOT NULL,
        progress_json TEXT,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS duplicate_groups (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dup_groups_session ON duplicate_groups(session_id);
      CREATE INDEX IF NOT EXISTS idx_dup_groups_status ON duplicate_groups(status);
      CREATE INDEX IF NOT EXISTS idx_dup_groups_kind ON duplicate_groups(kind);

      CREATE TABLE IF NOT EXISTS duplicate_group_members (
        group_id TEXT NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
        photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        role TEXT,
        suggested_keep INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (group_id, photo_id)
      );
      CREATE INDEX IF NOT EXISTS idx_dup_members_photo ON duplicate_group_members(photo_id);

      CREATE TABLE IF NOT EXISTS deletion_log (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        drive_id TEXT,
        deleted_at TEXT NOT NULL,
        method TEXT NOT NULL,
        success INTEGER NOT NULL,
        error TEXT,
        group_id TEXT
      );

      CREATE TABLE IF NOT EXISTS shoot_names (
        shoot_key TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `)

    this.seedDefaultExportRules()
  }

  private seedDefaultExportRules(): void {
    const { c } = this.db.prepare(`SELECT COUNT(*) c FROM export_folder_rules`).get() as { c: number }
    if (c > 0) return
    const stmt = this.db.prepare(
      `INSERT INTO export_folder_rules (id, name, enabled, is_default) VALUES (?, ?, 1, 1)`
    )
    this.transaction(() => {
      for (const name of DEFAULT_EXPORT_FOLDER_NAMES) stmt.run(randomUUID(), name)
    })
  }

  close(): void {
    this.db.close()
  }

  // ---------------- Drive online lookup (used to derive Photo.isOffline) ----------------

  /** Computed once per query/batch (not per-row) — fs.existsSync is cheap per-drive but there
   *  are only ever a handful of drives, so caching just avoids redundant syscalls in a loop. */
  private getDriveOnlineMap(): Map<string, boolean> {
    if (this.driveOnlineCache) return this.driveOnlineCache
    const rows = this.db.prepare(`SELECT id, root_path FROM drives`).all() as { id: string; root_path: string }[]
    const map = new Map(rows.map((r) => [r.id, fs.existsSync(r.root_path)]))
    this.driveOnlineCache = map
    return map
  }

  /** Call after any operation that might change which drives are mounted (add/remove/rescan or
   *  a periodic reconciliation tick) so isOffline reflects current reality on the next query. */
  invalidateDriveOnlineCache(): void {
    this.driveOnlineCache = null
  }

  // ---------------- Drives ----------------

  listDrives(): Drive[] {
    const rows = this.db
      .prepare(
        `SELECT d.*, (SELECT COUNT(*) FROM photos p WHERE p.drive_id = d.id AND p.media_type = 'image') as photo_count
         FROM drives d ORDER BY created_at ASC`
      )
      .all() as any[]
    this.invalidateDriveOnlineCache()
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      rootPath: r.root_path,
      enabled: !!r.enabled,
      createdAt: r.created_at,
      lastScannedAt: r.last_scanned_at,
      online: fs.existsSync(r.root_path),
      photoCount: r.photo_count,
      volumeId: r.volume_id ?? null,
      volumeLabel: r.volume_label ?? null,
      lastKnownPath: r.last_known_path ?? r.root_path
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
        `INSERT INTO drives (id, label, root_path, enabled, created_at, last_scanned_at, last_known_path)
         VALUES (?, ?, ?, 1, ?, NULL, ?)`
      )
      .run(id, label, rootPath, new Date().toISOString(), rootPath)
    this.invalidateDriveOnlineCache()
    return this.listDrives().find((d) => d.id === id)!
  }

  removeDrive(id: string): void {
    this.db.prepare(`DELETE FROM drives WHERE id = ?`).run(id)
    this.invalidateDriveOnlineCache()
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

  setDriveIdentity(id: string, identity: { volumeId?: string | null; volumeLabel?: string | null }): void {
    this.db
      .prepare(`UPDATE drives SET volume_id = COALESCE(?, volume_id), volume_label = COALESCE(?, volume_label) WHERE id = ?`)
      .run(identity.volumeId ?? null, identity.volumeLabel ?? null, id)
  }

  touchDriveLastKnownPath(id: string, rootPath: string): void {
    this.db.prepare(`UPDATE drives SET root_path = ?, last_known_path = ? WHERE id = ?`).run(rootPath, rootPath, id)
    this.invalidateDriveOnlineCache()
  }

  findDriveByVolumeId(volumeId: string): Drive | undefined {
    const row = this.db.prepare(`SELECT id FROM drives WHERE volume_id = ?`).get(volumeId) as
      | { id: string }
      | undefined
    return row ? this.getDrive(row.id) : undefined
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
    mediaType: MediaType
    dateCreated: string | null
    dateModified: string | null
    mtimeMs: number
    isExport: boolean
    exportFolderName: string | null
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
            `UPDATE photos SET size_bytes=?, date_created=?, date_modified=?, mtime_ms=?, is_export=?, export_folder_name=?, fingerprint=?,
             thumb_status='pending', meta_status='pending', seen=1 WHERE id=?`
          )
          .run(
            entry.sizeBytes,
            entry.dateCreated,
            entry.dateModified,
            entry.mtimeMs,
            entry.isExport ? 1 : 0,
            entry.exportFolderName,
            entry.fingerprint,
            existing.id
          )
      } else {
        this.db
          .prepare(`UPDATE photos SET is_export=?, export_folder_name=?, seen=1 WHERE id=?`)
          .run(entry.isExport ? 1 : 0, entry.exportFolderName, existing.id)
      }
      return { id: existing.id, changed }
    }

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO photos (
          id, drive_id, path, folder_path, filename, extension, size_bytes, media_type, width, height,
          date_taken, date_created, date_modified, date_indexed, camera_make, camera_model, lens, iso,
          shutter_speed, aperture, focal_length, gps_lat, gps_lon, color_profile, orientation,
          is_raw, is_favorite, is_export, export_folder_name, thumb_status, meta_status, fingerprint, mtime_ms, seen
        ) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,0,?,?,'pending','pending',?,?,1)`
      )
      .run(
        id,
        entry.driveId,
        entry.path,
        entry.folderPath,
        entry.filename,
        entry.extension,
        entry.sizeBytes,
        entry.mediaType,
        entry.dateCreated,
        entry.dateModified,
        new Date().toISOString(),
        isRawExtension(entry.extension) ? 1 : 0,
        entry.isExport ? 1 : 0,
        entry.exportFolderName,
        entry.fingerprint,
        entry.mtimeMs
      )
    return { id, changed: true }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  // ---------------- Metadata / thumbnail queues ----------------

  getPendingMeta(limit: number): { id: string; path: string; extension: string; isRaw: boolean; mediaType: MediaType }[] {
    const rows = this.db
      .prepare(`SELECT id, path, extension, is_raw, media_type FROM photos WHERE meta_status = 'pending' LIMIT ?`)
      .all(limit) as any[]
    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      extension: r.extension,
      isRaw: !!r.is_raw,
      mediaType: r.media_type as MediaType
    }))
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
      durationMs: number | null
      videoCodec: string | null
      audioCodec: string | null
      container: string | null
      frameRate: number | null
      bitrate: number | null
      codecSupported: boolean
    }>,
    status: MetaStatus
  ): void {
    this.db
      .prepare(
        `UPDATE photos SET width=?, height=?, date_taken=?, camera_make=?, camera_model=?, lens=?, iso=?,
         shutter_speed=?, aperture=?, focal_length=?, gps_lat=?, gps_lon=?, color_profile=?, orientation=?,
         duration_ms=?, video_codec=?, audio_codec=?, container=?, frame_rate=?, bitrate=?, codec_supported=?,
         meta_status=?
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
        meta.durationMs ?? null,
        meta.videoCodec ?? null,
        meta.audioCodec ?? null,
        meta.container ?? null,
        meta.frameRate ?? null,
        meta.bitrate ?? null,
        meta.codecSupported === false ? 0 : 1,
        status,
        id
      )
  }

  getPendingThumbs(limit: number): { id: string; path: string; extension: string; isRaw: boolean; mediaType: MediaType }[] {
    const rows = this.db
      .prepare(`SELECT id, path, extension, is_raw, media_type FROM photos WHERE thumb_status = 'pending' LIMIT ?`)
      .all(limit) as any[]
    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      extension: r.extension,
      isRaw: !!r.is_raw,
      mediaType: r.media_type as MediaType
    }))
  }

  getPhotosByIds(
    ids: string[]
  ): { id: string; path: string; extension: string; isRaw: boolean; thumbStatus: ThumbStatus; mediaType: MediaType }[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT id, path, extension, is_raw, thumb_status, media_type FROM photos WHERE id IN (${placeholders})`)
      .all(...ids) as any[]
    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      extension: r.extension,
      isRaw: !!r.is_raw,
      thumbStatus: r.thumb_status as ThumbStatus,
      mediaType: r.media_type as MediaType
    }))
  }

  /** Rows left in 'processing' from an unclean shutdown are otherwise invisible to
   *  getPendingThumbs forever — put them back in the queue on startup. */
  resetStuckProcessing(): void {
    this.db.prepare(`UPDATE photos SET thumb_status = 'pending' WHERE thumb_status = 'processing'`).run()
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

  removeById(id: string): void {
    this.db.prepare(`DELETE FROM photos WHERE id = ?`).run(id)
  }

  getByPath(filePath: string): Photo | undefined {
    const row = this.db.prepare(`SELECT * FROM photos WHERE path = ?`).get(filePath) as PhotoRow | undefined
    if (!row) return undefined
    const online = this.getDriveOnlineMap().get(row.drive_id) ?? true
    return rowToPhoto(row, online)
  }

  getById(id: string): Photo | undefined {
    const row = this.db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as PhotoRow | undefined
    if (!row) return undefined
    const online = this.getDriveOnlineMap().get(row.drive_id) ?? true
    return rowToPhoto(row, online)
  }

  setFavorite(id: string, favorite: boolean): void {
    this.db.prepare(`UPDATE photos SET is_favorite = ? WHERE id = ?`).run(favorite ? 1 : 0, id)
  }

  setRating(id: string, rating: number): void {
    this.db.prepare(`UPDATE photos SET rating = ? WHERE id = ?`).run(Math.max(0, Math.min(5, rating)), id)
  }

  setWorkflowStatus(id: string, status: WorkflowStatus): void {
    this.db.prepare(`UPDATE photos SET workflow_status = ? WHERE id = ?`).run(status, id)
  }

  // ---------------- Querying ----------------

  private buildWhere(query: PhotoQuery): { clause: string; params: any[] } {
    const clauses: string[] = ['p.seen = 1']
    const params: any[] = []

    const enabledDrivesClause = `p.drive_id IN (SELECT id FROM drives WHERE enabled = 1)`
    clauses.push(enabledDrivesClause)

    switch (query.view.kind) {
      case 'all':
        clauses.push(`p.media_type = 'image'`)
        break
      case 'videos':
        clauses.push(`p.media_type = 'video'`)
        break
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
      case 'timeline':
      case 'search':
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
    // 'all' and 'videos' views hard-lock the media type above; every other view (favorites,
    // exports, recent, folder, search) can be narrowed via the Photos/Videos/Both tab.
    if (query.view.kind !== 'all' && query.view.kind !== 'videos') {
      if (f.mediaKind === 'photo') clauses.push(`p.media_type = 'image'`)
      if (f.mediaKind === 'video') clauses.push(`p.media_type = 'video'`)
    }
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
    if (f.ratingMin != null) {
      clauses.push('p.rating >= ?')
      params.push(f.ratingMin)
    }
    if (f.exportFolderName) {
      clauses.push('p.export_folder_name = ?')
      params.push(f.exportFolderName)
    }
    if (f.durationMinSec != null) {
      clauses.push('p.duration_ms >= ?')
      params.push(f.durationMinSec * 1000)
    }
    if (f.durationMaxSec != null) {
      clauses.push('p.duration_ms <= ?')
      params.push(f.durationMaxSec * 1000)
    }
    if (f.codecFilter) {
      clauses.push('p.video_codec = ?')
      params.push(f.codecFilter)
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

    const onlineMap = this.getDriveOnlineMap()
    return { items: rows.map((r) => rowToPhoto(r, onlineMap.get(r.drive_id) ?? true)), total }
  }

  getCollectionCounts(): SmartCollectionCounts {
    const base = `FROM photos p WHERE p.seen = 1 AND p.drive_id IN (SELECT id FROM drives WHERE enabled = 1)`
    const all = (this.db.prepare(`SELECT COUNT(*) c ${base} AND p.media_type = 'image'`).get() as any).c
    const videos = (this.db.prepare(`SELECT COUNT(*) c ${base} AND p.media_type = 'video'`).get() as any).c
    const favorites = (this.db.prepare(`SELECT COUNT(*) c ${base} AND p.is_favorite = 1`).get() as any).c
    const exports = (this.db.prepare(`SELECT COUNT(*) c ${base} AND p.is_export = 1`).get() as any).c
    const recent = (
      this.db.prepare(`SELECT COUNT(*) c ${base} AND p.date_indexed >= datetime('now', '-7 days')`).get() as any
    ).c
    return { all, videos, favorites, exports, recent }
  }

  /** Best-available date per the spec's fallback priority: original capture / video creation /
   *  EXIF date-taken are all already normalized into date_taken upstream (metadata.ts /
   *  videoProbe.ts), so this COALESCE effectively implements the full priority list. */
  private static readonly BEST_DATE_EXPR = `COALESCE(date_taken, date_created, date_modified, date_indexed)`

  getTimelineBuckets(groupBy: 'year-month' | 'year' | 'day'): { key: string; photoCount: number; videoCount: number; usedFallbackDate: number }[] {
    const dateExpr = GalleryDatabase.BEST_DATE_EXPR
    const keyExpr =
      groupBy === 'year' ? `strftime('%Y', ${dateExpr})` : groupBy === 'day' ? `strftime('%Y-%m-%d', ${dateExpr})` : `strftime('%Y-%m', ${dateExpr})`
    const rows = this.db
      .prepare(
        `SELECT ${keyExpr} as bucket_key,
                SUM(CASE WHEN media_type = 'image' THEN 1 ELSE 0 END) as photo_count,
                SUM(CASE WHEN media_type = 'video' THEN 1 ELSE 0 END) as video_count,
                SUM(CASE WHEN date_taken IS NULL THEN 1 ELSE 0 END) as fallback_count
         FROM photos WHERE seen = 1 AND drive_id IN (SELECT id FROM drives WHERE enabled = 1) AND ${dateExpr} IS NOT NULL
         GROUP BY bucket_key ORDER BY bucket_key DESC`
      )
      .all() as any[]
    return rows.map((r) => ({
      key: r.bucket_key,
      photoCount: r.photo_count,
      videoCount: r.video_count,
      usedFallbackDate: r.fallback_count > 0 ? 1 : 0
    }))
  }

  getFacets(): { cameraModels: string[]; lensModels: string[]; videoCodecs: string[] } {
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
    const codecs = (
      this.db
        .prepare(
          `SELECT DISTINCT video_codec FROM photos WHERE video_codec IS NOT NULL AND video_codec != '' ORDER BY video_codec`
        )
        .all() as any[]
    ).map((r) => r.video_codec)
    return { cameraModels: cams, lensModels: lenses, videoCodecs: codecs }
  }

  getFolderTree(driveId?: string): FolderNode[] {
    const rows = this.db
      .prepare(
        driveId
          ? `SELECT folder_path, drive_id, COUNT(*) as cnt, SUM(is_export) as export_cnt, SUM(size_bytes) as size,
               SUM(CASE WHEN media_type='video' THEN 1 ELSE 0 END) as video_cnt
             FROM photos WHERE seen = 1 AND drive_id = ? GROUP BY folder_path`
          : `SELECT folder_path, drive_id, COUNT(*) as cnt, SUM(is_export) as export_cnt, SUM(size_bytes) as size,
               SUM(CASE WHEN media_type='video' THEN 1 ELSE 0 END) as video_cnt
             FROM photos p WHERE seen = 1 AND drive_id IN (SELECT id FROM drives WHERE enabled = 1) GROUP BY folder_path, drive_id`
      )
      .all(...(driveId ? [driveId] : [])) as {
      folder_path: string
      drive_id: string
      cnt: number
      export_cnt: number
      size: number | null
      video_cnt: number
    }[]

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
          videoCount: 0,
          sizeBytes: 0,
          hasExport: false,
          children: []
        }
        driveTrees.set(row.drive_id, driveRoot)
      }

      const rel = path.relative(rootPath, row.folder_path)
      const segments = rel === '' || rel === '.' ? [] : rel.split(path.sep).filter(Boolean)

      let node = driveRoot
      let currentPath = rootPath
      const imageCnt = row.cnt - row.video_cnt
      node.photoCount += imageCnt
      node.videoCount += row.video_cnt
      node.sizeBytes += row.size ?? 0
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
            videoCount: 0,
            sizeBytes: 0,
            hasExport: false,
            children: []
          }
          node.children.push(child)
        }
        child.photoCount += imageCnt
        child.videoCount += row.video_cnt
        child.sizeBytes += row.size ?? 0
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

  // ---------------- Export folder rules ----------------

  listExportRules(): ExportFolderRule[] {
    const rows = this.db.prepare(`SELECT * FROM export_folder_rules ORDER BY is_default DESC, name ASC`).all() as any[]
    return rows.map((r) => ({ id: r.id, name: r.name, enabled: !!r.enabled, isDefault: !!r.is_default }))
  }

  addExportRule(name: string): ExportFolderRule {
    const id = randomUUID()
    this.db
      .prepare(`INSERT INTO export_folder_rules (id, name, enabled, is_default) VALUES (?, ?, 1, 0)`)
      .run(id, name)
    return { id, name, enabled: true, isDefault: false }
  }

  removeExportRule(id: string): void {
    this.db.prepare(`DELETE FROM export_folder_rules WHERE id = ?`).run(id)
  }

  setExportRuleEnabled(id: string, enabled: boolean): void {
    this.db.prepare(`UPDATE export_folder_rules SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id)
  }

  resetExportRules(): void {
    this.db.exec(`DELETE FROM export_folder_rules`)
    this.seedDefaultExportRules()
  }

  // ---------------- File hashes (duplicate detection cache) ----------------

  getHash(photoId: string): { sizeBytes: number; mtimeMs: number; partialHash: string | null; fullHash: string | null; phash: string | null } | undefined {
    const row = this.db.prepare(`SELECT * FROM file_hashes WHERE photo_id = ?`).get(photoId) as any
    if (!row) return undefined
    return { sizeBytes: row.size_bytes, mtimeMs: row.mtime_ms, partialHash: row.partial_hash, fullHash: row.full_hash, phash: row.phash }
  }

  upsertHash(
    photoId: string,
    data: { sizeBytes: number; mtimeMs: number; partialHash?: string | null; fullHash?: string | null; phash?: string | null }
  ): void {
    this.db
      .prepare(
        `INSERT INTO file_hashes (photo_id, size_bytes, mtime_ms, partial_hash, full_hash, phash, computed_at)
         VALUES (@photoId, @sizeBytes, @mtimeMs, @partialHash, @fullHash, @phash, @now)
         ON CONFLICT(photo_id) DO UPDATE SET
           size_bytes=@sizeBytes, mtime_ms=@mtimeMs,
           partial_hash=COALESCE(@partialHash, partial_hash),
           full_hash=COALESCE(@fullHash, full_hash),
           phash=COALESCE(@phash, phash),
           computed_at=@now`
      )
      .run({
        photoId,
        sizeBytes: data.sizeBytes,
        mtimeMs: data.mtimeMs,
        partialHash: data.partialHash ?? null,
        fullHash: data.fullHash ?? null,
        phash: data.phash ?? null,
        now: new Date().toISOString()
      })
  }

  /** Photos eligible for a duplicate scan within the given scope — always excludes files on
   *  currently-offline drives (never hash/delete files we can't verify are actually present). */
  getPhotosForDuplicateScan(scope: {
    driveId?: string
    folderPath?: string
    includeSubfolders?: boolean
    media: 'photos' | 'videos' | 'both'
  }): {
    id: string
    path: string
    sizeBytes: number
    mtimeMs: number
    mediaType: MediaType
    extension: string
    filename: string
    folderPath: string
    driveId: string
    dateTaken: string | null
    cameraModel: string | null
    width: number | null
    height: number | null
    durationMs: number | null
    frameRate: number | null
    videoCodec: string | null
    isFavorite: boolean
    isExport: boolean
    rating: number
  }[] {
    const clauses = ['p.seen = 1', `p.drive_id IN (SELECT id FROM drives WHERE enabled = 1)`]
    const params: any[] = []
    if (scope.driveId) {
      clauses.push('p.drive_id = ?')
      params.push(scope.driveId)
    }
    if (scope.folderPath) {
      if (scope.includeSubfolders === false) {
        clauses.push('p.folder_path = ?')
        params.push(scope.folderPath)
      } else {
        clauses.push('(p.folder_path = ? OR p.folder_path LIKE ?)')
        params.push(scope.folderPath, scope.folderPath + path.sep + '%')
      }
    }
    if (scope.media === 'photos') clauses.push(`p.media_type = 'image'`)
    if (scope.media === 'videos') clauses.push(`p.media_type = 'video'`)

    const onlineMap = this.getDriveOnlineMap()
    const rows = this.db
      .prepare(`SELECT * FROM photos p WHERE ${clauses.join(' AND ')}`)
      .all(...params) as PhotoRow[]
    return rows
      .filter((r) => onlineMap.get(r.drive_id) ?? true)
      .map((r) => ({
        id: r.id,
        path: r.path,
        sizeBytes: r.size_bytes,
        mtimeMs: r.mtime_ms,
        mediaType: r.media_type as MediaType,
        extension: r.extension,
        filename: r.filename,
        folderPath: r.folder_path,
        driveId: r.drive_id,
        dateTaken: r.date_taken,
        cameraModel: r.camera_model,
        width: r.width,
        height: r.height,
        durationMs: r.duration_ms,
        frameRate: r.frame_rate,
        videoCodec: r.video_codec,
        isFavorite: !!r.is_favorite,
        isExport: !!r.is_export,
        rating: r.rating
      }))
  }

  // ---------------- Duplicate scan sessions / groups ----------------

  createDuplicateSession(options: DuplicateScanOptions): string {
    const id = randomUUID()
    this.db
      .prepare(`INSERT INTO duplicate_scan_sessions (id, created_at, status, options_json) VALUES (?, ?, 'running', ?)`)
      .run(id, new Date().toISOString(), JSON.stringify(options))
    return id
  }

  setDuplicateSessionStatus(sessionId: string, status: string, progressJson?: string): void {
    this.db
      .prepare(
        `UPDATE duplicate_scan_sessions SET status = ?, progress_json = COALESCE(?, progress_json), completed_at = CASE WHEN ? IN ('done','cancelled','error') THEN ? ELSE completed_at END WHERE id = ?`
      )
      .run(status, progressJson ?? null, status, new Date().toISOString(), sessionId)
  }

  getDuplicateSession(sessionId: string): { id: string; status: string; optionsJson: string; progressJson: string | null } | undefined {
    const row = this.db.prepare(`SELECT * FROM duplicate_scan_sessions WHERE id = ?`).get(sessionId) as
      | { id: string; status: string; options_json: string; progress_json: string | null }
      | undefined
    if (!row) return undefined
    return { id: row.id, status: row.status, optionsJson: row.options_json, progressJson: row.progress_json }
  }

  createDuplicateGroup(sessionId: string, kind: DuplicateGroupKind): string {
    const id = randomUUID()
    this.db
      .prepare(`INSERT INTO duplicate_groups (id, session_id, kind, status, created_at) VALUES (?, ?, ?, 'pending', ?)`)
      .run(id, sessionId, kind, new Date().toISOString())
    return id
  }

  addDuplicateGroupMember(groupId: string, photoId: string, role: 'raw' | 'jpeg' | null, suggestedKeep: boolean): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO duplicate_group_members (group_id, photo_id, role, suggested_keep) VALUES (?, ?, ?, ?)`
      )
      .run(groupId, photoId, role, suggestedKeep ? 1 : 0)
  }

  setDuplicateGroupStatus(groupId: string, status: DuplicateGroupStatus): void {
    this.db.prepare(`UPDATE duplicate_groups SET status = ? WHERE id = ?`).run(status, groupId)
  }

  clearGroupsForSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM duplicate_groups WHERE session_id = ?`).run(sessionId)
  }

  listDuplicateGroups(kind?: DuplicateGroupKind): { id: string; kind: DuplicateGroupKind; status: DuplicateGroupStatus; members: { photoId: string; role: string | null; suggestedKeep: boolean }[] }[] {
    const groups = (
      kind
        ? this.db.prepare(`SELECT * FROM duplicate_groups WHERE kind = ? ORDER BY created_at DESC`).all(kind)
        : this.db.prepare(`SELECT * FROM duplicate_groups ORDER BY created_at DESC`).all()
    ) as any[]
    const memberStmt = this.db.prepare(`SELECT * FROM duplicate_group_members WHERE group_id = ?`)
    return groups.map((g) => ({
      id: g.id,
      kind: g.kind,
      status: g.status,
      members: (memberStmt.all(g.id) as any[]).map((m) => ({
        photoId: m.photo_id,
        role: m.role,
        suggestedKeep: !!m.suggested_keep
      }))
    }))
  }

  // ---------------- Deletion audit log ----------------

  logDeletion(entry: Omit<DeletionLogEntry, 'id'>): void {
    this.db
      .prepare(
        `INSERT INTO deletion_log (id, path, drive_id, deleted_at, method, success, error, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(randomUUID(), entry.path, entry.driveId, entry.deletedAt, entry.method, entry.success ? 1 : 0, entry.error, entry.groupId)
  }

  listDeletionLog(limit = 200): DeletionLogEntry[] {
    const rows = this.db.prepare(`SELECT * FROM deletion_log ORDER BY deleted_at DESC LIMIT ?`).all(limit) as any[]
    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      driveId: r.drive_id,
      deletedAt: r.deleted_at,
      method: r.method,
      success: !!r.success,
      error: r.error,
      groupId: r.group_id
    }))
  }

  // ---------------- Shoot names (virtual, user-renamed only) ----------------

  getShootName(shootKey: string): string | undefined {
    const row = this.db.prepare(`SELECT name FROM shoot_names WHERE shoot_key = ?`).get(shootKey) as
      | { name: string }
      | undefined
    return row?.name
  }

  listShootNames(): Record<string, string> {
    const rows = this.db.prepare(`SELECT shoot_key, name FROM shoot_names`).all() as { shoot_key: string; name: string }[]
    const map: Record<string, string> = {}
    for (const r of rows) map[r.shoot_key] = r.name
    return map
  }

  setShootName(shootKey: string, name: string): void {
    this.db
      .prepare(`INSERT INTO shoot_names (shoot_key, name) VALUES (?, ?) ON CONFLICT(shoot_key) DO UPDATE SET name = ?`)
      .run(shootKey, name, name)
  }
}
