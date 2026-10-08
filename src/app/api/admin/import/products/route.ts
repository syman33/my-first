import { requireAlso } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { readSingleUpload } from '@/lib/api/upload'
import { MAX_IMPORT_BYTES } from '@/lib/admin/catalog-csv'
import { AppError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { applyCatalogImport, checkCatalogImport } from '@/services/admin/catalog-import.service'

/**
 * Product CSV import (multipart: `file`, `mode` = check | apply). "check"
 * writes nothing; "apply" re-validates and applies every row in one
 * transaction, or nothing (422 with the row errors).
 */
export const POST = apiHandler(
  {
    auth: 'staff',
    permission: 'IMPORT_EXPORT',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.uploads, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    requireAlso(ctx.user, 'PRODUCTS_MANAGE', 'INVENTORY_ADJUST')
    const { bytes, form } = await readSingleUpload(ctx.req)
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'Import file too large', {
        status: 413,
        details: { reason: 'TOO_LARGE', limit: MAX_IMPORT_BYTES },
      })
    }
    const mode = form.get('mode')
    if (mode === 'check') return ok({ report: await checkCatalogImport(bytes) })
    if (mode !== 'apply') throw new AppError('BAD_REQUEST', 'Unknown mode', { status: 400 })
    const report = await applyCatalogImport(bytes, ctx.audit)
    if (!report.applied) {
      throw new AppError('IMPORT_INVALID', 'The file has errors; nothing was imported', {
        status: 422,
        details: { report },
      })
    }
    return ok({ report })
  },
)
