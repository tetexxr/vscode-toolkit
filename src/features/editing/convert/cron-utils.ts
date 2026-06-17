/**
 * Pure cron parsing, human description, and next-run calculation for the cron
 * hover. vscode-free for mocha. Supports standard 5-field cron and 6-field
 * (seconds-first) cron, with `*`, ranges, lists, steps, and month/day names.
 * Quartz extras (L, W, #) are intentionally not supported.
 */

export interface CronField {
  values: number[]
  set: Set<number>
  isWildcard: boolean
  raw: string
}

export interface ParsedCron {
  second: CronField
  minute: CronField
  hour: CronField
  dom: CronField
  month: CronField
  dow: CronField
  hasSeconds: boolean
}

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
}
const DOW_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function resolveName(token: string, min: number, max: number, names?: Record<string, number>): number | null {
  if (/^\d+$/.test(token)) {
    const n = parseInt(token, 10)
    return n >= min && n <= max ? n : null
  }
  if (names) {
    const value = names[token.toUpperCase()]
    if (value !== undefined) {
      return value
    }
  }
  return null
}

function parsePart(part: string, min: number, max: number, names: Record<string, number> | undefined, set: Set<number>): boolean {
  const [rangePart, stepPart] = part.split('/')
  let step = 1
  if (stepPart !== undefined) {
    step = parseInt(stepPart, 10)
    if (!/^\d+$/.test(stepPart) || step < 1) {
      return false
    }
  }
  let lo: number
  let hi: number
  if (rangePart === '*' || rangePart === '?') {
    lo = min
    hi = max
  } else if (rangePart.includes('-')) {
    const [a, b] = rangePart.split('-')
    const la = resolveName(a, min, max, names)
    const lb = resolveName(b, min, max, names)
    if (la === null || lb === null || la > lb) {
      return false
    }
    lo = la
    hi = lb
  } else {
    const v = resolveName(rangePart, min, max, names)
    if (v === null) {
      return false
    }
    if (stepPart === undefined) {
      set.add(v)
      return true
    }
    lo = v
    hi = max
  }
  for (let v = lo; v <= hi; v += step) {
    set.add(v)
  }
  return true
}

function parseField(raw: string, min: number, max: number, names?: Record<string, number>): CronField | null {
  if (raw === '*' || raw === '?') {
    const set = new Set<number>()
    for (let v = min; v <= max; v++) {
      set.add(v)
    }
    return { values: [...set], set, isWildcard: true, raw }
  }
  const set = new Set<number>()
  for (const part of raw.split(',')) {
    if (part.length === 0 || !parsePart(part, min, max, names, set)) {
      return null
    }
  }
  if (set.size === 0) {
    return null
  }
  return { values: [...set].sort((a, b) => a - b), set, isWildcard: false, raw }
}

/** Parses a cron expression (5 or 6 fields). Returns null when it isn't valid cron. */
export function parseCron(expression: string): ParsedCron | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5 && parts.length !== 6) {
    return null
  }
  const hasSeconds = parts.length === 6
  const [secRaw, minRaw, hourRaw, domRaw, monthRaw, dowRaw] = hasSeconds
    ? parts
    : ['0', ...parts]

  const second = parseField(secRaw, 0, 59)
  const minute = parseField(minRaw, 0, 59)
  const hour = parseField(hourRaw, 0, 23)
  const dom = parseField(domRaw, 1, 31)
  const month = parseField(monthRaw, 1, 12, MONTH_NAMES)
  const dow = parseField(dowRaw, 0, 7, DOW_NAMES)
  if (!second || !minute || !hour || !dom || !month || !dow) {
    return null
  }
  // Normalize Sunday: cron allows both 0 and 7.
  if (dow.set.has(7)) {
    dow.set.delete(7)
    dow.set.add(0)
    dow.values = [...dow.set].sort((a, b) => a - b)
  }
  return { second, minute, hour, dom, month, dow, hasSeconds }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function single(field: CronField): number | null {
  return field.values.length === 1 ? field.values[0] : null
}

