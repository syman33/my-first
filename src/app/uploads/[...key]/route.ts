import { env } from '@/lib/env'
import {
  assertSafeKey,
  IMAGE_CONTENT_TYPES,
  LocalStorageProvider,
} from '@/services/storage/storage.service'

/**
 * Serves files written by the local storage provider. Only server-generated
 * keys with an image extension are served, never directory listings or
 * paths outside the upload root; content is sent with nosniff and a
 * sandboxing CSP. With S3 storage, files come from the bucket's URL instead.
 */
const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })

export async function GET(_request: Request, ctx: RouteContext<'/uploads/[...key]'>) {
  if (env().STORAGE_PROVIDER !== 'local') return notFound()
  const { key: segments } = await ctx.params
  const key = segments.join('/')
  try {
    assertSafeKey(key)
  } catch {
    return notFound()
  }
  const contentType = IMAGE_CONTENT_TYPES[key.slice(key.lastIndexOf('.') + 1)]
  if (!contentType) return notFound()
  const data = await new LocalStorageProvider().read(key)
  if (!data) return notFound()
  const body = new Uint8Array(data.byteLength)
  body.set(data)
  return new Response(body, {
    headers: {
      'content-type': contentType,
      'content-length': String(body.byteLength),
      // Keys are content hashes: an object never changes once written.
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
    },
  })
}
