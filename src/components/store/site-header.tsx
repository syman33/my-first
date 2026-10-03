import Form from 'next/form'
import Link from 'next/link'
import type { Route } from 'next'
import { Heart, Search, ShoppingBag, User } from 'lucide-react'
import { Logo, Monogram } from '@/components/brand/logo'
import type { Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import { MobileMenu } from './mobile-menu'

export interface HeaderCategory {
  slug: string
  name: string
}

interface SiteHeaderProps {
  locale: Locale
  dict: Pick<Dictionary, 'nav' | 'common' | 'auth'>
  categories: HeaderCategory[]
  user: { name: string; isStaff: boolean } | null
  counts: { cart: number; wishlist: number }
  announcement: string | null
  switchLocaleHref: string
}

const iconLink =
  'relative inline-flex size-10 items-center justify-center text-ink transition-colors hover:text-champagne-strong'

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ltr-nums absolute -end-0.5 -top-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[10px] leading-4.5 font-medium text-paper">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function SiteHeader({
  locale,
  dict,
  categories,
  user,
  counts,
  announcement,
  switchLocaleHref,
}: SiteHeaderProps) {
  const accountHref = (user ? `/${locale}/account` : `/${locale}/login`) as Route
  const cartLabel =
    counts.cart > 0 ? interpolate(dict.nav.cartCount, { count: counts.cart }) : dict.nav.cart
  return (
    <header className="sticky top-0 z-40 bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/85 print:hidden">
      {announcement ? (
        <p className="bg-ink px-4 py-2 text-center text-xs tracking-wide text-paper">
          {announcement}
        </p>
      ) : null}
      <div className="border-b border-line">
        <div className="container-luxe grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 lg:h-20">
          {/* Start: menu (mobile) / search + language (desktop) */}
          <div className="flex items-center gap-1">
            <MobileMenu
              locale={locale}
              labels={{
                open: dict.nav.openMenu,
                close: dict.nav.closeMenu,
                title: dict.nav.mainLabel,
                account: dict.nav.account,
                login: dict.nav.login,
                wishlist: dict.nav.wishlist,
                admin: dict.nav.admin,
                language: dict.common.switchLanguage,
              }}
              categories={categories}
              accountHref={accountHref}
              signedIn={Boolean(user)}
              isStaff={Boolean(user?.isStaff)}
              switchLocaleHref={switchLocaleHref}
            />
            <Form
              action={`/${locale}/search`}
              role="search"
              className="hidden items-center lg:flex"
            >
              <label htmlFor="header-search" className="sr-only">
                {dict.nav.search}
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  id="header-search"
                  name="q"
                  type="search"
                  placeholder={dict.nav.searchPlaceholder}
                  maxLength={100}
                  className="h-10 w-64 border-b border-line bg-transparent ps-9 pe-2 text-sm placeholder:text-muted-decorative focus:border-ink focus:outline-none"
                />
              </div>
            </Form>
            <a
              href={switchLocaleHref}
              hrefLang={locale === 'ar' ? 'en' : 'ar'}
              lang={locale === 'ar' ? 'en' : 'ar'}
              className="ms-4 hidden text-sm text-ink underline-offset-4 hover:underline lg:inline"
              aria-label={dict.common.switchLanguageLabel}
            >
              {dict.common.switchLanguage}
            </a>
          </div>

          {/* Centre: brand */}
          <Link
            href={`/${locale}`}
            className="flex items-center justify-center text-ink"
            aria-label={`VÉLORA — ${dict.common.home}`}
          >
            <Logo className="hidden h-9 w-auto lg:block" />
            <Monogram className="size-9 lg:hidden" />
          </Link>

          {/* End: account, wishlist, bag */}
          <nav aria-label={dict.nav.account} className="flex items-center justify-end gap-0.5">
            {user?.isStaff ? (
              <Link
                href="/admin"
                className="me-3 hidden text-sm text-ink underline-offset-4 hover:underline lg:inline"
              >
                {dict.nav.admin}
              </Link>
            ) : null}
            <Link
              href={`/${locale}/search`}
              className={`${iconLink} lg:hidden`}
              aria-label={dict.nav.search}
            >
              <Search className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link
              href={accountHref}
              className={`${iconLink} hidden sm:inline-flex`}
              aria-label={user ? dict.nav.account : dict.nav.login}
            >
              <User className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link
              href={`/${locale}/wishlist`}
              className={`${iconLink} hidden sm:inline-flex`}
              aria-label={dict.nav.wishlist}
            >
              <Heart className="size-5" strokeWidth={1.5} aria-hidden="true" />
              <CountBadge count={counts.wishlist} />
            </Link>
            <Link
              href={`/${locale}/cart`}
              className={iconLink}
              aria-label={cartLabel}
              data-testid="header-cart"
            >
              <ShoppingBag className="size-5" strokeWidth={1.5} aria-hidden="true" />
              <CountBadge count={counts.cart} />
            </Link>
          </nav>
        </div>

        {/* Category navigation (desktop) */}
        <nav aria-label={dict.nav.mainLabel} className="hidden border-t border-line lg:block">
          <ul className="container-luxe flex h-12 items-center justify-center gap-10 text-sm">
            <li>
              <Link
                href={`/${locale}/shop`}
                className="py-3 text-ink transition-colors hover:text-champagne-strong"
              >
                {dict.nav.shop}
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/${locale}/${category.slug}` as Route}
                  className="py-3 text-ink transition-colors hover:text-champagne-strong"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
