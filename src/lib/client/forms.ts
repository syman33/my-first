import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form'
import { ApiClientError } from './api'

/**
 * Form helpers shared by client components. Schemas are the same Zod schemas
 * the API validates with; their messages are dictionary keys
 * (`errors.fields.*`), translated here for display.
 */

export type FieldMessages = Record<string, string>

function translate(node: unknown, messages: FieldMessages): void {
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    // `ref` holds the DOM element; `types` duplicates messages per rule.
    if (key === 'ref' || key === 'types' || !value || typeof value !== 'object') continue
    const entry = value as { message?: unknown }
    if (typeof entry.message === 'string') {
      entry.message = messages[entry.message] ?? messages.invalid ?? entry.message
    }
    translate(value, messages)
  }
}

/** Wrap a resolver so validation messages (dictionary keys) are shown in the UI language. */
export function localizeResolver<TInput extends FieldValues, TContext, TOutput>(
  resolver: Resolver<TInput, TContext, TOutput>,
  messages: FieldMessages,
): Resolver<TInput, TContext, TOutput> {
  return async (values, context, options) => {
    const result = await resolver(values, context, options)
    translate(result.errors, messages)
    return result
  }
}

/**
 * Show server-side field errors (already localised by the API) next to the
 * matching inputs. Returns the error message for the form-level alert, or
 * null when every problem was attached to a field.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  fallbackMessage: string,
): string | null {
  if (!(error instanceof ApiClientError)) return fallbackMessage
  let unmatched = Object.keys(error.fieldErrors).length === 0
  let focused = false
  for (const [name, message] of Object.entries(error.fieldErrors)) {
    if ((fields as readonly string[]).includes(name)) {
      setError(name as Path<T>, { type: 'server', message }, { shouldFocus: !focused })
      focused = true
    } else {
      unmatched = true
    }
  }
  return unmatched ? error.message : null
}
