'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/**
 * Read a parameter from the URL fragment (`#token=…`). Returns `undefined`
 * during server rendering and hydration (the fragment is never sent to the
 * server), then the value or `null`.
 */
export function useFragmentParam(name: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.hash.slice(1)).get(name),
    () => undefined,
  )
}
