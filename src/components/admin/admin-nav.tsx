'use client'

import {
  ArrowDownUp,
  Bell,
  Boxes,
  FileText,
  FolderTree,
  Gem,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  MessageSquare,
  ScrollText,
  Settings,
  ShoppingBag,
  Star,
  Tags,
  TicketPercent,
  Undo2,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { activeAdminNavKey, type AdminNavKey } from '@/lib/admin/navigation'
import { cn } from '@/utils/cn'

const ICONS: Record<AdminNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ShoppingBag,
  returns: Undo2,
  customers: Users,
  products: Gem,
  categories: FolderTree,
  brands: Tags,
  inventory: Boxes,
  coupons: TicketPercent,
  banners: ImageIcon,
  newsletter: Mail,
  reviews: Star,
  pages: FileText,
  faq: HelpCircle,
  messages: MessageSquare,
  settings: Settings,
  staff: UserCog,
  audit: ScrollText,
  notifications: Bell,
  importExport: ArrowDownUp,
}

export interface AdminNavGroupView {
  key: string
  label: string
  items: { key: AdminNavKey; label: string; href: string }[]
}

/** Sidebar links; the current section is marked with aria-current. */
export function AdminNav({
  groups,
  label,
  onNavigate,
}: {
  groups: AdminNavGroupView[]
  label: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = activeAdminNavKey(pathname)
  return (
    <nav aria-label={label} className="space-y-7">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="px-3 text-[11px] font-medium tracking-[0.18em] text-paper/50 uppercase">
            {group.label}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.key]
              const current = item.key === active
              return (
                <li key={item.key}>
                  <Link
                    href={item.href as Route}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                      current
                        ? 'bg-paper/10 text-paper shadow-[inset_2px_0_0_var(--color-champagne)] rtl:shadow-[inset_-2px_0_0_var(--color-champagne)]'
                        : 'text-paper/75 hover:bg-paper/5 hover:text-paper',
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
