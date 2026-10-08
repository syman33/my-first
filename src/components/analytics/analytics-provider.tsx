'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react'
import { type AnalyticsEvent, type AnalyticsProviderName, toGa4 } from '@/lib/analytics/events'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    /** Development provider: the most recent events, for inspection (nothing is sent). */
    veloraAnalytics?: AnalyticsEvent[]
  }
}

type Track = (event: AnalyticsEvent) => void

const AnalyticsContext = createContext<Track>(() => undefined)

const LOCAL_BUFFER_LIMIT = 200

/**
 * Routes storefront events to the configured provider:
 * - none:    nothing happens;
 * - console: development — events are kept in `window.veloraAnalytics` and
 *            announced as a `velora:analytics` DOM event; nothing leaves the browser;
 * - ga4:     Google Analytics 4 recommended events through `gtag`.
 * A React context (not module state) so events fired by a page's first
 * effects already see the provider.
 */
export function AnalyticsProvider({
  provider,
  children,
}: {
  provider: AnalyticsProviderName
  children: ReactNode
}) {
  const track = useCallback<Track>(
    (event) => {
      if (provider === 'console') {
        const buffer = (window.veloraAnalytics ??= [])
        buffer.push(event)
        if (buffer.length > LOCAL_BUFFER_LIMIT) buffer.splice(0, buffer.length - LOCAL_BUFFER_LIMIT)
        window.dispatchEvent(new CustomEvent('velora:analytics', { detail: event }))
      } else if (provider === 'ga4') {
        const [name, params] = toGa4(event)
        window.gtag?.('event', name, params)
      }
    },
    [provider],
  )
  return <AnalyticsContext value={track}>{children}</AnalyticsContext>
}

export function useAnalytics(): Track {
  return useContext(AnalyticsContext)
}

/**
 * Fires an event when a page is shown: once per distinct event, so a refresh
 * of the same page does not repeat it but navigating to another product does.
 * With `onceKey`, at most once per browser session (e.g. a purchase
 * confirmation that is reloaded).
 */
export function TrackEvent({ event, onceKey }: { event: AnalyticsEvent; onceKey?: string }) {
  const track = useAnalytics()
  const lastSent = useRef<string | null>(null)
  useEffect(() => {
    const signature = JSON.stringify(event)
    if (lastSent.current === signature) return
    lastSent.current = signature
    if (onceKey && !claimOnce(onceKey)) return
    track(event)
  }, [event, onceKey, track])
  return null
}

function claimOnce(key: string): boolean {
  const storageKey = `velora:analytics:${key}`
  try {
    if (window.sessionStorage.getItem(storageKey)) return false
    window.sessionStorage.setItem(storageKey, '1')
  } catch {
    // Storage unavailable (private mode): sending twice is better than never.
    return true
  }
  return true
}
