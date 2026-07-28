import { parentPort } from 'node:worker_threads'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import exifr from 'exifr'
import { isRawExtension } from '../../shared/types'

export interface ThumbJob {
  jobId: number
  id: string
  filePath: string
  extension: string
  outPath: string
  size: number
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

async function handle(job: ThumbJob): Promise<ThumbResult> {
  const raw = isRawExtension(job.extension)
  let input: Buffer | string = job.filePath

  if (raw) {
    try {
      const thumb = await exifr.thumbnail(job.filePath)
      if (!thumb) throw new Error('No embedded preview found in RAW file')
      input = Buffer.from(thumb)
    } catch (err) {
      return { jobId: job.jobId, id: job.id, ok: false, error: (err as Error).message }
    }
  }

  try {
    const pipeline = sharp(input, { failOn: 'none' }).rotate()
    const resized = pipeline.resize({ width: job.size, height: job.size, fit: 'inside', withoutEnlargement: true })
    const { data, info } = await resized.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    await fs.writeFile(job.outPath, data)
    return {
      jobId: job.jobId,
      id: job.id,
      ok: true,
      width: info.width,
      height: info.height
    }
  } catch (err) {
    return { jobId: job.jobId, id: job.id, ok: false, error: (err as Error).message }
  }
}
