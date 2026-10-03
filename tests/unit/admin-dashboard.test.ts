import { describe, expect, it } from 'vitest'
import { labelIndexes, niceTicks, xPercent } from '@/lib/admin/chart'
import { averageOrderValue, changeBps, SALE_STATUSES } from '@/lib/admin/metrics'

describe('chart ticks', () => {
  it('rounds the axis up to clean riyal steps from zero', () => {
    expect(niceTicks(1_234_500)).toEqual([0, 500_000, 1_000_000, 1_500_000])
    expect(niceTicks(99_900)).toEqual([0, 25_000, 50_000, 75_000, 100_000])
    expect(niceTicks(150)).toEqual([0, 100, 200])
  })

  it('always covers the maximum and starts at zero', () => {
    for (const max of [1, 99, 100, 101, 7_777, 123_456_789]) {
      const ticks = niceTicks(max)
      expect(ticks[0]).toBe(0)
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max)
      expect(ticks.every((tick) => tick % 100 === 0)).toBe(true)
    }
  })

  it('gives an empty range a usable axis', () => {
    expect(niceTicks(0)).toEqual([0, 100])
  })
})

describe('chart positions and labels', () => {
  it('spreads points edge to edge and centres a lone point', () => {
    expect(xPercent(0, 7)).toBe(0)
    expect(xPercent(6, 7)).toBe(100)
    expect(xPercent(3, 7)).toBe(50)
    expect(xPercent(0, 1)).toBe(50)
  })

  it('labels every point of a short range and thins long ones, keeping both ends', () => {
    expect(labelIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6])
    const thirty = labelIndexes(30)
    expect(thirty[0]).toBe(0)
    expect(thirty[thirty.length - 1]).toBe(29)
    expect(thirty.length).toBeLessThanOrEqual(8)
    const hours = labelIndexes(24)
    expect(hours[hours.length - 1]).toBe(23)
    expect(hours.length).toBeLessThanOrEqual(8)
  })
})

describe('dashboard metrics', () => {
  it('counts accepted orders only', () => {
    expect(SALE_STATUSES).not.toContain('PENDING')
    expect(SALE_STATUSES).not.toContain('CANCELLED')
    expect(SALE_STATUSES).toContain('DELIVERED')
  })

  it('computes change against the previous period, or nothing without a base', () => {
    expect(changeBps(150, 100)).toBe(5_000)
    expect(changeBps(50, 100)).toBe(-5_000)
    expect(changeBps(100, 100)).toBe(0)
    expect(changeBps(100, 0)).toBeNull()
  })

  it('rounds the average order value to the halala', () => {
    expect(averageOrderValue(100_000, 3)).toBe(33_333)
    expect(averageOrderValue(100_001, 2)).toBe(50_001)
    expect(averageOrderValue(0, 0)).toBe(0)
  })
})
