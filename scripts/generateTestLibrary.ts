/**
 * Generates a large synthetic GalleryX library for performance/UI testing — tens of thousands
 * of photo and video *database rows* with realistic metadata (dates, cameras, folders, export
 * folders, RAW/JPEG pairs, favorites, ratings) WITHOUT creating any real media files on disk.
 *
 * This exercises exactly the things that matter at scale (SQLite query performance, gallery
 * virtualization, Timeline/shoot grouping, folder tree, Exports/Videos collections) without
 * needing terabytes of real photos and videos.
 *
 * Usage:
 *   npm run gen:testlibrary -- --photos=80000 --videos=15000
 *   npm run gen:testlibrary -- --photos=1000 --videos=200 --reset
 *
 * Flags:
 *   --photos=N   number of synthetic photos to generate (default 80000)
 *   --videos=N   number of synthetic videos to generate (default 15000)
 *   --db=PATH    sqlite file to write to (default .testdata/test-library.sqlite)
 *   --root=PATH  fake drive root folder referenced by generated paths (default .testdata/library-root)
 *   --reset      delete any existing database file at --db before generating
 *
 * Point GalleryX at the result via Settings > Database, or by copying the file over your
 * normal library database (back up the original first!).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GalleryDatabase } from '../src/main/db'
import type { WorkflowStatus } from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`)

const PHOTO_COUNT = Number(argValue('photos', '80000'))
const VIDEO_COUNT = Number(argValue('videos', '15000'))
const DB_PATH = path.resolve(argValue('db', path.join(__dirname, '..', '.testdata', 'test-library.sqlite')))
const ROOT_PATH = path.resolve(argValue('root', path.join(__dirname, '..', '.testdata', 'library-root')))

const CAMERAS: { make: string; model: string }[] = [
  { make: 'Sony', model: 'A7 IV' },
  { make: 'Sony', model: 'A7R V' },
  { make: 'Canon', model: 'EOS R5' },
  { make: 'Nikon', model: 'Z9' },
  { make: 'Fujifilm', model: 'X-T5' },
  { make: 'Apple', model: 'iPhone 15 Pro' }
]
const LENSES = ['24-70mm f/2.8', '50mm f/1.8', '70-200mm f/2.8', '35mm f/1.4', '16-35mm f/2.8', '85mm f/1.4']
const RAW_EXTS = ['arw', 'cr2', 'nef', 'dng', 'raf']
const VIDEO_EXTS = ['mp4', 'mov']
const VIDEO_CODECS = ['h264', 'hevc', 'prores']
const WORKFLOW_STATUSES: WorkflowStatus[] = ['none', 'none', 'none', 'flagged', 'edited', 'approved', 'rejected']
const EVENT_NAMES = ['Wedding', 'Birthday', 'Trip', 'Portrait Session', 'Product Shoot', 'Concert', 'Family', 'Sports Day']
const EXPORT_FOLDER_NAMES = ['Export', 'Final', 'Delivered']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min))
}

/** Spreads the whole library across `shootCount` distinct "shoots" (bursts of activity within a
 *  few hours, on distinct days over the last ~3 years) so Timeline/shoot-grouping has something
 *  realistic to chew on instead of one giant uniform date blob. */
function buildShootSchedule(shootCount: number): { start: number; event: string; folder: string }[] {
  const now = Date.now()
  const threeYearsMs = 3 * 365 * 24 * 3600 * 1000
  const shoots: { start: number; event: string; folder: string }[] = []
  for (let i = 0; i < shootCount; i++) {
    const start = now - Math.floor(Math.random() * threeYearsMs)
    const d = new Date(start)
    const event = `${pick(EVENT_NAMES)} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${i}`
    const folder = path.join(ROOT_PATH, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), event)
    shoots.push({ start, event, folder })
  }
  return shoots.sort((a, b) => a.start - b.start)
}

