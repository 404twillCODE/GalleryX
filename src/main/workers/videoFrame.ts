import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { probeVideo } from '../videoProbe'

export type VideoThumbPosition = 'ten-percent' | 'middle' | 'first-frame'

/** Extracts a single representative frame from a video as a JPEG buffer, using the bundled
 *  ffmpeg-static binary (no system install required, no modification of the source file).
 *  Returns undefined (never throws) when ffmpeg is missing, the codec is undecodable, or the
 *  file is corrupt — callers fall back to a generic video placeholder in that case. */
export async function extractVideoFrame(filePath: string, position: VideoThumbPosition): Promise<Buffer | undefined> {
  if (!ffmpegPath) return undefined

  const probe = await probeVideo(filePath)
  const durationSec = probe.durationMs ? probe.durationMs / 1000 : 0

  let seekSec: number
  if (position === 'middle') seekSec = durationSec * 0.5
  else if (position === 'first-frame') seekSec = Math.min(0.5, durationSec * 0.05)
  else seekSec = durationSec * 0.1 // 'ten-percent' — also the safest generic default
  if (!Number.isFinite(seekSec) || seekSec < 0) seekSec = 0

  const tmpOut = path.join(os.tmpdir(), `gx-vframe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegPath,
        ['-ss', seekSec.toFixed(2), '-i', filePath, '-frames:v', '1', '-q:v', '3', '-y', tmpOut],
        { timeout: 20000 },
        (err) => (err ? reject(err) : resolve())
      )
    })
    return await fsp.readFile(tmpOut)
  } catch {
    // A seek past a very short/near-zero-duration clip can fail — retry once at t=0 before
    // giving up entirely.
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          ffmpegPath,
          ['-i', filePath, '-frames:v', '1', '-q:v', '3', '-y', tmpOut],
          { timeout: 20000 },
          (err) => (err ? reject(err) : resolve())
        )
      })
      return await fsp.readFile(tmpOut)
    } catch {
      return undefined
    }
  } finally {
    fsp.unlink(tmpOut).catch(() => {})
  }
}
