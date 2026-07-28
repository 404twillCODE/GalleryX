import { Worker } from 'node:worker_threads'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import type { GalleryDatabase } from './db'
import type { ThumbJob, ThumbResult } from './workers/thumbnailWorker'
import type { VideoThumbPosition } from './workers/videoFrame'
import type { MediaType } from '../shared/types'

export type ThumbTier = 'thumb' | 'preview'

const TIER_SIZE: Record<ThumbTier, number> = {
  thumb: 512,
  preview: 2048
}

// Thumbnail jobs now read a small bounded prefix of each RAW file (see rawPreview.ts) instead
// of the whole 30-60MB file, so they're far lighter on disk I/O than before — a larger pool
// keeps more CPU cores busy decoding/resizing without saturating the drive.
const POOL_SIZE = Math.max(2, Math.min(8, os.cpus().length - 1))
const BATCH_LOOKAHEAD = 80
const DEFAULT_JOB_TIMEOUT_MS = 25000

interface QueueItem {
  id: string
  path: string
  extension: string
  tier: ThumbTier
  mediaType: MediaType
}

export class ThumbnailService {
  private pool: Worker[] = []
  private busy = new Set<Worker>()
  private waiters: ((worker: Worker) => void)[] = []
  private nextJobId = 1
  private inFlight = new Map<number, { item: QueueItem; resolve: (r: ThumbResult) => void }>()
  private hotIds: string[] = []
  private coldCursorActive = false
  private stopped = false
  private cacheBytes = 0
  private cacheBytesReady = false
  private readonly cacheSizeLimitBytes: () => number

  constructor(
    private db: GalleryDatabase,
    private workerScriptPath: string,
    private cacheDir: string,
    cacheSizeLimitMB: () => number,
    private onThumbsReady: (ids: string[], tier: ThumbTier) => void,
    private videoThumbPosition: () => VideoThumbPosition = () => 'ten-percent'
  ) {
    this.cacheSizeLimitBytes = () => cacheSizeLimitMB() * 1024 * 1024
    for (const tier of ['thumb', 'preview'] as ThumbTier[]) {
      fs.mkdirSync(path.join(this.cacheDir, tier), { recursive: true })
    }
    void this.primeCacheSize()
  }

  private async primeCacheSize(): Promise<void> {
    let total = 0
    for (const tier of ['thumb', 'preview'] as ThumbTier[]) {
      total += await dirSize(path.join(this.cacheDir, tier))
    }
    this.cacheBytes = total
    this.cacheBytesReady = true
  }

  start(): void {
    // Rows can be left stuck in 'processing' if the app was closed/crashed mid-batch. They'd
    // never be picked up again otherwise (getPendingThumbs only looks at 'pending'), silently
    // shrinking the effective queue over repeated runs.
    this.db.resetStuckProcessing()
    for (let i = 0; i < POOL_SIZE; i++) {
      const worker = new Worker(this.workerScriptPath)
      worker.on('message', (result: ThumbResult) => this.handleResult(worker, result))
      worker.on('error', (err) => console.error('[thumbnail worker error]', err))
      this.pool.push(worker)
    }
    void this.driveLoop()
  }

  stop(): void {
    this.stopped = true
    this.pool.forEach((w) => void w.terminate())
  }

  cachePathFor(id: string, tier: ThumbTier): string {
    return path.join(this.cacheDir, tier, id.slice(0, 2), `${id}.webp`)
  }

  hasCached(id: string, tier: ThumbTier): boolean {
    return fs.existsSync(this.cachePathFor(id, tier))
  }

  prioritize(ids: string[]): void {
    this.hotIds = ids
  }

  /** Requests a preview-tier thumbnail be generated (used by the full viewer), returns once done.
   *  If the whole worker pool is busy with background thumbnail generation (the common case with
   *  a large library), this waits for the next worker to free up instead of failing immediately —
   *  it jumps to the front of the line ahead of queued background jobs since it's interactive. */
  async requestPreview(id: string): Promise<string | null> {
    const outPath = this.cachePathFor(id, 'preview')
    if (fs.existsSync(outPath)) return outPath
    const [photo] = this.db.getPhotosByIds([id])
    if (!photo) return null
    const result = await this.runJob(
      { id: photo.id, path: photo.path, extension: photo.extension, tier: 'preview', mediaType: photo.mediaType },
      { priority: true, timeoutMs: 20000 }
    )
    return result.ok ? outPath : null
  }

