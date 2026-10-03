import type { Metadata } from 'next'
import { CmsPage, cmsMetadata } from '../cms-page'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/shipping'>): Promise<Metadata> {
  return cmsMetadata((await params).locale, 'shipping')
}

export default async function ShippingPage({ params }: PageProps<'/[locale]/shipping'>) {
  return <CmsPage locale={(await params).locale} slug="shipping" />
}
