/**
 * Pure geometry for the admin charts: "nice" axis ticks and point positions.
 * Values are integer halalas; ticks fall on whole riyals so axis labels stay
 * clean (0 / 2,500 / 5,000 …).
 */

const NICE_STEPS = [1, 2, 2.5, 5, 10]

/** Ticks from 0 to a rounded maximum ≥ `max`, about `count` intervals. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 100]
  const maxRiyals = Math.ceil(max / 100)
  const rough = maxRiyals / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = (NICE_STEPS.find((s) => s * magnitude >= rough) ?? 10) * magnitude
  const stepRiyals = Math.max(1, Math.round(step))
  const top = Math.ceil(maxRiyals / stepRiyals) * stepRiyals
  const ticks: number[] = []
  for (let value = 0; value <= top; value += stepRiyals) ticks.push(value * 100)
  return ticks
}

/** Horizontal position of point `index` of `count` in percent (a lone point sits in the middle). */
export function xPercent(index: number, count: number): number {
  if (count <= 1) return 50
  return (index / (count - 1)) * 100
}

/** Which labels to print on the x-axis so they never crowd (always the first and last). */
export function labelIndexes(count: number, maxLabels = 8): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i)
  const step = Math.ceil((count - 1) / (maxLabels - 1))
  const out: number[] = []
  for (let i = 0; i < count - 1; i += step) out.push(i)
  // Keep the last label, dropping a neighbour that would collide with it.
  if (out.length > 0 && count - 1 - out[out.length - 1]! < step / 2) out.pop()
  out.push(count - 1)
  return out
}
