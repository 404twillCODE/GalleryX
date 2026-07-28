import type { GalleryDatabase } from './db'
import { extractMetadata } from './metadata'
import { probeVideo } from './videoProbe'
import type { MediaType } from '../shared/types'

const BATCH_SIZE = 40
const CONCURRENCY = 6
const IDLE_DELAY_MS = 700

export class MetadataService {
  private running = false
  private stopped = false

  constructor(
    private db: GalleryDatabase,
    private onBatchDone: () => void
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.stopped = false
    void this.loop()
  }

  stop(): void {
    this.stopped = true
  }

  wake(): void {
    if (!this.running) this.start()
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const pending = this.db.getPendingMeta(BATCH_SIZE)
      if (pending.length === 0) {
        await sleep(IDLE_DELAY_MS)
        continue
      }
      this.db.markMetaProcessing(pending.map((p) => p.id))

      let i = 0
      const results: { id: string; ok: boolean }[] = []
      const workers = Array.from({ length: CONCURRENCY }, () => this.worker(pending, () => i++, results))
      await Promise.all(workers)

      this.onBatchDone()
    }
    this.running = false
  }

  private async worker(
    items: { id: string; path: string; extension: string; isRaw: boolean; mediaType: MediaType }[],
    next: () => number,
    results: { id: string; ok: boolean }[]
  ): Promise<void> {
    for (;;) {
      const idx = next()
      if (idx >= items.length) return
      const item = items[idx]
      try {
        if (item.mediaType === 'video') {
          const v = await probeVideo(item.path)
          this.db.applyMetadata(
            item.id,
            {
              width: v.width,
              height: v.height,
              dateTaken: v.dateTaken,
              orientation: v.orientation,
              durationMs: v.durationMs,
              videoCodec: v.videoCodec,
              audioCodec: v.audioCodec,
              container: v.container,
              frameRate: v.frameRate,
              bitrate: v.bitrate,
              codecSupported: v.codecSupported
            },
            'done'
          )
        } else {
          const meta = await extractMetadata(item.path, item.extension)
          this.db.applyMetadata(item.id, meta, 'done')
        }
        results.push({ id: item.id, ok: true })
      } catch {
        this.db.applyMetadata(item.id, {}, 'failed')
        results.push({ id: item.id, ok: false })
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
