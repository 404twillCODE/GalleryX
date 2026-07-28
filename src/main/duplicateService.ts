import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsClassic from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { GalleryDatabase } from './db'
import type { DuplicateScanOptions, DuplicateScanProgress, KeepRule } from '../shared/types'
import { isRawExtension, SIMILARITY_HAMMING_LIMIT } from '../shared/types'
import { extractRawPreview } from './workers/rawPreview'

export type ScanPhoto = ReturnType<GalleryDatabase['getPhotosForDuplicateScan']>[number]

export type DuplicateProgressCallback = (progress: DuplicateScanProgress) => void

const PARTIAL_CHUNK_BYTES = 65536 // 64KB head + tail — enough to disambiguate almost all
// non-identical files without reading the whole thing, per the staged-hashing requirement.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function computePartialHash(filePath: string, sizeBytes: number): Promise<string> {
  const hash = crypto.createHash('sha1')
  const fh = await fs.open(filePath, 'r')
  try {
    const headSize = Math.min(PARTIAL_CHUNK_BYTES, sizeBytes)
    const head = Buffer.alloc(headSize)
    await fh.read(head, 0, headSize, 0)
    hash.update(head)
    if (sizeBytes > PARTIAL_CHUNK_BYTES * 2) {
      const tailSize = Math.min(PARTIAL_CHUNK_BYTES, sizeBytes)
      const tail = Buffer.alloc(tailSize)
      await fh.read(tail, 0, tailSize, Math.max(0, sizeBytes - tailSize))
      hash.update(tail)
    }
  } finally {
    await fh.close()
  }
  return hash.digest('hex')
}

export async function computeFullHash(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = fsClassic.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk as Buffer))
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

/** 64-bit average-hash (aHash): cheap, rotation/scale-naive but effective for the kinds of
 *  near-duplicates this feature targets (recompression, minor resize, crop, watermark, color
 *  grade) once compared with a generous Hamming-distance threshold. */
export async function computePerceptualHash(filePath: string, extension: string): Promise<string | null> {
  try {
    const input = isRawExtension(extension) ? (await extractRawPreview(filePath).catch(() => undefined)) ?? filePath : filePath
    const { data } = await sharp(input, { failOn: 'none' })
      .greyscale()
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const pixels = Array.from(data)
    if (!pixels.length) return null
    const avg = pixels.reduce((s, v) => s + v, 0) / pixels.length
    let bits = 0n
    for (const v of pixels) bits = (bits << 1n) | (v >= avg ? 1n : 0n)
    return bits.toString(16).padStart(16, '0')
  } catch {
    return null
  }
}

export function hammingDistance(hexA: string, hexB: string): number {
  let a = BigInt('0x' + hexA)
  let b = BigInt('0x' + hexB)
  let x = a ^ b
  let count = 0
  while (x > 0n) {
    count += Number(x & 1n)
    x >>= 1n
  }
  return count
}

