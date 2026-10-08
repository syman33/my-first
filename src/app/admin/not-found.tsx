import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { getDictionary } from '@/i18n'
import { getAdminLocale } from '@/lib/admin/access'

/** 404 inside the back office (unknown order, product, customer… or a wrong link). */
export default async function AdminNotFound() {
  const t = getDictionary(await getAdminLocale()).admin.notFound
  return (
    <section
      className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center"
      aria-labelledby="admin-not-found-title"
    >
      <SearchX className="size-10 text-champagne-strong" strokeWidth={1.25} aria-hidden="true" />
      <h1 id="admin-not-found-title" className="mt-6 font-display text-3xl text-ink">
        {t.title}
      </h1>
      <p className="mt-3 text-text">{t.body}</p>
      <Link href="/admin" className={`mt-8 ${buttonClasses('primary')}`}>
        {t.home}
      </Link>
    </section>
  )
}
