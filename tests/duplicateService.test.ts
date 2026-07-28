import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeFullHash,
  computePartialHash,
  hammingDistance,
  normalizeBaseName,
  suggestKeep,
  UnionFind,
  type ScanPhoto
} from '../src/main/duplicateService'

describe('hammingDistance', () => {
  it('is zero for identical hashes', () => {
    expect(hammingDistance('ff00ff00ff00ff00', 'ff00ff00ff00ff00')).toBe(0)
  })

  it('counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1)
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64)
  })
})

describe('normalizeBaseName', () => {
  it('strips extension and lowercases', () => {
    expect(normalizeBaseName('DSC01234.ARW')).toBe('dsc01234')
    expect(normalizeBaseName('DSC01234.JPG')).toBe('dsc01234')
  })

  it('strips non-alphanumeric separators so near-variants still line up', () => {
    expect(normalizeBaseName('IMG_0001 (edit).jpg')).toBe(normalizeBaseName('IMG-0001edit.jpg'))
  })
})

describe('UnionFind', () => {
  it('groups transitively-connected items into the same component', () => {
    const uf = new UnionFind()
    uf.union('a', 'b')
    uf.union('b', 'c')
    uf.union('x', 'y')
    expect(uf.find('a')).toBe(uf.find('c'))
    expect(uf.find('a')).not.toBe(uf.find('x'))
    expect(uf.find('x')).toBe(uf.find('y'))
  })
})

function makeScanPhoto(overrides: Partial<ScanPhoto>): ScanPhoto {
  return {
    id: 'id',
    path: '/tmp/x.jpg',
    sizeBytes: 100,
    mtimeMs: 0,
    mediaType: 'image',
    extension: 'jpg',
    filename: 'x.jpg',
    folderPath: '/tmp',
    driveId: 'drive-1',
    dateTaken: null,
    cameraModel: null,
    width: 100,
    height: 100,
    durationMs: null,
    frameRate: null,
    videoCodec: null,
    isFavorite: false,
    isExport: false,
    rating: 0,
    ...overrides
  }
}

describe('suggestKeep', () => {
  it('prefers the favorite when keep_favorite is the first applicable rule', () => {
    const members = [makeScanPhoto({ id: 'a' }), makeScanPhoto({ id: 'b', isFavorite: true })]
    expect(suggestKeep(members, ['keep_favorite', 'keep_newest'])).toBe('b')
  })

  it('falls through to the next rule when the first rule finds no match', () => {
    const members = [makeScanPhoto({ id: 'a', mtimeMs: 100 }), makeScanPhoto({ id: 'b', mtimeMs: 200 })]
    // No favorites present -> keep_favorite finds nothing -> falls through to keep_newest.
    expect(suggestKeep(members, ['keep_favorite', 'keep_newest'])).toBe('b')
  })

  it('keep_highest_rating ignores members with a rating of zero', () => {
    const members = [makeScanPhoto({ id: 'a', rating: 0 }), makeScanPhoto({ id: 'b', rating: 0 })]
    expect(suggestKeep(members, ['keep_highest_rating', 'keep_oldest'])).toBe('a')
  })

  it('keep_raw prefers the RAW file over the JPEG', () => {
    const members = [makeScanPhoto({ id: 'raw', extension: 'arw' }), makeScanPhoto({ id: 'jpeg', extension: 'jpg' })]
    expect(suggestKeep(members, ['keep_raw'])).toBe('raw')
  })

  it('keep_largest picks the biggest file', () => {
    const members = [makeScanPhoto({ id: 'small', sizeBytes: 10 }), makeScanPhoto({ id: 'big', sizeBytes: 1000 })]
    expect(suggestKeep(members, ['keep_largest'])).toBe('big')
  })

  it('keep_highest_resolution compares total pixel count', () => {
    const members = [
      makeScanPhoto({ id: 'lowres', width: 100, height: 100 }),
      makeScanPhoto({ id: 'hires', width: 4000, height: 3000 })
    ]
    expect(suggestKeep(members, ['keep_highest_resolution'])).toBe('hires')
  })

  it('falls back to the first member when no rule matches anything meaningful', () => {
    const members = [makeScanPhoto({ id: 'only' })]
    expect(suggestKeep(members, [])).toBe('only')
  })
})

describe('staged exact-duplicate hashing', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galleryx-hash-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('produces identical partial and full hashes for byte-identical files', async () => {
    const content = Buffer.from('a'.repeat(200000)) // larger than PARTIAL_CHUNK_BYTES*2 to exercise head+tail sampling
    const fileA = path.join(dir, 'a.jpg')
    const fileB = path.join(dir, 'b.jpg')
    fs.writeFileSync(fileA, content)
    fs.writeFileSync(fileB, content)

    const partialA = await computePartialHash(fileA, content.length)
    const partialB = await computePartialHash(fileB, content.length)
    expect(partialA).toBe(partialB)

    const fullA = await computeFullHash(fileA)
    const fullB = await computeFullHash(fileB)
    expect(fullA).toBe(fullB)
  })

  it('produces different full hashes for files that only differ in the middle (same size, same head/tail)', async () => {
    const size = 200000
    const bufA = Buffer.alloc(size, 'a')
    const bufB = Buffer.alloc(size, 'a')
    // Flip a byte well inside the middle, outside the head/tail sample windows.
    bufB[Math.floor(size / 2)] = 0
    const fileA = path.join(dir, 'a.jpg')
    const fileB = path.join(dir, 'b.jpg')
    fs.writeFileSync(fileA, bufA)
    fs.writeFileSync(fileB, bufB)

    // The cheap partial (head+tail) hash can't see the middle-byte difference — this is exactly
    // why the spec requires a full cryptographic hash to *confirm* a duplicate, never just the
    // partial hash.
    const partialA = await computePartialHash(fileA, size)
    const partialB = await computePartialHash(fileB, size)
    expect(partialA).toBe(partialB)

    const fullA = await computeFullHash(fileA)
    const fullB = await computeFullHash(fileB)
    expect(fullA).not.toBe(fullB)
  })

  it('produces different partial hashes for files of different sizes/content', async () => {
    const fileA = path.join(dir, 'a.jpg')
    const fileB = path.join(dir, 'b.jpg')
    fs.writeFileSync(fileA, Buffer.from('hello world'))
    fs.writeFileSync(fileB, Buffer.from('goodbye world'))
    const partialA = await computePartialHash(fileA, 11)
    const partialB = await computePartialHash(fileB, 13)
    expect(partialA).not.toBe(partialB)
  })
})
