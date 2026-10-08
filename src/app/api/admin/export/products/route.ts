import { requireAlso } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { CATALOG_EXPORT_COLUMNS } from '@/lib/admin/catalog-csv'
import { csvHeaders, toCsv } from '@/lib/csv'
import { exportCatalog } from '@/services/admin/exports.service'
import { toStoreDateKey } from '@/utils/time'

/** The catalogue as CSV (one row per variant), in the import format. */
export const GET = apiHandler({ auth: 'staff', permission: 'IMPORT_EXPORT' }, async (ctx) => {
  requireAlso(ctx.user, 'PRODUCTS_VIEW')
  const rows = await exportCatalog(ctx.audit)
  return new Response(toCsv(rows, CATALOG_EXPORT_COLUMNS), {
    headers: csvHeaders(`velora-products-${toStoreDateKey(new Date())}.csv`),
  })
})
