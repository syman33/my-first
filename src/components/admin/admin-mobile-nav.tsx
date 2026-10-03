'use client'

import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { AdminNav, type AdminNavGroupView } from './admin-nav'

/** Small screens: the sidebar opens as a full-height panel over the page. */
export function AdminMobileNav({
  groups,
  labels,
}: {
  groups: AdminNavGroupView[]
  labels: { menu: string; open: string; close: string }
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center text-ink hover:bg-sand"
        aria-expanded={open}
        aria-controls="admin-mobile-nav"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" aria-hidden="true" />
        <span className="sr-only">{labels.open}</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label={labels.menu}
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label={labels.close}
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div
            id="admin-mobile-nav"
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-ink p-4"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
          >
            <button
              type="button"
              className="mb-4 inline-flex size-10 items-center justify-center self-end text-paper hover:bg-paper/10"
              onClick={() => setOpen(false)}
              // The panel opens because the user asked for it; focus its close button.
              autoFocus
            >
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">{labels.close}</span>
            </button>
            <AdminNav groups={groups} label={labels.menu} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
