import exifr from 'exifr'
import sharp from 'sharp'
import { isRawExtension } from '../shared/types'

export interface ExtractedMetadata {
  width: number | null
  height: number | null
  dateTaken: string | null
  cameraMake: string | null
  cameraModel: string | null
  lens: string | null
  iso: number | null
  shutterSpeed: string | null
  aperture: number | null
  focalLength: number | null
  gpsLat: number | null
  gpsLon: number | null
  colorProfile: string | null
  orientation: number | null
}

function formatShutter(exposureTime: number | undefined): string | null {
  if (!exposureTime || Number.isNaN(exposureTime)) return null
  if (exposureTime >= 1) return `${exposureTime.toFixed(1)}s`
  const denom = Math.round(1 / exposureTime)
  return `1/${denom}s`
}

const COLOR_SPACE_NAMES: Record<number, string> = { 1: 'sRGB', 2: 'Adobe RGB', 65535: 'Uncalibrated' }

/** EXIF orientations 5-8 mean the sensor's native width/height must be swapped to get the
 *  logical, displayed dimensions (the camera was held in portrait when shooting). */
export function orientationSwapsDimensions(orientation: number | null): boolean {
  return orientation != null && orientation >= 5 && orientation <= 8
}

/** Degrees of clockwise rotation needed to display the image upright. Camera RAW/JPEG files
 *  practically only ever use 1, 3, 6, or 8 (no mirroring), so mirrored variants (2,4,5,7) are
 *  treated as their nearest non-mirrored rotation rather than left completely unhandled. */
export function orientationToDegrees(orientation: number | null): number {
  switch (orientation) {
    case 3:
    case 4:
      return 180
    case 5:
    case 6:
      return 90
    case 7:
    case 8:
      return 270
    default:
      return 0
  }
}

export async function extractMetadata(filePath: string, extension: string): Promise<ExtractedMetadata> {
  const result: ExtractedMetadata = {
    width: null,
    height: null,
    dateTaken: null,
    cameraMake: null,
    cameraModel: null,
    lens: null,
    iso: null,
    shutterSpeed: null,
    aperture: null,
    focalLength: null,
    gpsLat: null,
    gpsLon: null,
    colorProfile: null,
    orientation: null
  }

  try {
    const tags = await exifr.parse(filePath, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: false,
      jfif: true,
      ihdr: true,
      // Keep enum-style tags (Orientation, ColorSpace, ...) numeric — translateValues would turn
      // Orientation into a string like "Rotate 270 CW", silently breaking numeric comparisons.
      translateValues: false,
      reviveValues: true,
      mergeOutput: true,
      sanitize: true
    })

    if (tags) {
      result.width = tags.ExifImageWidth ?? tags.ImageWidth ?? tags.PixelXDimension ?? null
      result.height = tags.ExifImageHeight ?? tags.ImageHeight ?? tags.PixelYDimension ?? null
      const dt = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.DateTimeDigitized
      result.dateTaken = dt instanceof Date ? dt.toISOString() : dt ? new Date(dt).toISOString() : null
      result.cameraMake = tags.Make ?? null
      result.cameraModel = tags.Model ?? null
      result.lens = tags.LensModel ?? tags.LensInfo ?? tags.LensMake ?? null
      result.iso = typeof tags.ISO === 'number' ? tags.ISO : null
      result.shutterSpeed = formatShutter(tags.ExposureTime)
      result.aperture = typeof tags.FNumber === 'number' ? tags.FNumber : null
      result.focalLength = typeof tags.FocalLength === 'number' ? tags.FocalLength : null
      if (typeof tags.latitude === 'number') result.gpsLat = tags.latitude
      if (typeof tags.longitude === 'number') result.gpsLon = tags.longitude
      result.colorProfile = tags.ProfileDescription
        ? String(tags.ProfileDescription)
        : typeof tags.ColorSpace === 'number'
          ? COLOR_SPACE_NAMES[tags.ColorSpace] ?? `Unknown (${tags.ColorSpace})`
          : null
      result.orientation = typeof tags.Orientation === 'number' ? tags.Orientation : null

      // EXIF width/height for RAW & many JPEGs report the sensor's native (unrotated) size.
      // Swap to logical/display dimensions so grid aspect ratio & portrait/landscape filters
      // match what the photo actually looks like once rotated upright.
      if (orientationSwapsDimensions(result.orientation) && result.width != null && result.height != null) {
        ;[result.width, result.height] = [result.height, result.width]
      }
    }
  } catch {
    // Corrupt or unsupported EXIF — leave metadata fields null, don't throw.
  }

  if ((result.width == null || result.height == null) && !isRawExtension(extension)) {
    try {
      const meta = await sharp(filePath).metadata()
      let w = meta.width ?? null
      let h = meta.height ?? null
      if (result.orientation == null && typeof meta.orientation === 'number') {
        result.orientation = meta.orientation
      }
      if (orientationSwapsDimensions(meta.orientation ?? null) && w != null && h != null) {
        ;[w, h] = [h, w]
      }
      result.width = result.width ?? w
      result.height = result.height ?? h
    } catch {
      // Unreadable / unsupported raster image — leave dimensions null.
    }
  }

  return result
}
