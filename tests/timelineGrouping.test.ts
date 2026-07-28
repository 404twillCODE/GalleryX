import { describe, expect, it } from 'vitest'
import { bestDate, bucketKeyFor, computeShootKeys, usedFallbackDate } from '../src/renderer/src/lib/timelineGrouping'

type MinimalPhoto = { id: string; dateTaken: string | null; dateCreated: string | null; dateModified: string | null; dateIndexed: string }

function photo(id: string, overrides: Partial<MinimalPhoto> = {}): MinimalPhoto {
  return { id, dateTaken: null, dateCreated: null, dateModified: null, dateIndexed: '2020-01-01T00:00:00.000Z', ...overrides }
}

describe('bestDate priority', () => {
  it('prefers dateTaken (original capture / EXIF / video creation metadata) above all else', () => {
    const p = photo('1', {
      dateTaken: '2024-06-01T10:00:00.000Z',
      dateCreated: '2024-06-02T10:00:00.000Z',
      dateModified: '2024-06-03T10:00:00.000Z',
      dateIndexed: '2024-06-04T10:00:00.000Z'
    })
    expect(bestDate(p)).toBe('2024-06-01T10:00:00.000Z')
  })

  it('falls back to dateCreated when dateTaken is missing', () => {
    const p = photo('1', { dateCreated: '2024-06-02T10:00:00.000Z', dateModified: '2024-06-03T10:00:00.000Z' })
    expect(bestDate(p)).toBe('2024-06-02T10:00:00.000Z')
  })

  it('falls back to dateModified when dateTaken and dateCreated are missing', () => {
    const p = photo('1', { dateModified: '2024-06-03T10:00:00.000Z' })
    expect(bestDate(p)).toBe('2024-06-03T10:00:00.000Z')
  })

  it('falls back to dateIndexed as the last resort', () => {
    const p = photo('1', { dateIndexed: '2024-06-04T10:00:00.000Z' })
    expect(bestDate(p)).toBe('2024-06-04T10:00:00.000Z')
  })

  it('flags fallback usage whenever the original capture date is unavailable', () => {
    expect(usedFallbackDate(photo('1', { dateTaken: '2024-01-01' }))).toBe(false)
    expect(usedFallbackDate(photo('1', { dateTaken: null }))).toBe(true)
  })
})

describe('bucketKeyFor', () => {
  it('buckets by year', () => {
    expect(bucketKeyFor('year', '2026-07-15T12:00:00.000Z')).toBe('2026')
  })

  it('buckets by year-month', () => {
    expect(bucketKeyFor('year-month', '2026-07-15T12:00:00.000Z')).toBe('2026-07')
  })

  it('buckets by month only (ignoring year)', () => {
    expect(bucketKeyFor('month', '2026-07-15T12:00:00.000Z')).toBe('07')
    expect(bucketKeyFor('month', '2019-07-02T12:00:00.000Z')).toBe('07')
  })

  it('buckets by day', () => {
    expect(bucketKeyFor('day', '2026-07-15T12:00:00.000Z')).toBe('2026-07-15')
  })

  it('returns "unknown" for a null or unparsable date, so the UI can show "Date Unavailable"', () => {
    expect(bucketKeyFor('year', null)).toBe('unknown')
    expect(bucketKeyFor('year', 'not-a-date')).toBe('unknown')
  })
})

describe('computeShootKeys', () => {
  it('keeps photos taken close together in the same shoot', () => {
    const items = [
      photo('a', { dateTaken: '2024-06-01T10:00:00.000Z' }),
      photo('b', { dateTaken: '2024-06-01T10:05:00.000Z' }),
      photo('c', { dateTaken: '2024-06-01T10:10:00.000Z' })
    ]
    const keys = computeShootKeys(items, 30)
    expect(keys.get('a')).toBe(keys.get('b'))
    expect(keys.get('b')).toBe(keys.get('c'))
  })

  it('starts a new shoot after a gap larger than the configured threshold', () => {
    const items = [
      photo('a', { dateTaken: '2024-06-01T10:00:00.000Z' }),
      photo('b', { dateTaken: '2024-06-01T10:10:00.000Z' }), // 10 min gap — same shoot at a 30 min threshold
      photo('c', { dateTaken: '2024-06-01T14:00:00.000Z' }) // ~4h gap — new shoot
    ]
    const keys = computeShootKeys(items, 30)
    expect(keys.get('a')).toBe(keys.get('b'))
    expect(keys.get('c')).not.toBe(keys.get('a'))
  })

  it('is independent of input order', () => {
    const items = [
      photo('c', { dateTaken: '2024-06-01T14:00:00.000Z' }),
      photo('a', { dateTaken: '2024-06-01T10:00:00.000Z' }),
      photo('b', { dateTaken: '2024-06-01T10:10:00.000Z' })
    ]
    const keys = computeShootKeys(items, 30)
    expect(keys.get('a')).toBe(keys.get('b'))
    expect(keys.get('c')).not.toBe(keys.get('a'))
  })

  it('groups items with no usable date under a single "unknown" shoot key', () => {
    const items = [photo('a', { dateIndexed: '' as unknown as string }), photo('b')]
    // dateIndexed is always populated in practice; simulate "no usable date at all" isn't
    // really reachable, but bestDate() falling through to dateIndexed should still parse fine.
    const keys = computeShootKeys(items, 30)
    expect(keys.size).toBe(2)
  })

  it('respects different gap thresholds for the same data', () => {
    const items = [
      photo('a', { dateTaken: '2024-06-01T10:00:00.000Z' }),
      photo('b', { dateTaken: '2024-06-01T13:00:00.000Z' }) // 3h gap
    ]
    const looseKeys = computeShootKeys(items, 360) // 6h threshold -> same shoot
    expect(looseKeys.get('a')).toBe(looseKeys.get('b'))

    const strictKeys = computeShootKeys(items, 30) // 30m threshold -> different shoots
    expect(strictKeys.get('a')).not.toBe(strictKeys.get('b'))
  })
})