export function normalizeBaseName(filename: string): string {
  return path.parse(filename).name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Simple union-find so pairwise "similar" comparisons collapse into connected-component
 *  groups instead of duplicate/overlapping pairs. */
export class UnionFind {
  private parent = new Map<string, string>()
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    let root = x
    while (this.parent.get(root) !== root) root = this.parent.get(root)!
    this.parent.set(x, root)
    return root
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

export class DuplicateService {
  private cancelled = new Set<string>()
  private paused = new Set<string>()

  constructor(private db: GalleryDatabase) {}

  cancelScan(sessionId: string): void {
    this.cancelled.add(sessionId)
  }

  pauseScan(sessionId: string): void {
    this.paused.add(sessionId)
    this.db.setDuplicateSessionStatus(sessionId, 'paused')
  }

  resumeScan(sessionId: string): void {
    this.paused.delete(sessionId)
    this.db.setDuplicateSessionStatus(sessionId, 'running')
  }

  private async checkpoint(sessionId: string): Promise<boolean> {
    while (this.paused.has(sessionId) && !this.cancelled.has(sessionId)) {
      await sleep(250)
    }
    return this.cancelled.has(sessionId)
  }

  startScan(options: DuplicateScanOptions, onProgress: DuplicateProgressCallback): string {
    const sessionId = this.db.createDuplicateSession(options)
    void this.runScan(sessionId, options, onProgress)
    return sessionId
  }

  private emit(sessionId: string, onProgress: DuplicateProgressCallback, partial: Omit<DuplicateScanProgress, 'sessionId'>): void {
    const progress: DuplicateScanProgress = { sessionId, ...partial }
    const dbStatus = partial.phase === 'done' ? 'done' : partial.phase === 'error' ? 'error' : partial.phase === 'cancelled' ? 'cancelled' : 'running'
    this.db.setDuplicateSessionStatus(sessionId, dbStatus, JSON.stringify(progress))
    onProgress(progress)
  }

  private async runScan(sessionId: string, options: DuplicateScanOptions, onProgress: DuplicateProgressCallback): Promise<void> {
    try {
      const media = options.media
      const scopeArg: { driveId?: string; folderPath?: string; includeSubfolders?: boolean; media: 'photos' | 'videos' | 'both' } = { media }
      if (options.scope.kind === 'drive') scopeArg.driveId = options.scope.driveId
      if (options.scope.kind === 'folder') {
        scopeArg.driveId = options.scope.driveId
        scopeArg.folderPath = options.scope.path
        scopeArg.includeSubfolders = options.includeSubfolders
      }

      const photos = this.db.getPhotosForDuplicateScan(scopeArg)
      const total = photos.length
      let groupsFound = 0
      let filesScanned = 0

      this.emit(sessionId, onProgress, { phase: 'sizing', filesScanned, filesTotal: total, groupsFound })
      if (await this.checkpoint(sessionId)) return this.emit(sessionId, onProgress, { phase: 'cancelled', filesScanned, filesTotal: total, groupsFound })

      if (options.exactDuplicates) {
        const result = await this.findExactDuplicates(sessionId, photos, onProgress, total)
        groupsFound += result
      }
      if (await this.checkpoint(sessionId)) return this.emit(sessionId, onProgress, { phase: 'cancelled', filesScanned, filesTotal: total, groupsFound })

      if (options.rawJpegPairs && media !== 'videos') {
        groupsFound += this.findRawJpegPairs(sessionId, photos)
      }
      groupsFound += this.findBurstGroups(sessionId, photos)
      if (media !== 'photos') groupsFound += this.findSimilarVideos(sessionId, photos)
      if (await this.checkpoint(sessionId)) return this.emit(sessionId, onProgress, { phase: 'cancelled', filesScanned, filesTotal: total, groupsFound })

      if (options.similarImages && media !== 'videos') {
        this.emit(sessionId, onProgress, { phase: 'perceptual', filesScanned, filesTotal: total, groupsFound })
        groupsFound += await this.findSimilarImages(sessionId, photos, options.similarityThreshold, sessionId, onProgress, total, groupsFound)
      }

      this.emit(sessionId, onProgress, { phase: 'done', filesScanned: total, filesTotal: total, groupsFound })
    } catch (err) {
      console.error('[duplicateService] scan failed', err)
      this.emit(sessionId, onProgress, { phase: 'error', filesScanned: 0, filesTotal: 0, groupsFound: 0, error: (err as Error).message })
    }
  }

  // ---------------- Stage 1+2+3: staged exact-hash pipeline ----------------

  private async findExactDuplicates(
    sessionId: string,
    photos: ScanPhoto[],
    onProgress: DuplicateProgressCallback,
    total: number
  ): Promise<number> {
    // Stage 1: group by file size — only sizes shared by 2+ files can possibly be duplicates.
    const bySize = new Map<number, ScanPhoto[]>()
    for (const p of photos) {
      if (p.sizeBytes <= 0) continue
      const list = bySize.get(p.sizeBytes)
      if (list) list.push(p)
      else bySize.set(p.sizeBytes, [p])
    }
    const sizeCandidates = Array.from(bySize.values()).filter((g) => g.length > 1)

    this.emit(sessionId, onProgress, { phase: 'partial-hash', filesScanned: 0, filesTotal: total, groupsFound: 0 })

    // Stage 2: partial hash within each size group (using the cache when size+mtime match).
    const byPartial = new Map<string, ScanPhoto[]>()
    let scanned = 0
    for (const group of sizeCandidates) {
      if (this.cancelled.has(sessionId)) break
      for (const p of group) {
        const cached = this.db.getHash(p.id)
        let partial: string
        if (cached && cached.sizeBytes === p.sizeBytes && cached.mtimeMs === p.mtimeMs && cached.partialHash) {
          partial = cached.partialHash
        } else {
          try {
            partial = await computePartialHash(p.path, p.sizeBytes)
            this.db.upsertHash(p.id, { sizeBytes: p.sizeBytes, mtimeMs: p.mtimeMs, partialHash: partial })
          } catch {
            continue
          }
        }
        const key = `${p.sizeBytes}:${partial}`
        const list = byPartial.get(key)
        if (list) list.push(p)
        else byPartial.set(key, [p])
        scanned++
        if (scanned % 50 === 0) this.emit(sessionId, onProgress, { phase: 'partial-hash', filesScanned: scanned, filesTotal: total, groupsFound: 0 })
      }
    }

    const partialCandidates = Array.from(byPartial.values()).filter((g) => g.length > 1)

    this.emit(sessionId, onProgress, { phase: 'full-hash', filesScanned: 0, filesTotal: partialCandidates.flat().length, groupsFound: 0 })

    // Stage 3: full cryptographic hash — this is the only stage strong enough to *confirm* an
    // exact duplicate; everything before it just narrows the candidate pool cheaply.
    const byFull = new Map<string, ScanPhoto[]>()
    scanned = 0
    for (const group of partialCandidates) {
      if (this.cancelled.has(sessionId)) break
      for (const p of group) {
        const cached = this.db.getHash(p.id)
        let full: string
        if (cached && cached.sizeBytes === p.sizeBytes && cached.mtimeMs === p.mtimeMs && cached.fullHash) {
          full = cached.fullHash
        } else {
          try {
            full = await computeFullHash(p.path)
            this.db.upsertHash(p.id, { sizeBytes: p.sizeBytes, mtimeMs: p.mtimeMs, fullHash: full })
          } catch {
            continue
          }
        }
        const list = byFull.get(full)
        if (list) list.push(p)
        else byFull.set(full, [p])
        scanned++
        if (scanned % 25 === 0) this.emit(sessionId, onProgress, { phase: 'full-hash', filesScanned: scanned, filesTotal: partialCandidates.flat().length, groupsFound: 0 })
      }
    }

    let groups = 0
    for (const list of byFull.values()) {
      if (list.length < 2) continue
      const kind = list[0].mediaType === 'video' ? 'video' : 'exact'
      const groupId = this.db.createDuplicateGroup(sessionId, kind)
      const suggestion = suggestKeep(list, ['keep_favorite', 'keep_highest_rating', 'keep_export', 'keep_newest'])
      list.forEach((p) => this.db.addDuplicateGroupMember(groupId, p.id, null, p.id === suggestion))
      groups++
    }
    return groups
  }

  // ---------------- RAW + JPEG pairing ----------------

  private findRawJpegPairs(sessionId: string, photos: ScanPhoto[]): number {
    const raws = photos.filter((p) => p.mediaType === 'image' && isRawExtension(p.extension))
    const rasters = photos.filter((p) => p.mediaType === 'image' && !isRawExtension(p.extension))
    const rasterByKey = new Map<string, ScanPhoto[]>()
    for (const r of rasters) {
      const key = `${normalizeBaseName(r.filename)}|${r.folderPath}`
      const list = rasterByKey.get(key)
      if (list) list.push(r)
      else rasterByKey.set(key, [r])
    }

    let groups = 0
    const usedRasters = new Set<string>()
    for (const raw of raws) {
      const key = `${normalizeBaseName(raw.filename)}|${raw.folderPath}`
      const candidates = rasterByKey.get(key)
      if (!candidates?.length) continue
      const match =
        candidates.find((c) => !usedRasters.has(c.id) && raw.dateTaken && c.dateTaken && raw.dateTaken === c.dateTaken) ??
        candidates.find((c) => !usedRasters.has(c.id))
      if (!match) continue
      usedRasters.add(match.id)
      const groupId = this.db.createDuplicateGroup(sessionId, 'raw_jpeg')
      // Neither file is "suggested" for deletion by default — RAW/JPEG pairs are frequently
      // both wanted (original + delivered copy), so the review UI's quick actions (Keep RAW /
      // Keep JPEG / Keep Both) drive the actual selection rather than an automatic suggestion.
      this.db.addDuplicateGroupMember(groupId, raw.id, 'raw', false)
      this.db.addDuplicateGroupMember(groupId, match.id, 'jpeg', false)
      groups++
    }
    return groups
  }

  // ---------------- Burst groups ----------------

  private findBurstGroups(sessionId: string, photos: ScanPhoto[]): number {
    const eligible = photos
      .filter((p) => p.mediaType === 'image' && p.dateTaken)
      .sort((a, b) => new Date(a.dateTaken!).getTime() - new Date(b.dateTaken!).getTime())

    let groups = 0
    let cluster: ScanPhoto[] = []
    const flush = (): void => {
      if (cluster.length >= 3) {
        const groupId = this.db.createDuplicateGroup(sessionId, 'burst')
        cluster.forEach((p, i) => this.db.addDuplicateGroupMember(groupId, p.id, null, i === 0))
        groups++
      }
      cluster = []
    }
    for (const p of eligible) {
      const prev = cluster[cluster.length - 1]
      if (!prev) {
        cluster.push(p)
        continue
      }
      const gapMs = new Date(p.dateTaken!).getTime() - new Date(prev.dateTaken!).getTime()
      if (gapMs <= 2000 && p.cameraModel === prev.cameraModel && p.folderPath === prev.folderPath) {
        cluster.push(p)
      } else {
        flush()
        cluster.push(p)
      }
    }
    flush()
    return groups
  }

  // ---------------- Similar (re-encoded) videos ----------------

  private findSimilarVideos(sessionId: string, photos: ScanPhoto[]): number {
    const videos = photos.filter((p) => p.mediaType === 'video' && p.durationMs)
    const uf = new UnionFind()
    for (let i = 0; i < videos.length; i++) {
      for (let j = i + 1; j < videos.length; j++) {
        const a = videos[i]
        const b = videos[j]
        if (a.path === b.path) continue
        const durationClose = Math.abs((a.durationMs ?? 0) - (b.durationMs ?? 0)) <= 1500
        const resolutionMatch = a.width === b.width && a.height === b.height
        if (durationClose && resolutionMatch) uf.union(a.id, b.id)
      }
    }
    const clusters = new Map<string, ScanPhoto[]>()
    for (const v of videos) {
      const root = uf.find(v.id)
      const list = clusters.get(root)
      if (list) list.push(v)
      else clusters.set(root, [v])
    }
    let groups = 0
    for (const list of clusters.values()) {
      if (list.length < 2) continue
      const groupId = this.db.createDuplicateGroup(sessionId, 'video')
      const suggestion = suggestKeep(list, ['keep_favorite', 'keep_highest_rating', 'keep_largest'])
      list.forEach((p) => this.db.addDuplicateGroupMember(groupId, p.id, null, p.id === suggestion))
      groups++
    }
    return groups
  }

  // ---------------- Similar images (perceptual hash) ----------------

  private async findSimilarImages(
    sessionId: string,
    photos: ScanPhoto[],
    threshold: keyof typeof SIMILARITY_HAMMING_LIMIT,
    progressSessionId: string,
    onProgress: DuplicateProgressCallback,
    total: number,
    groupsSoFar: number
  ): Promise<number> {
    const images = photos.filter((p) => p.mediaType === 'image')
    const hashes: { photo: ScanPhoto; hash: string }[] = []
    let scanned = 0
    for (const p of images) {
      if (this.cancelled.has(sessionId)) break
      const cached = this.db.getHash(p.id)
      let phash: string | null
      if (cached && cached.sizeBytes === p.sizeBytes && cached.mtimeMs === p.mtimeMs && cached.phash) {
        phash = cached.phash
      } else {
        phash = await computePerceptualHash(p.path, p.extension)
        if (phash) this.db.upsertHash(p.id, { sizeBytes: p.sizeBytes, mtimeMs: p.mtimeMs, phash })
      }
      if (phash) hashes.push({ photo: p, hash: phash })
      scanned++
      if (scanned % 100 === 0) this.emit(progressSessionId, onProgress, { phase: 'perceptual', filesScanned: scanned, filesTotal: images.length, groupsFound: groupsSoFar })
    }

    // Bucket by the top 12 bits of the hash so we only ever do full pairwise Hamming-distance
    // comparisons within a bucket (near-duplicates share most high-order bits) — this keeps the
    // comparison cost roughly linear instead of O(n^2) across a 100k-photo library.
    const buckets = new Map<number, { photo: ScanPhoto; hash: string }[]>()
    for (const entry of hashes) {
      const key = Number(BigInt('0x' + entry.hash) >> 52n)
      const list = buckets.get(key)
      if (list) list.push(entry)
      else buckets.set(key, [entry])
    }

    const limit = SIMILARITY_HAMMING_LIMIT[threshold]
    const uf = new UnionFind()
    for (const bucket of buckets.values()) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          if (bucket[i].photo.path === bucket[j].photo.path) continue
          if (hammingDistance(bucket[i].hash, bucket[j].hash) <= limit) {
            uf.union(bucket[i].photo.id, bucket[j].photo.id)
          }
        }
      }
    }

    const clusters = new Map<string, ScanPhoto[]>()
    for (const entry of hashes) {
      const root = uf.find(entry.photo.id)
      const list = clusters.get(root)
      if (list) list.push(entry.photo)
      else clusters.set(root, [entry.photo])
    }

    let groups = 0
    for (const list of clusters.values()) {
      if (list.length < 2) continue
      const groupId = this.db.createDuplicateGroup(sessionId, 'similar')
      // Similar images are never auto-suggested for deletion — visual similarity alone is not
      // proof of redundancy (could be a deliberate edit/export). suggestedKeep is left false for
      // all members; the user decides.
      list.forEach((p) => this.db.addDuplicateGroupMember(groupId, p.id, null, false))
      groups++
    }
    return groups
  }

}