function stepOf(raw: string): number | null {
  const match = /^\*\/(\d+)$/.exec(raw)
  return match ? parseInt(match[1], 10) : null
}

/** Builds a human-readable description of a parsed cron expression. */
export function describeCron(cron: ParsedCron): string {
  const { second, minute, hour, dom, month, dow, hasSeconds } = cron
  const restWild = hour.isWildcard && dom.isWildcard && month.isWildcard && dow.isWildcard

  // Day / month qualifiers shared by most branches.
  const qualifiers: string[] = []
  if (!dom.isWildcard) {
    qualifiers.push(`on day-of-month ${dom.values.join(', ')}`)
  }
  if (!month.isWildcard) {
    qualifiers.push(`in ${month.values.map(m => MONTH_LABELS[m - 1]).join(', ')}`)
  }
  if (!dow.isWildcard) {
    qualifiers.push(`on ${dow.values.map(d => DAY_LABELS[d]).join(', ')}`)
  }
  const tail = qualifiers.length > 0 ? `, ${qualifiers.join(', ')}` : ''

  // "Every N seconds/minutes" and "every second/minute".
  if (restWild && minute.isWildcard) {
    if (hasSeconds) {
      const secStep = stepOf(second.raw)
      if (secStep) {
        return `Every ${secStep} seconds`
      }
      if (second.isWildcard) {
        return 'Every second'
      }
    }
    return 'Every minute'
  }
  if (restWild) {
    const minStep = stepOf(minute.raw)
    if (minStep && (!hasSeconds || single(second) === 0)) {
      return `Every ${minStep} minutes`
    }
  }

  const m = single(minute)
  const h = single(hour)
  const s = single(second)
  if (m !== null && h !== null) {
    const time = hasSeconds && s !== null ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`
    return `At ${time}${tail}`
  }
  if (m !== null && hour.isWildcard) {
    return `At minute ${m} of every hour${tail}`
  }
  const minutePhrase = minute.isWildcard ? 'every minute' : `minute ${minute.values.join(', ')}`
  const hourPhrase = hour.isWildcard ? 'every hour' : `hour ${hour.values.join(', ')}`
  return `At ${minutePhrase} past ${hourPhrase}${tail}`
}

function matchesDay(cron: ParsedCron, date: Date): boolean {
  const domMatch = cron.dom.set.has(date.getDate())
  const dowMatch = cron.dow.set.has(date.getDay())
  // Vixie cron rule: when both day fields are restricted, either may match.
  if (!cron.dom.isWildcard && !cron.dow.isWildcard) {
    return domMatch || dowMatch
  }
  if (!cron.dom.isWildcard) {
    return domMatch
  }
  if (!cron.dow.isWildcard) {
    return dowMatch
  }
  return true
}

function matches(cron: ParsedCron, date: Date): boolean {
  return (
    cron.second.set.has(date.getSeconds()) &&
    cron.minute.set.has(date.getMinutes()) &&
    cron.hour.set.has(date.getHours()) &&
    cron.month.set.has(date.getMonth() + 1) &&
    matchesDay(cron, date)
  )
}

/**
 * Computes the next `count` run times strictly after `from`. Iterates by second
 * for 6-field expressions, otherwise by minute, capped so an impossible
 * expression can't loop forever (it just returns fewer results).
 */
export function nextRuns(cron: ParsedCron, from: Date, count: number): Date[] {
  const runs: Date[] = []
  const cursor = new Date(from.getTime())
  cursor.setMilliseconds(0)
  if (cron.hasSeconds) {
    cursor.setSeconds(cursor.getSeconds() + 1)
  } else {
    cursor.setSeconds(0)
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  const stepSeconds = cron.hasSeconds ? 1 : 60
  const maxIterations = cron.hasSeconds ? 1_000_000 : 2_000_000
  for (let i = 0; i < maxIterations && runs.length < count; i++) {
    if (matches(cron, cursor)) {
      runs.push(new Date(cursor.getTime()))
    }
    cursor.setSeconds(cursor.getSeconds() + stepSeconds)
  }
  return runs
}
