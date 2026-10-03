import 'server-only'
import { createHash } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { AppError } from '@/lib/errors'
import { sniffImageType } from '@/lib/media/sniff'

/**
 * Every uploaded image is decoded and re-encoded server-side:
 *  - the real format is sniffed from its bytes (JPEG, PNG, WebP, AVIF only);
 *  - decoding is capped in pixels, so a "decompression bomb" cannot exhaust memory;
 *  - EXIF orientation is applied, then all metadata (EXIF, GPS, camera data)
 *    is dropped — nothing a customer or staff member's camera recorded leaks;
 *  - the result is a size-capped WebP, so the stored file is always a clean,
 *    known format regardless of what was uploaded.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_INPUT_PIXELS = 40_000_000

export type UploadRejection = 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'TOO_SMALL' | 'CORRUPT'

export class UploadRejectedError extends AppError {
  constructor(reason: UploadRejection, cause?: unknown) {
    super('UPLOAD_REJECTED', `Upload rejected: ${reason}`, {
      status: reason === 'TOO_LARGE' ? 413 : reason === 'UNSUPPORTED_TYPE' ? 415 : 422,
      details: { reason },
      cause,
    })
  }
}

export interface ProcessedImage {
  data: Buffer
  width: number
  height: number
  contentType: 'image/webp'
  extension: 'webp'
  /** First 32 hex chars of the SHA-256 of the processed bytes (content-addressed keys). */
  hash: string
}

export async function processUploadedImage(
  bytes: Uint8Array,
  options: { maxEdge: number; minEdge: number },
): Promise<ProcessedImage> {
  if (bytes.byteLength === 0) throw new UploadRejectedError('EMPTY')
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UploadRejectedError('TOO_LARGE')
  if (!sniffImageType(bytes)) throw new UploadRejectedError('UNSUPPORTED_TYPE')

  let meta: Metadata
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata()
  } catch (error) {
    throw new UploadRejectedError('CORRUPT', error)
  }
  if (!meta.width || !meta.height) throw new UploadRejectedError('CORRUPT')
  // Rotation-invariant: the shorter side must be large enough for a sharp product view.
  if (Math.min(meta.width, meta.height) < options.minEdge)
    throw new UploadRejectedError('TOO_SMALL')

  try {
    const { data, info } = await sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    })
      .rotate()
      .resize({
        width: options.maxEdge,
        height: options.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
    return {
      data,
      width: info.width,
      height: info.height,
      contentType: 'image/webp',
      extension: 'webp',
      hash: createHash('sha256').update(data).digest('hex').slice(0, 32),
    }
  } catch (error) {
    throw new UploadRejectedError('CORRUPT', error)
  }
}
