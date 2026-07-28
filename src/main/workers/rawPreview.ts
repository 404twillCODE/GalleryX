// Many RAW formats (ARW, NEF, CR2, DNG, ...) embed multiple JPEG images: a tiny ~160px
// thumbnail (the IFD1 "thumbnail") and, in almost all cases, a much larger preview JPEG
// (often near full sensor resolution) stored elsewhere in the file. exifr's `.thumbnail()`
// only ever returns the tiny IFD1 one, which produces blurry/low-quality grid thumbnails.
//
// To get a good-quality preview without a full RAW decoder (libraw), we scan the raw bytes
// for every embedded JPEG stream (SOI...EOI) and pick the largest one — a reliable proxy for
// "highest resolution embedded preview" without parsing any RAW-specific IFD structure.
//
// Reading the *entire* RAW file (often 30-60MB) just to find a preview that's almost always
// located within the first few MB is the main reason imports/thumbnails were slow — so we read
// a bounded prefix first and only fall back to the full file in the rare case nothing usable
// turns up there.

import fs from 'node:fs/promises'

const PREFIX_BYTES = 12 * 1024 * 1024

async function readPrefix(filePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    const toRead = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(toRead)
    const { bytesRead } = await handle.read(buffer, 0, toRead, 0)
    return bytesRead === toRead ? buffer : buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/** Finds the best embedded preview JPEG for a RAW file, reading as little of the file from disk
 *  as possible. Tries a bounded prefix first (fast — covers the vast majority of RAW files),
 *  and only reads the whole file if that prefix didn't contain a good-sized preview. */
export async function extractRawPreview(filePath: string): Promise<Buffer | undefined> {
  const prefix = await readPrefix(filePath, PREFIX_BYTES)
  const fromPrefix = extractLargestEmbeddedJpeg(prefix)
  if (fromPrefix && fromPrefix.length >= GOOD_ENOUGH_PREVIEW_BYTES) return fromPrefix
  if (prefix.length < PREFIX_BYTES) return fromPrefix // we already read the whole (small) file

  const full = await fs.readFile(filePath)
  return extractLargestEmbeddedJpeg(full) ?? fromPrefix
}

const SOI = Buffer.from([0xff, 0xd8, 0xff])
const EOI = Buffer.from([0xff, 0xd9])
const MIN_CANDIDATE_BYTES = 4096

/** A JPEG this size or larger is almost certainly the "real" preview rather than the tiny IFD1
 *  thumbnail, so scanning can stop early once one is found instead of reading the rest of a
 *  30-40MB RAW file just to confirm nothing bigger exists further in. */
export const GOOD_ENOUGH_PREVIEW_BYTES = 150 * 1024

// The raw sensor data that makes up the bulk of a RAW file is essentially unstructured noise —
// unlike real JPEG entropy-coded data, it has no byte-stuffing protecting 0xFF bytes, so an
// 0xFFD8FF/0xFFD9 pair can (rarely) show up by pure chance. A real embedded preview is never
// anywhere near this large, so anything bigger is almost certainly a false match on noise and
// must be rejected — feeding a bogus multi-MB "JPEG" full of noise to sharp can make it hang for
// a very long time trying to decode nonsense dimensions/data instead of failing fast.
const MAX_CANDIDATE_BYTES = 8 * 1024 * 1024

export function extractLargestEmbeddedJpeg(buffer: Buffer): Buffer | undefined {
  let best: Buffer | undefined
  let searchFrom = 0

  while (searchFrom < buffer.length) {
    const start = buffer.indexOf(SOI, searchFrom)
    if (start === -1) break

    const end = buffer.indexOf(EOI, start + SOI.length)
    if (end === -1) break

    const segmentEnd = end + EOI.length
    const size = segmentEnd - start
    if (size >= MIN_CANDIDATE_BYTES && size <= MAX_CANDIDATE_BYTES && (!best || size > best.length)) {
      best = buffer.subarray(start, segmentEnd)
    }

    searchFrom = segmentEnd
  }

  return best
}
