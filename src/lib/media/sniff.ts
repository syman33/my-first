/**
 * Identify an uploaded image by its leading bytes. The browser-supplied
 * Content-Type and file name are never trusted; anything that is not one of
 * these raster formats (SVG, HTML, PDF, executables …) is rejected.
 */
export type SniffedImage = 'jpeg' | 'png' | 'webp' | 'avif'

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end))
}

export function sniffImageType(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp'
  if (ascii(bytes, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 12))) return 'avif'
  return null
}
