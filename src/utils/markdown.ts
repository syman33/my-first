/**
 * A deliberately small Markdown subset for CMS pages (policies, about):
 * headings, paragraphs, bold/italic, links, ordered and unordered lists,
 * tables and horizontal rules. It produces a typed tree that is rendered as
 * React elements — never raw HTML — so admin-edited content cannot inject
 * markup or scripts. Links are limited to site paths, https and mailto.
 */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' }

export function safeHref(href: string): string | null {
  const value = href.trim()
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

// Link targets may contain one level of balanced parentheses, as in CommonMark.
const INLINE_PATTERN =
  /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|(?<![\p{L}\p{N}])[*_](.+?)[*_](?![\p{L}\p{N}])/gu

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index
    if (index > last) out.push({ type: 'text', value: text.slice(last, index) })
    const [whole, strong, linkText, linkHref, em] = match
    if (strong !== undefined) {
      out.push({ type: 'strong', children: parseInline(strong) })
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref)
      out.push(
        href
          ? { type: 'link', href, children: parseInline(linkText) }
          : { type: 'text', value: linkText },
      )
    } else if (em !== undefined) {
      out.push({ type: 'em', children: parseInline(em) })
    } else {
      out.push({ type: 'text', value: whole })
    }
    last = index + whole.length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

const UNORDERED = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^(#{1,4})\s+(.*)$/
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i++
      continue
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const hashes = heading[1]!.length
      const level = (hashes <= 2 ? 2 : hashes) as 2 | 3 | 4
      blocks.push({ type: 'heading', level, children: parseInline(heading[2]!.trim()) })
      i++
      continue
    }
    if (line.trim().startsWith('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      const header = tableCells(line).map(parseInline)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        rows.push(tableCells(lines[i]!).map(parseInline))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }
    const listPattern = UNORDERED.test(line) ? UNORDERED : ORDERED.test(line) ? ORDERED : null
    if (listPattern) {
      const items: Inline[][] = []
      while (i < lines.length && listPattern.test(lines[i]!)) {
        items.push(parseInline(listPattern.exec(lines[i]!)![1]!.trim()))
        i++
      }
      blocks.push({ type: 'list', ordered: listPattern === ORDERED, items })
      continue
    }
    const paragraph: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !HEADING.test(lines[i]!) &&
      !UNORDERED.test(lines[i]!) &&
      !ORDERED.test(lines[i]!) &&
      !lines[i]!.trim().startsWith('|')
    ) {
      paragraph.push(lines[i]!.trim())
      i++
    }
    if (paragraph.length === 0) {
      // A stray line (e.g. a lone "|") — keep it as text rather than looping.
      paragraph.push(line.trim())
      i++
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) })
  }
  return blocks
}

/** Plain text (for meta descriptions and JSON-LD). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => (node.type === 'text' ? node.value : inlineText(node.children)))
    .join('')
}
