import { type ComponentProps, type ReactNode, useId } from 'react'
import { cn } from '@/utils/cn'

/**
 * Accessible form controls: every input has a visible <label>, errors are
 * announced (role="alert") and linked via aria-describedby, and
 * aria-invalid drives the error styling.
 */

export const controlClasses =
  'block w-full border border-line-strong bg-paper px-4 text-ink placeholder:text-muted-decorative transition-colors ' +
  'focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger disabled:bg-sand disabled:text-muted'

interface FieldProps {
  label: ReactNode
  error?: string
  hint?: ReactNode
  optionalLabel?: string
  children: (props: {
    id: string
    'aria-invalid'?: boolean
    'aria-describedby'?: string
  }) => ReactNode
  className?: string
}

export function Field({ label, error, hint, optionalLabel, children, className }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-2', className)}>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 text-sm font-medium text-ink"
      >
        <span>{label}</span>
        {optionalLabel ? (
          <span className="text-xs font-normal text-muted">{optionalLabel}</span>
        ) : null}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClasses, 'h-12', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClasses, 'min-h-32 py-3', className)} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(controlClasses, 'h-12 appearance-none bg-no-repeat pe-10', className)}
      {...props}
    >
      {children}
    </select>
  )
}

export function Checkbox({
  label,
  error,
  className,
  ...props
}: ComponentProps<'input'> & { label: ReactNode; error?: string }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-text">
        <input
          id={id}
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-ink"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
