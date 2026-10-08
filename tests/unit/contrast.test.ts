import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WCAG 2.1 AA colour contrast for the design tokens actually used together
 * (spec §76). Reads the real tokens from globals.css, so changing a colour
 * that breaks readability fails here before it reaches a page.
 */

const css = readFileSync(path.resolve(import.meta.dirname, '../../src/styles/globals.css'), 'utf8')
const tokens = new Map(
  [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((match) => [
    match[1]!,
    match[2]!,
  ]),
)

function color(name: string): string {
  const value = tokens.get(name)
  if (!value) throw new Error(`Unknown colour token --color-${name}`)
  return value
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(color(foreground)), luminance(color(background))].sort(
    (a, b) => b - a,
  )
  return (light! + 0.05) / (dark! + 0.05)
}

const AA_BODY_TEXT = 4.5

describe('design token contrast (WCAG AA)', () => {
  it('reads the palette from globals.css', () => {
    expect(tokens.size).toBeGreaterThan(15)
  })

  const surfaces = ['ivory', 'paper', 'sand', 'champagne-soft']
  const textColours = ['ink', 'text', 'muted', 'champagne-strong', 'danger', 'success', 'warning']
  for (const text of textColours) {
    for (const surface of surfaces) {
      it(`${text} text on ${surface} is readable`, () => {
        expect(contrast(text, surface)).toBeGreaterThanOrEqual(AA_BODY_TEXT)
      })
    }
  }

  for (const tone of ['danger', 'success', 'warning']) {
    it(`${tone} text on its own soft background is readable`, () => {
      expect(contrast(tone, `${tone}-soft`)).toBeGreaterThanOrEqual(AA_BODY_TEXT)
    })
  }

  it('light text on ink (buttons, footer) is readable', () => {
    for (const text of ['paper', 'ivory', 'line', 'champagne']) {
      expect(contrast(text, 'ink')).toBeGreaterThanOrEqual(AA_BODY_TEXT)
    }
  })
})
