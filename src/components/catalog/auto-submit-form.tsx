'use client'

import Form from 'next/form'
import type { ComponentProps, FormEvent } from 'react'

type AutoSubmitFormProps = Omit<ComponentProps<typeof Form>, 'onChange'> & {
  /** Submit as soon as a checkbox, radio or select changes (text inputs still need Enter/submit). */
  autoSubmit?: boolean
  onSubmitted?: () => void
}

/**
 * GET form with client-side navigation (next/form). Works without
 * JavaScript as a normal form; with JavaScript, choices apply immediately.
 */
export function AutoSubmitForm({ autoSubmit = false, onSubmitted, ...props }: AutoSubmitFormProps) {
  function handleChange(event: FormEvent<HTMLFormElement>) {
    if (!autoSubmit) return
    const target = event.target as HTMLInputElement | HTMLSelectElement
    if (
      target instanceof HTMLSelectElement ||
      target.type === 'checkbox' ||
      target.type === 'radio'
    ) {
      event.currentTarget.requestSubmit()
    }
  }
  return (
    <Form
      {...props}
      onChange={handleChange}
      onSubmit={(event) => {
        props.onSubmit?.(event)
        onSubmitted?.()
      }}
    />
  )
}
