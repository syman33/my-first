import { type Instrumentation } from 'next'

/**
 * Next.js instrumentation entry. Node-specific startup lives in
 * `instrumentation.node.ts`, loaded only in the Node.js runtime so the Edge
 * compilation never sees Node-only APIs.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation.node')
    await registerNode()
  }
}

/** Server-side error reporting hook: every uncaught render/route/action error lands here. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportRequestError } = await import('./instrumentation.node')
  await reportRequestError(error, request, context)
}
