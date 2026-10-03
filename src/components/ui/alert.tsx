import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Tone = 'info' | 'success' | 'error' | 'warning'

const tones: Record<Tone, string> = {
  info: 'border-line bg-paper text-text',
  success: 'border-success/30 bg-success-soft text-success',
  error: 'border-danger/30 bg-danger-soft text-danger',
  warning: 'border-warning/30 bg-warning-soft text-warning',
}

/** Inline message. Errors use role="alert" (announced immediately); others use role="status". */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('border px-4 py-3 text-sm', tones[tone], className)}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title ? 'mt-1' : undefined)}>{children}</div> : null}
    </div>
  )
}
