import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GalleryDatabase } from '../src/main/db'

describe('GalleryDatabase migrations', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galleryx-db-'))
    dbPath = path.join(dir, 'library.sqlite')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates every table required by the video/duplicate/export/timeline features on a fresh database', () => {
    const db = new GalleryDatabase(dbPath)
    const tableNames = new Set(
      (db.db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name)
    )
    for (const table of [
      'drives',
      'photos',
      'export_folder_rules',
      'file_hashes',
      'duplicate_scan_sessions',
      'duplicate_groups',
      'duplicate_group_members',
      'deletion_log',
      'shoot_names'
    ]) {
      expect(tableNames.has(table)).toBe(true)
    }
    db.close()
  })

  it('adds the video and export columns to the photos table', () => {
    const db = new GalleryDatabase(dbPath)
    const cols = new Set((db.db.prepare(`PRAGMA table_info(photos)`).all() as { name: string }[]).map((c) => c.name))
    for (const col of [
      'media_type',
      'export_folder_name',
      'rating',
      'workflow_status',
      'codec_supported',
      'duration_ms',
      'video_codec',
      'audio_codec',
      'container',
      'frame_rate',
      'bitrate'
    ]) {
      expect(cols.has(col)).toBe(true)
    }
    db.close()
  })

  it('adds stable-identity columns to the drives table', () => {
    const db = new GalleryDatabase(dbPath)
    const cols = new Set((db.db.prepare(`PRAGMA table_info(drives)`).all() as { name: string }[]).map((c) => c.name))
    expect(cols.has('volume_id')).toBe(true)
    expect(cols.has('volume_label')).toBe(true)
    expect(cols.has('last_known_path')).toBe(true)
    db.close()
  })

  it('sets PRAGMA user_version to the current schema version', () => {
    const db = new GalleryDatabase(dbPath)
    const version = db.db.pragma('user_version', { simple: true })
    expect(version).toBeGreaterThan(0)
    db.close()
  })

  it('never drops existing data when re-opened (idempotent migration)', () => {
    const db1 = new GalleryDatabase(dbPath)
    const drive = db1.addDrive('/Volumes/TestDrive', 'Test Drive')
    db1.upsertBaseline({
      driveId: drive.id,
      path: '/Volumes/TestDrive/a.jpg',
      folderPath: '/Volumes/TestDrive',
      filename: 'a.jpg',
      extension: 'jpg',
      sizeBytes: 1234,
      mediaType: 'image',
      dateCreated: null,
      dateModified: null,
      mtimeMs: 1000,
      isExport: false,
      exportFolderName: null,
      fingerprint: 'fp-1'
    })
    db1.close()

    const db2 = new GalleryDatabase(dbPath)
    expect(db2.listDrives().length).toBe(1)
    const photo = db2.getByPath('/Volumes/TestDrive/a.jpg')
    expect(photo?.sizeBytes).toBe(1234)
    db2.close()
  })

  it('backs up the database file before migrating an older schema version', () => {
    // Create a real (current-version) database, then roll back user_version to simulate what
    // an older GalleryX install's file would look like on disk — this is exactly the condition
    // that should trigger a pre-migration backup on the next open.
    const db1 = new GalleryDatabase(dbPath)
    db1.addDrive(dir, 'Drive')
    db1.db.pragma('user_version = 0')
    db1.close()

    const db2 = new GalleryDatabase(dbPath)
    db2.close()

    const backupDir = path.join(dir, 'backups')
    expect(fs.existsSync(backupDir)).toBe(true)
    const backups = fs.readdirSync(backupDir)
    expect(backups.length).toBeGreaterThan(0)
  })
})

