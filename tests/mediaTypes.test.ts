import { describe, expect, it } from 'vitest'
import { isRawExtension, isVideoExtension, mediaTypeForExtension, SUPPORTED_EXTENSIONS, VIDEO_EXTENSIONS } from '../src/shared/types'

describe('video format recognition', () => {
  it('recognizes common video containers regardless of case or a leading dot', () => {
    for (const ext of ['mp4', 'MP4', '.mov', 'mkv', 'webm', 'm4v', 'avi', 'wmv', 'mts', 'm2ts', 'ts', '3gp', 'flv', 'mxf']) {
      expect(isVideoExtension(ext)).toBe(true)
    }
  })

  it('does not classify image extensions as video', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'heic', 'arw', 'cr2', 'dng']) {
      expect(isVideoExtension(ext)).toBe(false)
    }
  })

  it('maps extensions to the correct MediaType', () => {
    expect(mediaTypeForExtension('mp4')).toBe('video')
    expect(mediaTypeForExtension('mov')).toBe('video')
    expect(mediaTypeForExtension('jpg')).toBe('image')
    expect(mediaTypeForExtension('arw')).toBe('image')
  })

  it('recognizes RAW formats independently of video detection', () => {
    for (const ext of ['arw', 'cr2', 'cr3', 'nef', 'nrw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw']) {
      expect(isRawExtension(ext)).toBe(true)
      expect(isVideoExtension(ext)).toBe(false)
    }
  })

  it('SUPPORTED_EXTENSIONS is the union of image and video extensions with no duplicates', () => {
    const unique = new Set(SUPPORTED_EXTENSIONS)
    expect(unique.size).toBe(SUPPORTED_EXTENSIONS.length)
    for (const ext of VIDEO_EXTENSIONS) expect(SUPPORTED_EXTENSIONS.includes(ext)).toBe(true)
  })
})
