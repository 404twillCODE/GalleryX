import type { ExportFolderRule, ExportMatchSettings } from '../shared/types'

/**
 * Configurable replacement for the old hardcoded isExportFolderName() check. A ExportMatcher is
 * built once per scan/watch cycle from the user's current rules + match settings, then reused
 * for every folder name encountered — cheap to call per-directory during a scan.
 */
export class ExportMatcher {
  private names: string[]

  constructor(
    rules: ExportFolderRule[],
    private settings: ExportMatchSettings
  ) {
    const enabledNames = rules.filter((r) => r.enabled).map((r) => r.name)
    this.names = settings.caseSensitive ? enabledNames : enabledNames.map((n) => n.toLowerCase())
  }

  /** Does this single folder *name* (not a path) match one of the configured export rules? */
  matchesName(name: string): boolean {
    const candidate = this.settings.caseSensitive ? name : name.toLowerCase()
    if (this.settings.exactMatch) {
      return this.names.includes(candidate)
    }
    // Non-exact mode allows the rule name to appear as a whole path *segment* elsewhere in a
    // compound folder name (still not a raw substring match — "Exported Photos" and "Client
    // Exports" must NOT match "Export"/"Exports", only exact-token containment does).
    const tokens = candidate.split(/[\s_-]+/).filter(Boolean)
    return this.names.some((n) => tokens.includes(n))
  }

  /** Does any segment of this relative path (already split, root-relative) match, honoring
   *  includeSubfolders? `segments` should be ordered from the drive root down to (and possibly
   *  past) the matching folder. */
  matchesPath(segments: string[]): { matched: boolean; folderName: string | null } {
    if (!segments.length) return { matched: false, folderName: null }
    if (this.settings.includeSubfolders) {
      for (const seg of segments) {
        if (this.matchesName(seg)) return { matched: true, folderName: seg }
      }
      return { matched: false, folderName: null }
    }
    // Without subfolder inclusion, only a direct hit on the *last* segment's immediate parent
    // chain counts — i.e. the file must live directly inside (or the folder chain must end
    // at) a matching folder, not several levels beneath one.
    const last = segments[segments.length - 1]
    return this.matchesName(last) ? { matched: true, folderName: last } : { matched: false, folderName: null }
  }
}

export function isVideoAllowedInExports(settings: ExportMatchSettings, isVideo: boolean): boolean {
  return !isVideo || settings.includeVideos
}
