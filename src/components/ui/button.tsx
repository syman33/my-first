import Link from 'next/link'
import type { Route } from 'next'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Spinner } from './spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'border border-ink bg-ink text-paper hover:bg-[#2c2c2c]',
  secondary: 'border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
  ghost: 'border border-transparent bg-transparent text-ink hover:bg-sand',
  subtle: 'border border-line bg-paper text-ink hover:border-ink',
  danger: 'border border-danger bg-danger text-paper hover:bg-[#8c3129]',
  link: 'border-0 bg-transparent p-0 text-ink underline underline-offset-4 hover:text-champagne-strong',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-xs',
  md: 'h-11 px-6 text-sm',
  lg: 'h-13 px-8 text-sm',
}

export function buttonClasses(
  variant: Variant = 'primary',
  size: Size = 'md',
  fullWidth = false,
): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 font-medium tracking-wide transition-colors duration-200',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants[variant],
    variant !== 'link' && sizes[size],
    fullWidth && 'w-full',
  )
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  loading?: boolean
  loadingLabel?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  loadingLabel,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size, fullWidth), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : null}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  )
}

interface ButtonLinkProps {
  href: Route
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  className?: string
  children: ReactNode
  prefetch?: boolean
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  prefetch,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(buttonClasses(variant, size, fullWidth), className)}
    >
      {children}
    </Link>
  )
}
