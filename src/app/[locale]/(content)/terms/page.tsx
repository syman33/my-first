import type { Metadata } from 'next'
import { CmsPage, cmsMetadata } from '../cms-page'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/terms'>): Promise<Metadata> {
  return cmsMetadata((await params).locale, 'terms')
}

export default async function TermsPage({ params }: PageProps<'/[locale]/terms'>) {
  return <CmsPage locale={(await params).locale} slug="terms" />
}