// ---------------- Suggestion rules ----------------

/** Pure — exported standalone (rather than a private method) so the rule precedence can be
 *  unit-tested directly without spinning up a database or a full scan. */
export function suggestKeep(members: ScanPhoto[], rules: KeepRule[]): string {
  for (const rule of rules) {
    const sorted = [...members]
    switch (rule) {
      case 'keep_favorite': {
        const fav = sorted.find((m) => m.isFavorite)
        if (fav) return fav.id
        break
      }
      case 'keep_highest_rating': {
        const maxRating = Math.max(...sorted.map((m) => m.rating))
        if (maxRating > 0) return sorted.find((m) => m.rating === maxRating)!.id
        break
      }
      case 'keep_export': {
        const exp = sorted.find((m) => m.isExport)
        if (exp) return exp.id
        break
      }
      case 'keep_raw': {
        const raw = sorted.find((m) => isRawExtension(m.extension))
        if (raw) return raw.id
        break
      }
      case 'keep_jpeg': {
        const jpeg = sorted.find((m) => !isRawExtension(m.extension))
        if (jpeg) return jpeg.id
        break
      }
      case 'keep_largest':
        return sorted.sort((a, b) => b.sizeBytes - a.sizeBytes)[0].id
      case 'keep_highest_resolution':
        return sorted.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0].id
      case 'keep_newest':
        return sorted.sort((a, b) => b.mtimeMs - a.mtimeMs)[0].id
      case 'keep_oldest':
        return sorted.sort((a, b) => a.mtimeMs - b.mtimeMs)[0].id
      default:
        break
    }
  }
  return members[0].id
}