describe('GalleryDatabase drive identity & offline behavior', () => {
  let dir: string
  let db: GalleryDatabase

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galleryx-db-'))
    db = new GalleryDatabase(path.join(dir, 'library.sqlite'))
  })

  afterEach(() => {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('marks a drive online when its root path exists on disk, offline otherwise', () => {
    const onlineDrive = db.addDrive(dir, 'Online Drive')
    const offlineDrive = db.addDrive('/this/path/does/not/exist/at/all', 'Offline Drive')
    const drives = db.listDrives()
    expect(drives.find((d) => d.id === onlineDrive.id)?.online).toBe(true)
    expect(drives.find((d) => d.id === offlineDrive.id)?.online).toBe(false)
  })

  it('marks photos on an offline drive as isOffline, without deleting them', () => {
    const offlineDrive = db.addDrive('/this/path/does/not/exist/at/all', 'Offline Drive')
    db.upsertBaseline({
      driveId: offlineDrive.id,
      path: '/this/path/does/not/exist/at/all/a.jpg',
      folderPath: '/this/path/does/not/exist/at/all',
      filename: 'a.jpg',
      extension: 'jpg',
      sizeBytes: 100,
      mediaType: 'image',
      dateCreated: null,
      dateModified: null,
      mtimeMs: 1,
      isExport: false,
      exportFolderName: null,
      fingerprint: 'fp'
    })
    db.invalidateDriveOnlineCache()
    const photo = db.getByPath('/this/path/does/not/exist/at/all/a.jpg')
    expect(photo?.isOffline).toBe(true)
  })

  it('finds a reconnected drive by stable volume id regardless of its mount path changing', () => {
    const drive = db.addDrive('/Volumes/OldLetter', 'External SSD')
    db.setDriveIdentity(drive.id, { volumeId: 'VOLUME-UUID-123', volumeLabel: 'External SSD' })

    const found = db.findDriveByVolumeId('VOLUME-UUID-123')
    expect(found?.id).toBe(drive.id)

    // Simulate the drive reconnecting under a new drive letter / mount path.
    db.touchDriveLastKnownPath(drive.id, '/Volumes/NewLetter')
    const foundAfterMove = db.findDriveByVolumeId('VOLUME-UUID-123')
    expect(foundAfterMove?.id).toBe(drive.id)
    expect(foundAfterMove?.rootPath).toBe('/Volumes/NewLetter')
  })

  it('preserves favorites and ratings for photos on a drive that is currently offline', () => {
    // Root path never exists on disk, so this drive is offline for the whole test — favorites
    // and ratings must still survive being read back exactly like an online drive's would.
    const drive = db.addDrive('/this/path/does/not/exist/at/all', 'Offline Drive')
    db.upsertBaseline({
      driveId: drive.id,
      path: '/this/path/does/not/exist/at/all/a.jpg',
      folderPath: '/this/path/does/not/exist/at/all',
      filename: 'a.jpg',
      extension: 'jpg',
      sizeBytes: 10,
      mediaType: 'image',
      dateCreated: null,
      dateModified: null,
      mtimeMs: 1,
      isExport: false,
      exportFolderName: null,
      fingerprint: 'fp'
    })
    const photo = db.getByPath('/this/path/does/not/exist/at/all/a.jpg')!
    db.setFavorite(photo.id, true)
    db.setRating(photo.id, 4)

    const stillThere = db.getById(photo.id)
    expect(stillThere?.isOffline).toBe(true)
    expect(stillThere?.isFavorite).toBe(true)
    expect(stillThere?.rating).toBe(4)
  })
})

describe('GalleryDatabase video support', () => {
  let dir: string
  let db: GalleryDatabase

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galleryx-db-'))
    db = new GalleryDatabase(path.join(dir, 'library.sqlite'))
  })

  afterEach(() => {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('indexes videos with mediaType "video", separate from images', () => {
    const drive = db.addDrive(dir, 'Drive')
    db.upsertBaseline({
      driveId: drive.id,
      path: path.join(dir, 'clip.mp4'),
      folderPath: dir,
      filename: 'clip.mp4',
      extension: 'mp4',
      sizeBytes: 5000,
      mediaType: 'video',
      dateCreated: null,
      dateModified: null,
      mtimeMs: 1,
      isExport: false,
      exportFolderName: null,
      fingerprint: 'fp-video'
    })
    db.upsertBaseline({
      driveId: drive.id,
      path: path.join(dir, 'photo.jpg'),
      folderPath: dir,
      filename: 'photo.jpg',
      extension: 'jpg',
      sizeBytes: 500,
      mediaType: 'image',
      dateCreated: null,
      dateModified: null,
      mtimeMs: 1,
      isExport: false,
      exportFolderName: null,
      fingerprint: 'fp-image'
    })

    const video = db.getByPath(path.join(dir, 'clip.mp4'))
    const image = db.getByPath(path.join(dir, 'photo.jpg'))
    expect(video?.mediaType).toBe('video')
    expect(image?.mediaType).toBe('image')

    const counts = db.getCollectionCounts()
    expect(counts.videos).toBe(1)
  })

  it('reports per-folder video counts alongside photo counts in the folder tree', () => {
    const drive = db.addDrive(dir, 'Drive')
    db.upsertBaseline({
      driveId: drive.id,
      path: path.join(dir, 'clip.mp4'),
      folderPath: dir,
      filename: 'clip.mp4',
      extension: 'mp4',
      sizeBytes: 5000,
      mediaType: 'video',
      dateCreated: null,
      dateModified: null,
      mtimeMs: 1,
      isExport: false,
      exportFolderName: null,
      fingerprint: 'fp-video'
    })
    const tree = db.getFolderTree()
    const node = tree.find((n) => n.path === dir)
    expect(node?.videoCount).toBe(1)
    expect(node?.photoCount).toBe(0)
  })
})