function main(): void {
  if (hasFlag('reset') && fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH)
  fs.mkdirSync(ROOT_PATH, { recursive: true })

  console.log(`Generating ${PHOTO_COUNT.toLocaleString()} photos + ${VIDEO_COUNT.toLocaleString()} videos`)
  console.log(`  database: ${DB_PATH}`)
  console.log(`  fake root: ${ROOT_PATH}`)

  const db = new GalleryDatabase(DB_PATH)
  const drive = db.addDrive(ROOT_PATH, 'Synthetic Test Library')

  const total = PHOTO_COUNT + VIDEO_COUNT
  // Roughly one shoot per ~40 items keeps clusters a believable size (a handful to a few
  // hundred shots) without producing an absurd number of Timeline groups.
  const shoots = buildShootSchedule(Math.max(1, Math.round(total / 40)))

  let created = 0
  const startedAt = Date.now()

  db.transaction(() => {
    for (let i = 0; i < total; i++) {
      const isVideo = i >= PHOTO_COUNT // photos first, then videos — order doesn't matter functionally
      const shoot = shoots[i % shoots.length]
      const offsetMs = randInt(0, 4 * 3600 * 1000) // spread within a 4h shoot window
      const takenAt = new Date(shoot.start + offsetMs)
      const camera = pick(CAMERAS)
      const isExport = Math.random() < 0.08
      const exportFolderName = isExport ? pick(EXPORT_FOLDER_NAMES) : null
      const folder = isExport ? path.join(shoot.folder, exportFolderName!) : shoot.folder

      const ext = isVideo ? pick(VIDEO_EXTS) : Math.random() < 0.15 ? pick(RAW_EXTS) : 'jpg'
      const seq = String(i).padStart(6, '0')
      const filename = `${isVideo ? 'CLIP' : 'IMG'}_${seq}.${ext}`
      const filePath = path.join(folder, filename)

      const { id } = db.upsertBaseline({
        driveId: drive.id,
        path: filePath,
        folderPath: folder,
        filename,
        extension: ext,
        sizeBytes: isVideo ? randInt(50_000_000, 2_000_000_000) : randInt(2_000_000, 45_000_000),
        mediaType: isVideo ? 'video' : 'image',
        dateCreated: takenAt.toISOString(),
        dateModified: takenAt.toISOString(),
        mtimeMs: takenAt.getTime(),
        isExport,
        exportFolderName,
        fingerprint: `${filePath}:${takenAt.getTime()}`
      })

      db.applyMetadata(
        id,
        isVideo
          ? {
              width: pick([1920, 3840]),
              height: pick([1080, 2160]),
              dateTaken: takenAt.toISOString(),
              cameraMake: camera.make,
              cameraModel: camera.model,
              durationMs: randInt(3000, 600000),
              videoCodec: pick(VIDEO_CODECS),
              audioCodec: 'aac',
              container: ext,
              frameRate: pick([23.976, 25, 29.97, 60]),
              bitrate: randInt(8_000_000, 100_000_000),
              codecSupported: true
            }
          : {
              width: pick([4000, 6000, 8256]),
              height: pick([3000, 4000, 5504]),
              dateTaken: takenAt.toISOString(),
              cameraMake: camera.make,
              cameraModel: camera.model,
              lens: pick(LENSES),
              iso: pick([100, 200, 400, 800, 1600, 3200]),
              shutterSpeed: pick(['1/125', '1/250', '1/500', '1/1000', '1/60']),
              aperture: pick([1.4, 1.8, 2.8, 4, 5.6, 8]),
              focalLength: pick([24, 35, 50, 70, 85, 135])
            },
        'done'
      )

      if (Math.random() < 0.12) db.setFavorite(id, true)
      if (Math.random() < 0.3) db.setRating(id, randInt(1, 6))
      const workflow = pick(WORKFLOW_STATUSES)
      if (workflow !== 'none') db.setWorkflowStatus(id, workflow)

      // No real file exists on disk for these synthetic rows, so mark thumbnails "failed"
      // up front rather than letting the background worker discover that the millionth time.
      db.markThumbStatus(id, 'failed')

      created++
      if (created % 10000 === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
        console.log(`  ${created.toLocaleString()} / ${total.toLocaleString()} rows (${elapsed}s elapsed)`)
      }
    }
  })

  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`)
  console.log('')
  console.log('To browse this library in GalleryX, open Settings and set the Database location to:')
  console.log(`  ${DB_PATH}`)
  console.log('(back up your real library.sqlite first if you want to switch back later)')
  db.close()
}

main()
