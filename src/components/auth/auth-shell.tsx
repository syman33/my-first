import Image from 'next/image'
import type { ReactNode } from 'react'

interface AuthShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Secondary actions under the form (e.g. "New to VÉLORA? Create an account"). */
  footer?: ReactNode
}

/** Editorial two-column frame shared by the sign-in, registration and password pages. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="container-luxe grid min-h-[calc(100dvh-12rem)] items-stretch gap-10 py-10 lg:grid-cols-2 lg:gap-16 lg:py-16">
      <div className="relative hidden overflow-hidden bg-sand lg:block">
        <Image
          src="/images/editorial/brand-story.webp"
          alt=""
          fill
          sizes="(min-width: 1024px) 45vw, 0px"
          className="object-cover"
          priority
        />
      </div>
      <div className="flex items-center justify-center">
        <div className="w-full max-w-md">
          <h1 className="font-display text-4xl text-ink lg:text-5xl">{title}</h1>
          {subtitle ? <p className="mt-3 text-muted">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? (
            <div className="mt-8 border-t border-line pt-6 text-sm text-text">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
