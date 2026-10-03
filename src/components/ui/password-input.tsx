'use client'

import { Eye, EyeOff } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { cn } from '@/utils/cn'
import { controlClasses } from './field'

interface PasswordInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  showLabel: string
  hideLabel: string
}

/** Password field with a show/hide toggle (the toggle never submits the form). */
export function PasswordInput({ showLabel, hideLabel, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={cn(controlClasses, 'h-12 pe-12', className)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        className="absolute inset-y-0 end-0 inline-flex w-12 items-center justify-center text-muted hover:text-ink"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
