import type { Metadata } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { BannerEditor } from '@/components/admin/content/banner-editor'
import { AdminPageHeader } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { listBanners } from '@/services/admin/content.service'
import { toStoreDateTimeLocal } from '@/utils/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.banners.title }
}

export default async function AdminBannersPage() {
  const access = await adminAccess('CONTENT_MANAGE', '/admin/banners')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const now = new Date()
  const banners = (await listBanners()).map(({ createdAt: _c, updatedAt: _u, ...banner }) => ({
    ...banner,
    startsAt: banner.startsAt ? toStoreDateTimeLocal(banner.startsAt) : '',
    endsAt: banner.endsAt ? toStoreDateTimeLocal(banner.endsAt) : '',
    state: !banner.isActive
      ? ('off' as const)
      : banner.endsAt && banner.endsAt <= now
        ? ('ended' as const)
        : banner.startsAt && banner.startsAt > now
          ? ('scheduled' as const)
          : ('live' as const),
  }))
  return (
    <div>
      <AdminPageHeader
        title={dict.admin.banners.title}
        description={dict.admin.banners.description}
      />
      <BannerEditor
        locale={locale}
        banners={banners}
        t={dict.admin.banners}
        uploadErrors={dict.admin.products.images.rejected}
        formLabels={dict.admin.form}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </div>
  )
}