  private acquireWorker(opts?: { priority?: boolean; timeoutMs?: number }): Promise<Worker | undefined> {
    const free = this.pool.find((w) => !this.busy.has(w))
    if (free) {
      this.busy.add(free)
      return Promise.resolve(free)
    }
    return new Promise((resolve) => {
      let settled = false
      const waiter = (worker: Worker): void => {
        if (settled) return
        settled = true
        resolve(worker)
      }
      if (opts?.priority) this.waiters.unshift(waiter)
      else this.waiters.push(waiter)

      if (opts?.timeoutMs) {
        setTimeout(() => {
          if (settled) return
          settled = true
          const idx = this.waiters.indexOf(waiter)
          if (idx !== -1) this.waiters.splice(idx, 1)
          resolve(undefined)
        }, opts.timeoutMs)
      }
    })
  }

  private releaseWorker(worker: Worker): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter(worker)
    } else {
      this.busy.delete(worker)
    }
  }

  private async driveLoop(): Promise<void> {
    while (!this.stopped) {
      const availableWorkers = this.pool.filter((w) => !this.busy.has(w))
      if (availableWorkers.length === 0) {
        await sleep(50)
        continue
      }

      const batch = this.buildBatch(availableWorkers.length)
      if (batch.length === 0) {
        await sleep(400)
        continue
      }

      this.db.markThumbStatusBulk(batch.map((b) => b.id), 'processing')
      const readyIds: string[] = []
      await Promise.all(
        batch.map(async (item) => {
          const result = await this.runJob(item)
          if (result.ok) {
            this.db.markThumbStatus(item.id, 'ready')
            if (result.width && result.height) this.db.setFallbackDimensions(item.id, result.width, result.height)
            readyIds.push(item.id)
            try {
              const size = fs.statSync(item.tier === 'thumb' ? this.cachePathFor(item.id, 'thumb') : this.cachePathFor(item.id, 'preview')).size
              this.cacheBytes += size
            } catch {
              /* ignore */
            }
          } else {
            this.db.markThumbStatus(item.id, 'failed')
          }
        })
      )
      if (readyIds.length) this.onThumbsReady(readyIds, 'thumb')
      this.maybeEvict()
    }
  }

  private buildBatch(count: number): QueueItem[] {
    const items: QueueItem[] = []
    const seen = new Set<string>()

    if (this.hotIds.length) {
      const candidates = this.db.getPhotosByIds(this.hotIds)
      const byId = new Map(candidates.map((c) => [c.id, c]))
      for (const id of this.hotIds) {
        if (items.length >= count) break
        const c = byId.get(id)
        // Skip anything already generated (or currently being generated) — otherwise the
        // photos visible on screen keep monopolizing every batch forever (prioritize() gets
        // called repeatedly with the same visible ids while the user isn't scrolling), starving
        // the rest of the library and making it look like generation has stalled entirely.
        if (!c || seen.has(id) || c.thumbStatus === 'ready' || c.thumbStatus === 'processing') continue
        seen.add(id)
        items.push({ id: c.id, path: c.path, extension: c.extension, tier: 'thumb', mediaType: c.mediaType })
      }
    }

    if (items.length < count) {
      const pending = this.db.getPendingThumbs(Math.max(BATCH_LOOKAHEAD, count))
      for (const p of pending) {
        if (items.length >= count) break
        if (seen.has(p.id)) continue
        seen.add(p.id)
        items.push({ id: p.id, path: p.path, extension: p.extension, tier: 'thumb', mediaType: p.mediaType })
      }
    }

    return items
  }

  private async runJob(
    item: QueueItem,
    opts?: { priority?: boolean; timeoutMs?: number }
  ): Promise<ThumbResult> {
    const worker = await this.acquireWorker(opts)
    if (!worker) {
      return { jobId: -1, id: item.id, ok: false, error: 'timed out waiting for a free worker' }
    }
    // Every job gets a hard timeout — a single unexpectedly slow/stuck file (permission prompt,
    // flaky external drive, weird corrupt data) must never be able to wedge the whole batch:
    // driveLoop awaits Promise.all() over a batch, so one job that never resolves would silently
    // stall thumbnail generation for the entire library forever.
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS
    return new Promise((resolve) => {
      const jobId = this.nextJobId++
      let settled = false

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.inFlight.delete(jobId)
        this.replaceHungWorker(worker)
        resolve({ jobId, id: item.id, ok: false, error: 'thumbnail job timed out' })
      }, timeoutMs)

      this.inFlight.set(jobId, {
        item,
        resolve: (r) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(r)
        }
      })

      const outPath = this.cachePathFor(item.id, item.tier)
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      const job: ThumbJob = {
        jobId,
        id: item.id,
        filePath: item.path,
        extension: item.extension,
        outPath,
        size: TIER_SIZE[item.tier],
        mediaType: item.mediaType,
        videoThumbPosition: this.videoThumbPosition()
      }
      worker.postMessage(job)
    })
  }

  /** Called when a job on this worker timed out — we can no longer trust it to ever respond
   *  (it may be permanently stuck), so swap it out for a fresh one rather than leaking a pool
   *  slot forever. */
  private replaceHungWorker(worker: Worker): void {
    const idx = this.pool.indexOf(worker)
    if (idx === -1) return // already replaced, or a result arrived and released it normally
    this.pool.splice(idx, 1)
    this.busy.delete(worker)
    try {
      void worker.terminate()
    } catch {
      /* ignore */
    }
    const replacement = new Worker(this.workerScriptPath)
    replacement.on('message', (result: ThumbResult) => this.handleResult(replacement, result))
    replacement.on('error', (err) => console.error('[thumbnail worker error]', err))
    this.pool.push(replacement)
  }

  private handleResult(worker: Worker, result: ThumbResult): void {
    const pending = this.inFlight.get(result.jobId)
    if (pending) {
      this.inFlight.delete(result.jobId)
      pending.resolve(result)
    }
    // If this worker was already swapped out due to a timeout, it's no longer part of the pool
    // — don't hand it back out to a waiter or re-track it as available.
    if (this.pool.includes(worker)) this.releaseWorker(worker)
  }

  private maybeEvict(): void {
    if (!this.cacheBytesReady) return
    if (this.cacheBytes <= this.cacheSizeLimitBytes()) return
    void this.evict()
  }

  private evicting = false
  private async evict(): Promise<void> {
    if (this.evicting) return
    this.evicting = true
    try {
      const files: { path: string; size: number; mtime: number; id: string }[] = []
      for (const tier of ['thumb', 'preview'] as ThumbTier[]) {
        const dir = path.join(this.cacheDir, tier)
        await collectFiles(dir, files)
      }
      files.sort((a, b) => a.mtime - b.mtime)
      const target = this.cacheSizeLimitBytes() * 0.9
      let total = files.reduce((s, f) => s + f.size, 0)
      const invalidated: string[] = []
      for (const f of files) {
        if (total <= target) break
        try {
          await fsp.unlink(f.path)
          total -= f.size
          invalidated.push(f.id)
        } catch {
          /* ignore */
        }
      }
      this.cacheBytes = total
      if (invalidated.length) this.db.markThumbStatusBulk(invalidated, 'pending')
    } finally {
      this.evicting = false
    }
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) total += await dirSize(full)
      else {
        try {
          total += (await fsp.stat(full)).size
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* directory may not exist yet */
  }
  return total
}

async function collectFiles(
  dir: string,
  out: { path: string; size: number; mtime: number; id: string }[]
): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(full, out)
    } else if (entry.name.endsWith('.webp')) {
      try {
        const stat = await fsp.stat(full)
        out.push({ path: full, size: stat.size, mtime: stat.mtimeMs, id: entry.name.replace(/\.webp$/, '') })
      } catch {
        /* ignore */
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
