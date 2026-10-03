import type { Metadata } from 'next'
import { CmsPage, cmsMetadata } from '../cms-page'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/privacy'>): Promise<Metadata> {
  return cmsMetadata((await params).locale, 'privacy')
}

export default async function PrivacyPage({ params }: PageProps<'/[locale]/privacy'>) {
  return <CmsPage locale={(await params).locale} slug="privacy" />
}
