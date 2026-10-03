import { Fragment, type ReactNode } from 'react'

/**
 * Like `interpolate`, but placeholders may be React nodes (links, emphasis).
 * Keeps word order inside the translation, which matters for Arabic where
 * particles attach to the following word (e.g. "و{privacy}").
 */
export function interpolateNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/(\{\w+\})/g)
  return parts.map((part, index) => {
    const match = /^\{(\w+)\}$/.exec(part)
    const key = match?.[1]
    if (key !== undefined && Object.prototype.hasOwnProperty.call(values, key)) {
      return <Fragment key={index}>{values[key]}</Fragment>
    }
    return part ? <Fragment key={index}>{part}</Fragment> : null
  })
}
