import { getDictionary } from '@/i18n'
import { getAdminLocale } from '@/lib/admin/access'

/** Shown while a back-office page loads its data (navigation feedback). */
export default async function AdminLoading() {
  const label = getDictionary(await getAdminLocale()).common.loading
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span
        className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-ink motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}
