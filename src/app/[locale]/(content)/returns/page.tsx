import type { Metadata } from 'next'
import { CmsPage, cmsMetadata } from '../cms-page'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/returns'>): Promise<Metadata> {
  return cmsMetadata((await params).locale, 'returns')
}

export default async function ReturnsPage({ params }: PageProps<'/[locale]/returns'>) {
  return <CmsPage locale={(await params).locale} slug="returns" />
}
