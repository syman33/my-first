'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { logger } from '@/lib/logger'

/**
 * Marks a contact message as read once a person has actually opened it in
 * the browser — never during server rendering, where a link prefetch could
 * otherwise mark messages nobody has seen.
 */
export function MarkReadOnView({ locale, messageId }: { locale: Locale; messageId: string }) {
  const router = useRouter()
  useEffect(() => {
    const controller = new AbortController()
    apiRequest(`/api/admin/messages/${messageId}/status`, {
      body: { status: 'READ' },
      locale,
      signal: controller.signal,
    })
      .then(() => router.refresh())
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          logger.warn('admin.mark_read_failed', { messageId })
        }
      })
    return () => controller.abort()
  }, [locale, messageId, router])
  return null
}
