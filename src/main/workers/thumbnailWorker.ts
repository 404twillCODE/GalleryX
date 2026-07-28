import { parentPort } from 'node:worker_threads'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import exifr from 'exifr'
import { isRawExtension, type MediaType } from '../../shared/types'
import { extractRawPreview } from './rawPreview'
import { extractVideoFrame, type VideoThumbPosition } from './videoFrame'

export interface ThumbJob {
  jobId: number
  id: string
  filePath: string
  extension: string
  outPath: string
  size: number
  mediaType: MediaType
  videoThumbPosition?: VideoThumbPosition
}

export interface ThumbResult {
  jobId: number
  id: string
  ok: boolean
  width?: number
  height?: number
  error?: string
}

if (!parentPort) {
  throw new Error('thumbnailWorker must be run as a worker_thread')
}

parentPort.on('message', (job: ThumbJob) => {
  void handle(job)
    .then((result) => parentPort!.postMessage(result))
    .catch((error: Error) =>
      parentPort!.postMessage({ jobId: job.jobId, id: job.id, ok: false, error: error.message } as ThumbResult)
    )
})

/** Degrees of clockwise rotation needed to display the image upright, given a numeric EXIF
 *  orientation (1-8). Mirrored variants (2,4,5,7) are mapped to their nearest non-mirrored
 *  rotation — real cameras practically never produce those, only scanners/editors do. */
function orientationToDegrees(orientation: number | undefined): number {
  switch (orientation) {
    case 3:
    case 4:
      return 180
    case 5:
    case 6:
      return 90
    case 7:
    case 8:
      return 270
    default:
      return 0
  }
}

async function encode(
  input: Buffer | string,
  size: number,
  outPath: string,
  autoRotate: boolean,
  explicitAngle: number
): Promise<{ width?: number; height?: number }> {
  let pipeline = sharp(input, { failOn: 'none' })
  pipeline = autoRotate ? pipeline.rotate() : explicitAngle ? pipeline.rotate(explicitAngle) : pipeline
  const resized = pipeline.resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
  const { data, info } = await resized.webp({ quality: 86 }).toBuffer({ resolveWithObject: true })
  await fs.writeFile(outPath, data)
  return { width: info.width, height: info.height }
}

async function handleVideo(job: ThumbJob): Promise<ThumbResult> {
  try {
    const frame = await extractVideoFrame(job.filePath, job.videoThumbPosition ?? 'ten-percent')
    if (!frame) {
      return {
        jobId: job.jobId,
        id: job.id,
        ok: false,
        error: 'Could not extract a video frame (unsupported codec, missing ffmpeg, or corrupt file)'
      }
    }
    const { width, height } = await encode(frame, job.size, job.outPath, false, 0)
    return { jobId: job.jobId, id: job.id, ok: true, width, height }
  } catch (err) {
    return { jobId: job.jobId, id: job.id, ok: false, error: (err as Error).message }
  }
}

async function handle(job: ThumbJob): Promise<ThumbResult> {
  if (job.mediaType === 'video') return handleVideo(job)

  const raw = isRawExtension(job.extension)

  if (!raw) {
    try {
      const { width, height } = await encode(job.filePath, job.size, job.outPath, true, 0)
      return { jobId: job.jobId, id: job.id, ok: true, width, height }
    } catch (err) {
      return { jobId: job.jobId, id: job.id, ok: false, error: (err as Error).message }
    }
  }

  // The RAW file's own orientation tag is authoritative; an embedded preview's own EXIF (if it
  // has any) is not reliable, so we rotate explicitly instead of using sharp's auto-orient.
  const orientation = await exifr.orientation(job.filePath).catch(() => undefined)
  const explicitAngle = orientationToDegrees(orientation)

  // Our byte-scanned candidate is usually the best/largest preview, but a scan over noisy raw
  // sensor data can occasionally produce a false-positive match that isn't actually a valid
  // JPEG. Try it first, and fall back to exifr's own (small, structurally-verified, but lower
  // quality) IFD1 thumbnail extractor if it fails to decode — better a slightly blurry thumbnail
  // than a permanently failed one.
  const scanned = await extractRawPreview(job.filePath).catch(() => undefined)
  let lastError: Error | undefined

  if (scanned) {
    try {
      const { width, height } = await encode(scanned, job.size, job.outPath, false, explicitAngle)
      return { jobId: job.jobId, id: job.id, ok: true, width, height }
    } catch (err) {
      lastError = err as Error
    }
  }

  const ifd1 = await exifr.thumbnail(job.filePath).catch(() => undefined)
  if (ifd1) {
    try {
      const { width, height } = await encode(Buffer.from(ifd1), job.size, job.outPath, false, explicitAngle)
      return { jobId: job.jobId, id: job.id, ok: true, width, height }
    } catch (err) {
      lastError = err as Error
    }
  }

  return {
    jobId: job.jobId,
    id: job.id,
    ok: false,
    error: lastError?.message ?? 'No usable embedded preview found in RAW file'
  }
}
