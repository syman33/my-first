import { describe, expect, it } from 'vitest'
import {
  eachStoreDay,
  getTimeZoneOffsetMinutes,
  parseStoreDateKey,
  parseStoreDateTimeLocal,
  resolveDateRange,
  startOfStoreDay,
  storeYear,
  toStoreDateKey,
  toStoreDateTimeLocal,
  zonedTimeToUtc,
} from '@/utils/time'

describe('store time zone (Asia/Riyadh, UTC+3, no DST)', () => {
  it('reports a fixed +180 minute offset year-round', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(180)
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(180)
  })

  it('converts Riyadh wall-clock time to the correct UTC instant', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 9, day: 28 }).toISOString()).toBe(
      '2026-09-27T21:00:00.000Z',
    )
    expect(zonedTimeToUtc({ year: 2026, month: 1, day: 1, hour: 2 }).toISOString()).toBe(
      '2025-12-31T23:00:00.000Z',
    )
  })

  it('handles zones with DST as well', () => {
    // 2026-03-29 is the EU spring-forward day; 12:00 in Berlin is then UTC+2.
    expect(
      zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 12 }, 'Europe/Berlin').toISOString(),
    ).toBe('2026-03-29T10:00:00.000Z')
  })

  it('finds the start of the Riyadh day even when UTC is still on the previous date', () => {
    // 22:30 UTC on the 27th is already 01:30 on the 28th in Riyadh.
    const instant = new Date('2026-09-27T22:30:00Z')
    expect(toStoreDateKey(instant)).toBe('2026-09-28')
    expect(startOfStoreDay(instant).toISOString()).toBe('2026-09-27T21:00:00.000Z')
  })

  it('uses the Riyadh year for yearly document numbering', () => {
    expect(storeYear(new Date('2026-12-31T21:30:00Z'))).toBe(2027)
    expect(storeYear(new Date('2026-12-31T20:59:59Z'))).toBe(2026)
  })

  it('parses and validates date keys', () => {
    expect(parseStoreDateKey('2026-09-28').toISOString()).toBe('2026-09-27T21:00:00.000Z')
    expect(() => parseStoreDateKey('2026-02-30')).toThrow(RangeError)
    expect(() => parseStoreDateKey('28/09/2026')).toThrow(RangeError)
  })
})

describe('dashboard date ranges', () => {
  const now = new Date('2026-09-28T09:00:00Z') // 12:00 Riyadh

  it('today is the current Riyadh calendar day', () => {
    const { from, to } = resolveDateRange('today', now)
    expect(from.toISOString()).toBe('2026-09-27T21:00:00.000Z')
    expect(to.toISOString()).toBe('2026-09-28T21:00:00.000Z')
  })

  it('7d includes today and the six previous days', () => {
    const { from, to } = resolveDateRange('7d', now)
    expect(eachStoreDay(from, to)).toEqual([
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
    ])
  })

  it('30d spans exactly thirty days', () => {
    const { from, to } = resolveDateRange('30d', now)
    expect(eachStoreDay(from, to)).toHaveLength(30)
  })
})

describe('datetime-local values (admin schedules)', () => {
  it('reads the value as Riyadh wall-clock time', () => {
    expect(parseStoreDateTimeLocal('2026-09-23T00:00').toISOString()).toBe(
      '2026-09-22T21:00:00.000Z',
    )
    expect(parseStoreDateTimeLocal('2026-12-31T23:59').toISOString()).toBe(
      '2026-12-31T20:59:00.000Z',
    )
  })

  it('formats an instant back for the input, including midnight', () => {
    expect(toStoreDateTimeLocal(new Date('2026-09-22T21:00:00.000Z'))).toBe('2026-09-23T00:00')
    expect(toStoreDateTimeLocal(new Date('2026-03-01T09:45:30.000Z'))).toBe('2026-03-01T12:45')
    const instant = new Date('2027-01-01T20:59:00.000Z')
    expect(parseStoreDateTimeLocal(toStoreDateTimeLocal(instant))).toEqual(instant)
  })

  it('rejects malformed and impossible dates', () => {
    for (const value of [
      '2026-02-30T10:00',
      '2026-13-01T10:00',
      '2026-01-01T24:00',
      '2026-01-01T10:60',
      '2026-01-01 10:00',
      '2026-01-01T10:00:00',
      '',
    ]) {
      expect(() => parseStoreDateTimeLocal(value), value).toThrow(RangeError)
    }
  })
})
