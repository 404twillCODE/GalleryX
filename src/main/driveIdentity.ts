import { execFile } from 'node:child_process'
import path from 'node:path'

export interface VolumeIdentity {
  volumeId: string | null
  volumeLabel: string | null
}

function run(cmd: string, args: string[], timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

/** Parses a single <key>NAME</key><string>VALUE</string> pair out of `diskutil info -plist`
 *  output without pulling in a full plist parser dependency — we only need two scalar fields. */
function extractPlistString(xml: string, key: string): string | null {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)
  const m = xml.match(re)
  return m ? m[1] : null
}

async function probeMac(mountPath: string): Promise<VolumeIdentity> {
  try {
    const xml = await run('/usr/sbin/diskutil', ['info', '-plist', mountPath])
    return {
      volumeId: extractPlistString(xml, 'VolumeUUID'),
      volumeLabel: extractPlistString(xml, 'VolumeName')
    }
  } catch {
    return { volumeId: null, volumeLabel: null }
  }
}

async function probeWindows(mountPath: string): Promise<VolumeIdentity> {
  const driveLetter = path.parse(mountPath).root.replace(/[\\/]+$/, '').replace(':', '')
  if (!driveLetter) return { volumeId: null, volumeLabel: null }
  try {
    const script = `$v = Get-Volume -DriveLetter ${driveLetter} -ErrorAction Stop; Write-Output ($v.UniqueId + '|' + $v.FileSystemLabel)`
    const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script])
    const [uniqueId, label] = out.trim().split('|')
    return { volumeId: uniqueId || null, volumeLabel: label || null }
  } catch {
    return { volumeId: null, volumeLabel: null }
  }
}

async function probeLinux(mountPath: string): Promise<VolumeIdentity> {
  try {
    const uuid = await run('findmnt', ['-no', 'UUID', '--target', mountPath])
    const label = await run('findmnt', ['-no', 'LABEL', '--target', mountPath]).catch(() => '')
    return { volumeId: uuid.trim() || null, volumeLabel: label.trim() || null }
  } catch {
    return { volumeId: null, volumeLabel: null }
  }
}

/**
 * Best-effort stable volume identity so GalleryX can recognize "the same drive" even after a
 * Windows drive-letter change or a macOS remount under a different path. This relies on OS
 * command-line utilities (diskutil / PowerShell Get-Volume / findmnt) rather than a native
 * module, so it degrades gracefully (returns nulls) on any platform/sandbox where those aren't
 * available — callers must always have a path-based fallback. See README for details.
 */
export async function probeVolumeIdentity(mountPath: string): Promise<VolumeIdentity> {
  switch (process.platform) {
    case 'darwin':
      return probeMac(mountPath)
    case 'win32':
      return probeWindows(mountPath)
    default:
      return probeLinux(mountPath)
  }
}
