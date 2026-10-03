import Link from 'next/link'
import type { Route } from 'next'
import { Fragment, type ReactNode } from 'react'
import { type Block, type Inline, parseMarkdown } from '@/utils/markdown'

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.value}</Fragment>
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>
      case 'link':
        return node.href.startsWith('/') ? (
          <Link key={index} href={node.href as Route}>
            {renderInline(node.children)}
          </Link>
        ) : (
          <a key={index} href={node.href} rel="noopener noreferrer">
            {renderInline(node.children)}
          </a>
        )
    }
  })
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4'
      return <Tag key={index}>{renderInline(block.children)}</Tag>
    }
    case 'paragraph':
      return <p key={index}>{renderInline(block.children)}</p>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag key={index}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <div key={index} className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} scope="col">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'rule':
      return <hr key={index} />
  }
}

/** Renders CMS Markdown as React elements (no raw HTML) — see utils/markdown. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className ?? 'prose-velora'}>{parseMarkdown(source).map(renderBlock)}</div>
}
