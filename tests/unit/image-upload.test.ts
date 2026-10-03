import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { sniffImageType } from '@/lib/media/sniff'
import { processUploadedImage } from '@/services/media/image-processing.service'

const OPTIONS = { maxEdge: 1200, minEdge: 400 }

async function photo(width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg') {
  return sharp({
    create: { width, height, channels: 3, background: { r: 184, g: 155, b: 114 } },
  })
    .withMetadata({ exif: { IFD0: { Copyright: 'Camera owner', Artist: 'Secret Name' } } })
    .toFormat(format)
    .toBuffer()
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return (error as { details?: { reason?: string } }).details?.reason
  }
  throw new Error('expected a rejection')
}

describe('image sniffing', () => {
  it('recognises real raster formats by their bytes', async () => {
    expect(sniffImageType(await photo(10, 10, 'jpeg'))).toBe('jpeg')
    expect(sniffImageType(await photo(10, 10, 'png'))).toBe('png')
    expect(sniffImageType(await photo(10, 10, 'webp'))).toBe('webp')
  })

  it('rejects SVG, HTML and other content regardless of name or declared type', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    )
    const html = new TextEncoder().encode('<!doctype html><html><body>hi</body></html>')
    expect(sniffImageType(svg)).toBeNull()
    expect(sniffImageType(html)).toBeNull()
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull()
  })
})

describe('image processing', () => {
  it('re-encodes to WebP within the size cap and keeps the aspect ratio', async () => {
    const result = await processUploadedImage(await photo(3000, 2000), OPTIONS)
    expect(result.contentType).toBe('image/webp')
    expect(result).toMatchObject({ width: 1200, height: 800 })
    expect(sniffImageType(result.data)).toBe('webp')
    expect(result.hash).toMatch(/^[0-9a-f]{32}$/)
  })

  it('never enlarges and strips camera metadata', async () => {
    const result = await processUploadedImage(await photo(600, 500), OPTIONS)
    expect(result).toMatchObject({ width: 600, height: 500 })
    const meta = await sharp(result.data).metadata()
    expect(meta.exif).toBeUndefined()
  })

  it('rejects images that are too small, empty, corrupt or not images', async () => {
    expect(await rejection(processUploadedImage(await photo(300, 900), OPTIONS))).toBe('TOO_SMALL')
    expect(await rejection(processUploadedImage(new Uint8Array(), OPTIONS))).toBe('EMPTY')
    const truncated = (await photo(800, 800)).subarray(0, 200)
    expect(await rejection(processUploadedImage(truncated, OPTIONS))).toBe('CORRUPT')
    const text = new TextEncoder().encode('just some text pretending to be a photo.jpg')
    expect(await rejection(processUploadedImage(text, OPTIONS))).toBe('UNSUPPORTED_TYPE')
  })

  it('rejects oversized uploads before decoding them', async () => {
    const huge = new Uint8Array(8 * 1024 * 1024 + 1)
    huge.set([0xff, 0xd8, 0xff, 0xe0])
    expect(await rejection(processUploadedImage(huge, OPTIONS))).toBe('TOO_LARGE')
  })
})
