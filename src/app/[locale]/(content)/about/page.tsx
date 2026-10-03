import type { Metadata } from 'next'
import { CmsPage, cmsMetadata } from '../cms-page'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/about'>): Promise<Metadata> {
  return cmsMetadata((await params).locale, 'about')
}

export default async function AboutPage({ params }: PageProps<'/[locale]/about'>) {
  return <CmsPage locale={(await params).locale} slug="about" />
}
