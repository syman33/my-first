import { notFound } from 'next/navigation'

/** Any unmatched storefront URL renders the branded, localized 404 page. */
export default function CatchAllNotFound(): never {
  notFound()
}
