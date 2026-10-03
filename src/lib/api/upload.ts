import 'server-only'
import type { NextRequest } from 'next/server'
import { AppError } from '@/lib/errors'
import { MAX_UPLOAD_BYTES } from '@/services/media/image-processing.service'

/** Multipart form overhead allowed on top of the file itself. */
const FORM_OVERHEAD = 64 * 1024

/**
 * Read a single-file multipart upload (field `file`). The declared size is
 * checked before the body is read, so an oversized upload is refused without
 * buffering it; the file's name and declared type are ignored — the bytes
 * are validated by the image pipeline.
 */
export async function readSingleUpload(
  req: NextRequest,
): Promise<{ bytes: Uint8Array; form: FormData }> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected multipart/form-data', { status: 415 })
  }
  const declared = Number(req.headers.get('content-length') ?? 'NaN')
  if (!Number.isFinite(declared) || declared > MAX_UPLOAD_BYTES + FORM_OVERHEAD) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Upload too large', {
      status: 413,
      details: { reason: 'TOO_LARGE' },
    })
  }
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    throw new AppError('UPLOAD_REJECTED', 'No file received', {
      status: 422,
      details: { reason: 'EMPTY' },
    })
  }
  return { bytes: new Uint8Array(await file.arrayBuffer()), form }
}
