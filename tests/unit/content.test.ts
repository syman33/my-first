import { describe, expect, it } from 'vitest'
import { safeBannerHref } from '@/services/content/banner.service'
import { renderPageTokens } from '@/services/content/page.service'
import { inlineText, parseInline, parseMarkdown, safeHref } from '@/utils/markdown'

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, lists and tables', () => {
    const blocks = parseMarkdown(
      [
        '# Title',
        '',
        'First line',
        'continues here.',
        '',
        '- one',
        '- **two**',
        '',
        '1. first',
        '2. second',
        '',
        '| Method | Fee |',
        '| --- | --- |',
        '| Standard | 25 SAR |',
        '',
        '---',
      ].join('\n'),
    )
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'table',
      'rule',
    ])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 })
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: 'First line continues here.' }],
    })
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [[{ value: 'one' }], [{ type: 'strong' }]],
    })
    expect(blocks[3]).toMatchObject({ ordered: true })
    expect(blocks[4]).toMatchObject({
      type: 'table',
      rows: [[[{ value: 'Standard' }], [{ value: '25 SAR' }]]],
    })
  })

  it('handles Arabic content with inline bold', () => {
    const [block] = parseMarkdown('**الشحن العادي مجاني** للطلبات')
    expect(block).toEqual({
      type: 'paragraph',
      children: [
        { type: 'strong', children: [{ type: 'text', value: 'الشحن العادي مجاني' }] },
        { type: 'text', value: ' للطلبات' },
      ],
    })
  })

  it('never produces markup from raw HTML', () => {
    const [block] = parseMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>')
    expect(block).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: '<script>alert(1)</script> <img src=x onerror=alert(1)>' }],
    })
  })

  it('drops unsafe links but keeps their text', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ type: 'text', value: 'click' }])
    expect(parseInline('[shipping](/ar/shipping)')).toEqual([
      { type: 'link', href: '/ar/shipping', children: [{ type: 'text', value: 'shipping' }] },
    ])
    expect(inlineText(parseInline('a **b** [c](https://example.com)'))).toBe('a b c')
  })
})

describe('safeHref', () => {
  it.each([
    ['/ar/faq', '/ar/faq'],
    ['https://velora.sa/x', 'https://velora.sa/x'],
    ['mailto:care@velora.sa', 'mailto:care@velora.sa'],
    ['//evil.example', null],
    ['http://insecure.example', null],
    ['javascript:alert(1)', null],
    ['data:text/html,hi', null],
  ])('%s → %s', (input, expected) => {
    expect(safeHref(input)).toBe(expected)
  })
})

describe('renderPageTokens', () => {
  const values = {
    standardFee: '25 ر.س',
    expressFee: '45 ر.س',
    freeShippingThreshold: '299 ر.س',
    codFee: '15 ر.س',
    returnWindowDays: '7',
    standardDays: '2–5',
    expressDays: '1–2',
  }

  it('replaces known tokens and leaves unknown ones visible', () => {
    expect(
      renderPageTokens('Free over {{freeShippingThreshold}}, {{ codFee }} COD, {{secret}}', values),
    ).toBe('Free over 299 ر.س, 15 ر.س COD, {{secret}}')
  })
})

describe('safeBannerHref', () => {
  it('localises store paths and rejects unsafe URLs', () => {
    expect(safeBannerHref('/bags', 'ar')).toBe('/ar/bags')
    expect(safeBannerHref('/en/offers', 'ar')).toBe('/en/offers')
    expect(safeBannerHref('/', 'en')).toBe('/en')
    expect(safeBannerHref('https://example.com/a', 'ar')).toBe('https://example.com/a')
    expect(safeBannerHref('javascript:alert(1)', 'ar')).toBeNull()
    expect(safeBannerHref('//evil.example', 'ar')).toBeNull()
    expect(safeBannerHref(null, 'ar')).toBeNull()
  })
})
