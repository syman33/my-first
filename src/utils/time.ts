/**
 * Date/time utilities.
 *
 * Storage rule: every timestamp is stored in UTC (`timestamptz`) and handled as
 * a JavaScript `Date` (an absolute instant). Display rule: dates are rendered
 * in the store time zone (Asia/Riyadh) regardless of the server's local zone,
 * so output never depends on where the code happens to run.
 */

export const STORE_TIME_ZONE = 'Asia/Riyadh'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE)
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY)
}

interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatterCache.set(timeZone, f)
  }
  return f
}

/** Wall-clock components of `date` in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string = STORE_TIME_ZONE): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`Missing ${type} in formatted date`)
    return Number(part.value)
  }
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Asia/Riyadh → +180). */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string = STORE_TIME_ZONE): number {
  const p = getZonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const truncated = Math.floor(date.getTime() / 1000) * 1000
  return Math.round((asUtc - truncated) / MINUTE)
}

/** The UTC instant corresponding to a wall-clock time in `timeZone`. */
export function zonedTimeToUtc(
  wall: {
    year: number
    month: number
    day: number
    hour?: number
    minute?: number
    second?: number
  },
  timeZone: string = STORE_TIME_ZONE,
): Date {
  const guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
  )
  // Two passes handle zones with DST transitions; Riyadh itself has a fixed +03:00 offset.
  let offset = getTimeZoneOffsetMinutes(new Date(guess), timeZone)
  let result = guess - offset * MINUTE
  const secondOffset = getTimeZoneOffsetMinutes(new Date(result), timeZone)
  if (secondOffset !== offset) {
    offset = secondOffset
    result = guess - offset * MINUTE
  }
  return new Date(result)
}

/** Start of the store-local calendar day containing `date`, as a UTC instant. */
export function startOfStoreDay(date: Date, timeZone: string = STORE_TIME_ZONE): Date {
  const p = getZonedParts(date, timeZone)
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day }, timeZone)
}

/** "YYYY-MM-DD" of `date` in the store time zone (used for daily report buckets). */
export function toStoreDateKey(date: Date, timeZone: string = STORE_TIME_ZONE): string {
  const p = getZonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Parse "YYYY-MM-DD" as the start of that day in the store time zone. */
export function parseStoreDateKey(key: string, timeZone: string = STORE_TIME_ZONE): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) throw new RangeError(`Invalid date key: ${key}`)
  const [, y, mo, d] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar date: ${key}`)
  }
  return zonedTimeToUtc({ year, month, day }, timeZone)
}

/** Calendar year of `date` in the store time zone (order numbers use the Riyadh year). */
export function storeYear(date: Date, timeZone: string = STORE_TIME_ZONE): number {
  return getZonedParts(date, timeZone).year
}

export type DateRangePreset = 'today' | '7d' | '30d'

/**
 * Resolve a dashboard preset to a half-open UTC interval [from, to) aligned to
 * store-local midnight. "7d" means today plus the six previous days.
 */
export function resolveDateRange(
  preset: DateRangePreset,
  now: Date = new Date(),
  timeZone: string = STORE_TIME_ZONE,
): { from: Date; to: Date } {
  const todayStart = startOfStoreDay(now, timeZone)
  const tomorrowStart = startOfStoreDay(addHours(todayStart, 36), timeZone)
  const days = preset === 'today' ? 1 : preset === '7d' ? 7 : 30
  const from = startOfStoreDay(addDays(todayStart, -(days - 1)), timeZone)
  return { from, to: tomorrowStart }
}

/** Enumerate store-local day keys in [from, to). */
export function eachStoreDay(from: Date, to: Date, timeZone: string = STORE_TIME_ZONE): string[] {
  const keys: string[] = []
  let cursor = startOfStoreDay(from, timeZone)
  let guard = 0
  while (cursor < to && guard < 3700) {
    keys.push(toStoreDateKey(cursor, timeZone))
    cursor = startOfStoreDay(addHours(cursor, 36), timeZone)
    guard += 1
  }
  return keys
}
