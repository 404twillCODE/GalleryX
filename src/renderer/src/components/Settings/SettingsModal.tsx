import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { ExportFolderRule, ShootGapMinutes, Settings, TimelineGroupBy } from '../../../../shared/types'
import { formatBytes } from '../../lib/format'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${checked ? 'bg-accent' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm text-neutral-200">{label}</div>
        {description && <div className="text-xs text-neutral-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function SettingsModal(): JSX.Element {
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const storeSettings = useAppStore((s) => s.settings)
  const setStoreSettings = useAppStore((s) => s.setSettings)
  const [settings, setSettings] = useState<Settings | null>(storeSettings)
  const [cacheBusy, setCacheBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [rules, setRules] = useState<ExportFolderRule[]>([])
  const [newRuleName, setNewRuleName] = useState('')

  useEffect(() => {
    if (!settings) void window.gx.getSettings().then(setSettings)
  }, [settings])

  useEffect(() => {
    void window.gx.listExportRules().then(setRules)
  }, [])

  const addRule = async (): Promise<void> => {
    const name = newRuleName.trim()
    if (!name) return
    const rule = await window.gx.addExportRule(name)
    setRules((prev) => [...prev, rule])
    setNewRuleName('')
  }

  const update = async (partial: Partial<Settings>): Promise<void> => {
    setSettings((s) => (s ? { ...s, ...partial } : s))
    const updated = await window.gx.setSettings(partial)
    setStoreSettings(updated)
  }

  if (!settings) return <></>

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center animate-fade-in">
      <div className="panel w-[560px] max-h-[85vh] overflow-y-auto animate-scale-in">
        <div className="h-14 flex items-center px-5 border-b border-white/[0.06] sticky top-0 bg-base-surface z-10">
          <span className="text-sm font-semibold text-white flex-1">Settings</span>
          <button className="btn-ghost !p-1.5" onClick={() => setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <Section title="Appearance">
            <SettingRow label="Default thumbnail size" description="Applied to new sessions">
              <input
                type="range"
                min={100}
                max={420}
                step={10}
                value={settings.thumbnailSize}
                onChange={(e) => update({ thumbnailSize: Number(e.target.value) })}
                className="w-40 accent-accent"
              />
            </SettingRow>
            <SettingRow label="Theme" description="GalleryX currently ships a refined dark theme">
              <select
                className="bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-sm"
                value={settings.theme}
                disabled
              >
                <option value="dark">Dark</option>
              </select>
            </SettingRow>
          </Section>

          <Section title="Scanning">
            <SettingRow label="Scan subfolders" description="Recursively include nested folders when scanning">
              <Toggle checked={settings.scanSubfolders} onChange={(v) => update({ scanSubfolders: v })} />
            </SettingRow>
            <SettingRow label="RAW support" description="Extract embedded previews from RAW files (ARW, CR2, NEF, DNG, ...)">
              <Toggle checked={settings.rawSupport} onChange={(v) => update({ rawSupport: v })} />
            </SettingRow>
            <SettingRow label="Watch for changes" description="Automatically pick up new, moved, or deleted files">
              <Toggle checked={settings.watchForChanges} onChange={(v) => update({ watchForChanges: v })} />
            </SettingRow>
            <SettingRow label="Automatic rescans" description="Periodically re-scan enabled drives in the background">
              <Toggle checked={settings.autoRescan} onChange={(v) => update({ autoRescan: v })} />
            </SettingRow>
            {settings.autoRescan && (
              <SettingRow label="Rescan interval (minutes)">
                <input
                  type="number"
                  min={5}
                  className="w-20 bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-right"
                  value={settings.autoRescanIntervalMinutes}
                  onChange={(e) => update({ autoRescanIntervalMinutes: Number(e.target.value) })}
                />
              </SettingRow>
            )}
          </Section>

          <Section title="Cache">
            <SettingRow label="Cache size limit (MB)">
              <input
                type="number"
                min={256}
                step={256}
                className="w-24 bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-right"
                value={settings.cacheSizeLimitMB}
                onChange={(e) => update({ cacheSizeLimitMB: Number(e.target.value) })}
              />
            </SettingRow>
            <SettingRow label="Cache location" description={settings.cacheLocation}>
              <button
                className="btn-ghost !px-3 !py-1 border border-white/10"
                onClick={async () => {
                  const dir = await window.gx.chooseCacheDir()
                  if (dir) await update({ cacheLocation: dir })
                }}
              >
                Change…
              </button>
            </SettingRow>
            <SettingRow label="Clear thumbnail cache" description="Removes cached thumbnails; they regenerate automatically">
              <button
                className="btn-ghost !px-3 !py-1 border border-white/10"
                disabled={cacheBusy}
                onClick={async () => {
                  setCacheBusy(true)
                  await window.gx.clearCache()
                  setCacheBusy(false)
                }}
              >
                {cacheBusy ? 'Clearing…' : 'Clear Cache'}
              </button>
            </SettingRow>
          </Section>

          <Section title="Database">
            <SettingRow label="Database location" description={settings.databaseLocation}>
              <span className="text-xs text-neutral-500">{formatBytes(0)}</span>
            </SettingRow>
            <SettingRow label="Reset database" description="Removes all indexed photos, favorites, and drives. Originals are never touched.">
              {!confirmReset ? (
                <button
                  className="btn-ghost !px-3 !py-1 border border-red-500/30 text-red-400"
                  onClick={() => setConfirmReset(true)}
                >
                  Reset…
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertTriangle size={13} />
                  <button
                    className="underline"
                    onClick={async () => {
                      await window.gx.resetDatabase()
                      setConfirmReset(false)
                    }}
                  >
                    Confirm reset
                  </button>
                  <button className="text-neutral-500" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </SettingRow>
          </Section>

          <Section title="Export Folders">
            <SettingRow label="Case-sensitive matching" description="Off matches Export, EXPORT, export, etc.">
              <Toggle
                checked={settings.exportMatch.caseSensitive}
                onChange={(v) => update({ exportMatch: { ...settings.exportMatch, caseSensitive: v } })}
              />
            </SettingRow>
            <SettingRow label="Require exact folder name" description="\u201cExport\u201d matches, \u201cClient Exports\u201d doesn't">
              <Toggle
                checked={settings.exportMatch.exactMatch}
                onChange={(v) => update({ exportMatch: { ...settings.exportMatch, exactMatch: v } })}
              />
            </SettingRow>
            <SettingRow label="Include nested subfolders" description="Also recognize export folders inside other export folders">
              <Toggle
                checked={settings.exportMatch.includeSubfolders}
                onChange={(v) => update({ exportMatch: { ...settings.exportMatch, includeSubfolders: v } })}
              />
            </SettingRow>
            <SettingRow label="Include videos" description="Videos inside export folders also get the Exported badge">
              <Toggle
                checked={settings.exportMatch.includeVideos}
                onChange={(v) => update({ exportMatch: { ...settings.exportMatch, includeVideos: v } })}
              />
            </SettingRow>

            <div className="space-y-1.5 pt-1">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                  <Toggle
                    checked={rule.enabled}
                    onChange={async (v) => {
                      await window.gx.setExportRuleEnabled(rule.id, v)
                      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: v } : r)))
                    }}
                  />
                  <span className={`text-sm flex-1 ${rule.enabled ? 'text-neutral-200' : 'text-neutral-500'}`}>{rule.name}</span>
                  {rule.isDefault && <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Default</span>}
                  {!rule.isDefault && (
                    <button
                      className="text-neutral-500 hover:text-red-400"
                      onClick={async () => {
                        await window.gx.removeExportRule(rule.id)
                        setRules((prev) => prev.filter((r) => r.id !== rule.id))
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addRule()}
                placeholder="Custom folder name (e.g. Client Delivery)"
                className="flex-1 bg-base-raised border border-white/10 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <button className="btn-ghost !px-3 !py-1.5 border border-white/10" onClick={() => void addRule()}>
                <Plus size={14} />
              </button>
            </div>

            <SettingRow label="Reset export folder settings" description="Restores default folder names and matching options">
              <button
                className="btn-ghost !px-3 !py-1 border border-white/10"
                onClick={async () => {
                  await window.gx.resetExportRules()
                  const [rulesList, refreshed] = await Promise.all([window.gx.listExportRules(), window.gx.getSettings()])
                  setRules(rulesList)
                  setSettings(refreshed)
                  setStoreSettings(refreshed)
                }}
              >
                Reset to Defaults
              </button>
            </SettingRow>
          </Section>

          <Section title="Video">
            <SettingRow label="Thumbnail frame" description="Where in the video to grab the thumbnail from">
              <select
                className="bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-sm"
                value={settings.videoThumbnailPosition}
                onChange={(e) => update({ videoThumbnailPosition: e.target.value as Settings['videoThumbnailPosition'] })}
              >
                <option value="ten-percent">10% into video</option>
                <option value="middle">Middle</option>
                <option value="first-frame">First usable frame</option>
              </select>
            </SettingRow>
            <SettingRow label="Hover preview" description="Preview a few frames when hovering a video thumbnail">
              <Toggle checked={settings.videoHoverPreview} onChange={(v) => update({ videoHoverPreview: v })} />
            </SettingRow>
          </Section>

          <Section title="Duplicates & Deletion Safety">
            <SettingRow label="Hash concurrency" description="Simultaneous file-hashing jobs during a duplicate scan">
              <input
                type="number"
                min={1}
                max={16}
                className="w-20 bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-sm text-right"
                value={settings.duplicateHashConcurrency}
                onChange={(e) => update({ duplicateHashConcurrency: Number(e.target.value) })}
              />
            </SettingRow>
            <SettingRow
              label="Allow permanent deletion"
              description="Advanced: skip the Trash/Recycle Bin entirely. Disabled by default — deletions still always require confirmation."
            >
              <Toggle checked={settings.permanentDeleteEnabled} onChange={(v) => update({ permanentDeleteEnabled: v })} />
            </SettingRow>
            {settings.permanentDeleteEnabled && (
              <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span>Permanent deletion bypasses the Trash/Recycle Bin. Files removed this way cannot be recovered by GalleryX.</span>
              </div>
            )}
          </Section>

          <Section title="Timeline">
            <SettingRow label="Default grouping">
              <select
                className="bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-sm"
                value={settings.timelineDefaultGroupBy}
                onChange={(e) => update({ timelineDefaultGroupBy: e.target.value as TimelineGroupBy })}
              >
                <option value="year-month">Year & Month</option>
                <option value="year">Year</option>
                <option value="month">Month</option>
                <option value="day">Day</option>
                <option value="shoot">Shoot</option>
                <option value="camera">Camera</option>
                <option value="lens">Lens</option>
                <option value="folder">Folder</option>
                <option value="drive">Drive</option>
              </select>
            </SettingRow>
            <SettingRow label="Shoot gap" description="Time gap that starts a new automatic shoot">
              <select
                className="bg-base-raised border border-white/10 rounded-lg px-2 py-1 text-sm"
                value={settings.shootGapMinutes}
                onChange={(e) => update({ shootGapMinutes: Number(e.target.value) as ShootGapMinutes })}
              >
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={180}>3 hours</option>
                <option value={360}>6 hours</option>
                <option value={720}>12 hours</option>
                <option value={1440}>1 day</option>
              </select>
            </SettingRow>
          </Section>
        </div>
      </div>
    </div>
  )
}
