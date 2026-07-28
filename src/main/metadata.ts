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
      translateValues: true,
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
      result.colorProfile = tags.ColorSpace
        ? String(tags.ColorSpace)
        : tags.ProfileDescription
          ? String(tags.ProfileDescription)
          : null
      result.orientation = typeof tags.Orientation === 'number' ? tags.Orientation : null
    }
  } catch {
    // Corrupt or unsupported EXIF — leave metadata fields null, don't throw.
  }

  if ((result.width == null || result.height == null) && !isRawExtension(extension)) {
    try {
      const meta = await sharp(filePath).metadata()
      result.width = result.width ?? meta.width ?? null
      result.height = result.height ?? meta.height ?? null
    } catch {
      // Unreadable / unsupported raster image — leave dimensions null.
    }
  }

  return result
}
