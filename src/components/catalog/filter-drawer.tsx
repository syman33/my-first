'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

interface FilterDrawerProps {
  label: string
  closeLabel: string
  title: string
  children: ReactNode
}

/** Mobile filter sheet on a native modal <dialog> (focus trap, Escape, inert page). */
export function FilterDrawer({ label, closeLabel, title, children }: FilterDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Close once the filtered results have loaded.
  useEffect(() => {
    dialogRef.current?.close()
  }, [pathname, searchParams])

  return (
    <>
      <button
        type="button"
        className="inline-flex h-10 items-center gap-2 border border-line-strong px-4 text-sm lg:hidden"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {label}
      </button>
      <dialog
        ref={dialogRef}
        aria-label={title}
        className="ms-auto me-0 h-dvh max-h-dvh w-[min(24rem,92vw)] max-w-none bg-ivory p-0 text-ink backdrop:bg-ink/40 open:flex open:flex-col"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close()
        }}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <h2 className="font-display text-xl">{title}</h2>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center"
            aria-label={closeLabel}
            onClick={() => dialogRef.current?.close()}
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </dialog>
    </>
  )
}
