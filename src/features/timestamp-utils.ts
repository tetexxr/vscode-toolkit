export type InputFormat = 'seconds' | 'millis' | 'micros' | 'iso'

const ISO_LIKE = /^-?\d{4}-\d{1,2}-\d{1,2}([T ]\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/

// Plausibility window for the ambiguous-length fallback. The lower bound sits
// above 1970 so degenerate "everything maps to the epoch" readings don't win.
const PLAUSIBLE_MIN_MS = Date.UTC(1971, 0, 1)
const PLAUSIBLE_MAX_MS = Date.UTC(2150, 11, 31, 23, 59, 59, 999)

function toMillis(n: number, format: 'seconds' | 'millis' | 'micros'): number {
  if (format === 'seconds') {
    return n * 1000
  }
  if (format === 'micros') {
    return n / 1000
  }
  return n
}

export function detectInputFormat(input: string): InputFormat | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (/^-?\d+$/.test(trimmed)) {
    const digitCount = trimmed.replace('-', '').length
    if (digitCount === 10) {
      return 'seconds'
    }
    if (digitCount === 13) {
      return 'millis'
    }
    if (digitCount === 16) {
      return 'micros'
    }
    // Ambiguous length: pick the first interpretation that lands on a
    // plausible date (e.g. 9-digit values are 1973–2001 epochs in seconds).
    const n = Number(trimmed)
    if (Number.isFinite(n)) {
      for (const format of ['seconds', 'millis', 'micros'] as const) {
        const ms = toMillis(n, format)
        if (ms >= PLAUSIBLE_MIN_MS && ms <= PLAUSIBLE_MAX_MS) {
          return format
        }
      }
    }
    return 'millis'
  }
  if (ISO_LIKE.test(trimmed)) {
    return 'iso'
  }
  return null
}

export function parseTimestamp(input: string, format?: InputFormat): Date | null {
  const trimmed = input.trim()
  const f = format ?? detectInputFormat(trimmed)
  if (!f) {
    return null
  }
  if (f === 'seconds') {
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      return null
    }
    return new Date(n * 1000)
  }
  if (f === 'millis') {
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      return null
    }
    return new Date(n)
  }
  if (f === 'micros') {
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      return null
    }
    return new Date(Math.round(n / 1000))
  }
  // ISO
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) {
    return null
  }
  return d
}

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

export function toIsoUtc(date: Date): string {
  return date.toISOString()
}

export function toIsoLocal(date: Date, offsetMinutes: number = -date.getTimezoneOffset()): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hh = pad2(Math.floor(abs / 60))
  const mm = pad2(abs % 60)
  const local = new Date(date.getTime() + offsetMinutes * 60000)
  const yyyy = local.getUTCFullYear()
  const MM = pad2(local.getUTCMonth() + 1)
  const dd = pad2(local.getUTCDate())
  const HH = pad2(local.getUTCHours())
  const mmStr = pad2(local.getUTCMinutes())
  const ss = pad2(local.getUTCSeconds())
  const ms = String(local.getUTCMilliseconds()).padStart(3, '0')
  return `${yyyy}-${MM}-${dd}T${HH}:${mmStr}:${ss}.${ms}${sign}${hh}:${mm}`
}

export function toUnixSeconds(date: Date): string {
  return String(Math.floor(date.getTime() / 1000))
}

export function toUnixMillis(date: Date): string {
  return String(date.getTime())
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/* -------------------------------------------------------------------------- */
/*  Relative time                                                             */
/* -------------------------------------------------------------------------- */

interface RelativeUnit {
  label: string
  ms: number
}

const RELATIVE_UNITS: RelativeUnit[] = [
  { label: 'year', ms: 365.25 * 24 * 60 * 60 * 1000 },
  { label: 'month', ms: (365.25 / 12) * 24 * 60 * 60 * 1000 },
  { label: 'day', ms: 24 * 60 * 60 * 1000 },
  { label: 'hour', ms: 60 * 60 * 1000 },
  { label: 'minute', ms: 60 * 1000 },
  { label: 'second', ms: 1000 }
]

export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime()
  const abs = Math.abs(diff)
  if (abs < 1000) {
    return 'just now'
  }
  for (const unit of RELATIVE_UNITS) {
    if (abs >= unit.ms) {
      const value = Math.round(abs / unit.ms)
      const plural = value === 1 ? unit.label : `${unit.label}s`
      return diff < 0 ? `${value} ${plural} ago` : `in ${value} ${plural}`
    }
  }
  return 'just now'
}

/* -------------------------------------------------------------------------- */
/*  Hover heuristics                                                          */
/* -------------------------------------------------------------------------- */

export interface HoverHeuristics {
  minYear: number
  maxYear: number
}

export interface EpochCandidate {
  raw: string
  format: 'seconds' | 'millis' | 'micros'
  date: Date
}

/**
 * Decides whether `digits` (a string of base-10 digits) is plausibly a timestamp,
 * for the configured year range. Returns the candidate(s) in priority order.
 */
export function interpretAsEpoch(digits: string, opts: HoverHeuristics): EpochCandidate[] {
  if (!/^\d+$/.test(digits)) {
    return []
  }
  const n = Number(digits)
  if (!Number.isFinite(n)) {
    return []
  }
  const minMs = Date.UTC(opts.minYear, 0, 1)
  const maxMs = Date.UTC(opts.maxYear, 11, 31, 23, 59, 59, 999)

  const candidates: EpochCandidate[] = []
  if (digits.length === 10) {
    const ms = n * 1000
    if (ms >= minMs && ms <= maxMs) {
      candidates.push({ raw: digits, format: 'seconds', date: new Date(ms) })
    }
  }
  if (digits.length === 13) {
    if (n >= minMs && n <= maxMs) {
      candidates.push({ raw: digits, format: 'millis', date: new Date(n) })
    }
  }
  if (digits.length === 16) {
    const ms = Math.round(n / 1000)
    if (ms >= minMs && ms <= maxMs) {
      candidates.push({ raw: digits, format: 'micros', date: new Date(ms) })
    }
  }
  return candidates
}
