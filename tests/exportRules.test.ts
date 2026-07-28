import { describe, expect, it } from 'vitest'
import { ExportMatcher, isVideoAllowedInExports } from '../src/main/exportRules'
import { DEFAULT_EXPORT_FOLDER_NAMES, DEFAULT_EXPORT_MATCH_SETTINGS } from '../src/shared/types'
import type { ExportFolderRule } from '../src/shared/types'

function rulesFor(names: string[]): ExportFolderRule[] {
  return names.map((name, i) => ({ id: `rule-${i}`, name, enabled: true, isDefault: true }))
}

describe('ExportMatcher', () => {
  it('matches the default folder names case-insensitively by default', () => {
    const matcher = new ExportMatcher(rulesFor(DEFAULT_EXPORT_FOLDER_NAMES), DEFAULT_EXPORT_MATCH_SETTINGS)
    expect(matcher.matchesName('Export')).toBe(true)
    expect(matcher.matchesName('EXPORT')).toBe(true)
    expect(matcher.matchesName('exports')).toBe(true)
    expect(matcher.matchesName('Final')).toBe(true)
    expect(matcher.matchesName('delivered')).toBe(true)
  })

  it('does not match unrelated folder names', () => {
    const matcher = new ExportMatcher(rulesFor(DEFAULT_EXPORT_FOLDER_NAMES), DEFAULT_EXPORT_MATCH_SETTINGS)
    expect(matcher.matchesName('RAW')).toBe(false)
    expect(matcher.matchesName('Originals')).toBe(false)
  })

  it('does not partial-match when exact matching is enabled (the default)', () => {
    const matcher = new ExportMatcher(rulesFor(['Export']), { ...DEFAULT_EXPORT_MATCH_SETTINGS, exactMatch: true })
    expect(matcher.matchesName('Export')).toBe(true)
    expect(matcher.matchesName('Exported Photos')).toBe(false)
    expect(matcher.matchesName('Client Exports')).toBe(false)
  })

  it('respects case-sensitive matching when enabled', () => {
    const matcher = new ExportMatcher(rulesFor(['Export']), { ...DEFAULT_EXPORT_MATCH_SETTINGS, caseSensitive: true })
    expect(matcher.matchesName('Export')).toBe(true)
    expect(matcher.matchesName('EXPORT')).toBe(false)
    expect(matcher.matchesName('export')).toBe(false)
  })

  it('ignores disabled rules', () => {
    const rules: ExportFolderRule[] = [{ id: '1', name: 'Export', enabled: false, isDefault: true }]
    const matcher = new ExportMatcher(rules, DEFAULT_EXPORT_MATCH_SETTINGS)
    expect(matcher.matchesName('Export')).toBe(false)
  })

  it('detects a nested export folder anywhere in the path when includeSubfolders is on', () => {
    const matcher = new ExportMatcher(rulesFor(['Export']), { ...DEFAULT_EXPORT_MATCH_SETTINGS, includeSubfolders: true })
    const result = matcher.matchesPath(['2024', 'Wedding', 'Export', 'JPEG', 'Cropped'])
    expect(result.matched).toBe(true)
    expect(result.folderName).toBe('Export')
  })

  it('only matches the last path segment when includeSubfolders is off', () => {
    const matcher = new ExportMatcher(rulesFor(['Export']), { ...DEFAULT_EXPORT_MATCH_SETTINGS, includeSubfolders: false })
    const nested = matcher.matchesPath(['2024', 'Export', 'JPEG'])
    expect(nested.matched).toBe(false)

    const direct = matcher.matchesPath(['2024', 'JPEG', 'Export'])
    expect(direct.matched).toBe(true)
    expect(direct.folderName).toBe('Export')
  })

  it('returns not-matched for an empty path', () => {
    const matcher = new ExportMatcher(rulesFor(['Export']), DEFAULT_EXPORT_MATCH_SETTINGS)
    expect(matcher.matchesPath([]).matched).toBe(false)
  })

  it('supports custom export folder names added by the user', () => {
    const matcher = new ExportMatcher(rulesFor(['Client Delivery']), DEFAULT_EXPORT_MATCH_SETTINGS)
    expect(matcher.matchesName('Client Delivery')).toBe(true)
    expect(matcher.matchesName('client delivery')).toBe(true)
    expect(matcher.matchesName('Export')).toBe(false)
  })
})

describe('isVideoAllowedInExports', () => {
  it('always allows photos regardless of the includeVideos setting', () => {
    expect(isVideoAllowedInExports({ ...DEFAULT_EXPORT_MATCH_SETTINGS, includeVideos: false }, false)).toBe(true)
  })

  it('gates videos on the includeVideos setting', () => {
    expect(isVideoAllowedInExports({ ...DEFAULT_EXPORT_MATCH_SETTINGS, includeVideos: false }, true)).toBe(false)
    expect(isVideoAllowedInExports({ ...DEFAULT_EXPORT_MATCH_SETTINGS, includeVideos: true }, true)).toBe(true)
  })
})
