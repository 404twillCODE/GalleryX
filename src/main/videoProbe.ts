import { execFile } from 'node:child_process'
import ffprobeStatic from 'ffprobe-static'

// Chromium's bundled decoders vary by platform/build; this is a conservative allowlist of
// codecs GalleryX's HTML5 <video> player can reliably decode. Anything else is still indexed
// (metadata, thumbnail) but the viewer shows an "Unsupported Codec" state instead of a black
// frame / crash, per the spec's fallback requirement.
//
// HEVC (H.265) is included optimistically: modern Chromium/Electron builds decode it via
// hardware on macOS and Windows 10/11 (no software fallback, since H.265 isn't bundled the way
// H.264 is). When a specific machine genuinely can't decode it, the `<video>` element's own
// `error` event still catches that at playback time and VideoViewer falls back to a clear
// "couldn't play this video" message — HEVC files are never silently dropped, and their
// thumbnails/metadata always work regardless (extracted via bundled ffmpeg, not Chromium).
const PLAYABLE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora', 'hevc'])

export interface VideoProbeResult {
  durationMs: number | null
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
  container: string | null
  frameRate: number | null
  bitrate: number | null
  dateTaken: string | null
  orientation: number | null
  codecSupported: boolean
}

function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null
  const [num, den] = rate.split('/').map(Number)
  if (!den) return num || null
  return Math.round((num / den) * 100) / 100
}

/** Runs ffprobe (bundled via ffprobe-static, so it works without any system install) and maps
 *  its JSON output to the fields GalleryX stores. Never throws — on any failure (corrupt file,
 *  missing binary, unsupported container) it resolves with all-null fields and
 *  codecSupported=false so the caller can still index the file and show a graceful state. */
export async function probeVideo(filePath: string): Promise<VideoProbeResult> {
  const empty: VideoProbeResult = {
    durationMs: null,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    container: null,
    frameRate: null,
    bitrate: null,
    dateTaken: null,
    orientation: null,
    codecSupported: false
  }

  try {
    const json = await new Promise<string>((resolve, reject) => {
      execFile(
        ffprobeStatic.path,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
        { timeout: 15000, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout) => {
          if (err) reject(err)
          else resolve(stdout)
        }
      )
    })

    const data = JSON.parse(json) as {
      streams?: any[]
      format?: { duration?: string; bit_rate?: string; format_name?: string; tags?: Record<string, string> }
    }

    const videoStream = data.streams?.find((s) => s.codec_type === 'video')
    const audioStream = data.streams?.find((s) => s.codec_type === 'audio')
    const format = data.format

    const rotateTag = videoStream?.tags?.rotate ?? videoStream?.side_data_list?.find((s: any) => 'rotation' in s)?.rotation
    const orientation = rotateTag != null ? ((Number(rotateTag) % 360) + 360) % 360 : null

    const durationSec = Number(format?.duration ?? videoStream?.duration ?? NaN)
    const dateTaken =
      format?.tags?.creation_time ??
      videoStream?.tags?.creation_time ??
      null

    const codec = videoStream?.codec_name ? String(videoStream.codec_name).toLowerCase() : null

    return {
      durationMs: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : null,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      videoCodec: codec,
      audioCodec: audioStream?.codec_name ? String(audioStream.codec_name).toLowerCase() : null,
      container: format?.format_name ?? null,
      frameRate: parseFrameRate(videoStream?.r_frame_rate),
      bitrate: format?.bit_rate ? Number(format.bit_rate) : null,
      dateTaken: dateTaken ? new Date(dateTaken).toISOString() : null,
      orientation,
      codecSupported: codec ? PLAYABLE_VIDEO_CODECS.has(codec) : false
    }
  } catch (err) {
    console.error('[videoProbe] failed for', filePath, err)
    return empty
  }
}
