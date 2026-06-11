import { strict as assert } from 'assert'
import {
  detectInputFormat,
  parseTimestamp,
  toIsoUtc,
  toIsoLocal,
  toUnixSeconds,
  toUnixMillis,
  formatRelative,
  interpretAsEpoch
} from '../../src/features/timestamp-utils'

describe('detectInputFormat', () => {
  it('should detect 10-digit numbers as seconds', () => {
    assert.equal(detectInputFormat('1700000000'), 'seconds')
  })

  it('should detect 13-digit numbers as milliseconds', () => {
    assert.equal(detectInputFormat('1700000000000'), 'millis')
  })

  it('should detect 16-digit numbers as microseconds', () => {
    assert.equal(detectInputFormat('1700000000000000'), 'micros')
  })

  it('should fall back to milliseconds for other digit lengths with no plausible reading', () => {
    assert.equal(detectInputFormat('12345'), 'millis')
    // 14 digits, but its micros reading lands in 1970 — not plausible either
    assert.equal(detectInputFormat('12345678901234'), 'millis')
    assert.equal(detectInputFormat('99999999999999999999'), 'millis')
  })

  it('should detect 9-digit numbers as seconds (1973–2001 epochs)', () => {
    assert.equal(detectInputFormat('999999999'), 'seconds') // 2001-09-09
    assert.equal(detectInputFormat('500000000'), 'seconds') // 1985-11-05
  })

  it('should detect 11- and 12-digit numbers as milliseconds', () => {
    assert.equal(detectInputFormat('99999999999'), 'millis') // 1973-03-03
    assert.equal(detectInputFormat('999999999999'), 'millis') // 2001-09-09
  })

  it('should detect 14- and 15-digit numbers with plausible micros readings as microseconds', () => {
    assert.equal(detectInputFormat('50000000000000'), 'micros') // 1971-08-02
    assert.equal(detectInputFormat('999999999999999'), 'micros') // 2001-09-09
  })

  it('should detect ISO 8601 strings', () => {
    assert.equal(detectInputFormat('2024-03-15T12:34:56Z'), 'iso')
    assert.equal(detectInputFormat('2024-03-15T12:34:56.789Z'), 'iso')
    assert.equal(detectInputFormat('2024-03-15T12:34:56+02:00'), 'iso')
    assert.equal(detectInputFormat('2024-03-15'), 'iso')
  })

  it('should detect ISO-like strings with a space separator', () => {
    assert.equal(detectInputFormat('2024-01-02 10:30'), 'iso')
    assert.equal(detectInputFormat('2024-01-02 10:30:45'), 'iso')
  })

  it('should detect ISO strings with an offset without colon', () => {
    assert.equal(detectInputFormat('2024-03-15T12:34:56+0200'), 'iso')
  })

  it('should parse the space-separated and no-colon-offset variants', () => {
    const spaced = parseTimestamp('2024-01-02 10:30')
    assert.ok(spaced)
    assert.equal(spaced!.getFullYear(), 2024)
    const offset = parseTimestamp('2024-03-15T12:34:56+0200')
    assert.ok(offset)
    assert.equal(offset!.toISOString(), '2024-03-15T10:34:56.000Z')
  })

  it('should return null for unrecognized input', () => {
    assert.equal(detectInputFormat(''), null)
    assert.equal(detectInputFormat('hello world'), null)
    assert.equal(detectInputFormat('not a date'), null)
  })

  it('should handle negative integers (pre-1970 epochs)', () => {
    // 10 digits after the sign → seconds
    assert.equal(detectInputFormat('-1000000000'), 'seconds')
    // Other digit lengths fall back to millis
    assert.equal(detectInputFormat('-12345'), 'millis')
  })

  it('should trim surrounding whitespace before detection', () => {
    assert.equal(detectInputFormat('  1700000000  '), 'seconds')
  })
})

describe('parseTimestamp', () => {
  it('should parse Unix seconds correctly', () => {
    const date = parseTimestamp('1700000000')
    assert.equal(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('should parse Unix milliseconds correctly', () => {
    const date = parseTimestamp('1700000000000')
    assert.equal(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('should parse Unix microseconds correctly', () => {
    const date = parseTimestamp('1700000000000000')
    assert.equal(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('should parse ISO 8601 strings', () => {
    const date = parseTimestamp('2024-03-15T12:34:56.789Z')
    assert.equal(date!.getTime(), Date.UTC(2024, 2, 15, 12, 34, 56, 789))
  })

  it('should return null for invalid input', () => {
    assert.equal(parseTimestamp('not a date'), null)
    assert.equal(parseTimestamp(''), null)
  })

  it('should respect an explicit format hint', () => {
    // 13-digit value, but force interpretation as seconds (overflow far into future).
    const date = parseTimestamp('1700000000000', 'seconds')
    assert.ok(date instanceof Date)
    assert.notEqual(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })
})

describe('toIsoUtc / toIsoLocal / toUnixSeconds / toUnixMillis', () => {
  const date = new Date(Date.UTC(2024, 2, 15, 12, 34, 56, 789))

  it('should emit standard ISO 8601 Z form from toIsoUtc', () => {
    assert.equal(toIsoUtc(date), '2024-03-15T12:34:56.789Z')
  })

  it('should round down to seconds in toUnixSeconds', () => {
    assert.equal(toUnixSeconds(date), String(Math.floor(date.getTime() / 1000)))
  })

  it('should return full ms in toUnixMillis', () => {
    assert.equal(toUnixMillis(date), String(date.getTime()))
  })

  it('should match the UTC representation when toIsoLocal is given a +00:00 offset', () => {
    assert.equal(toIsoLocal(date, 0), '2024-03-15T12:34:56.789+00:00')
  })

  it('should render +02:00 in toIsoLocal when given a +120 minute offset (CEST)', () => {
    assert.equal(toIsoLocal(date, 120), '2024-03-15T14:34:56.789+02:00')
  })

  it('should render -05:00 in toIsoLocal when given a -300 minute offset (EST)', () => {
    assert.equal(toIsoLocal(date, -300), '2024-03-15T07:34:56.789-05:00')
  })

  it('should handle half-hour offsets in toIsoLocal (IST +330)', () => {
    assert.equal(toIsoLocal(date, 330), '2024-03-15T18:04:56.789+05:30')
  })
})

describe('formatRelative', () => {
  const now = new Date('2024-03-15T12:00:00Z')

  it('should report "just now" for sub-second differences', () => {
    assert.equal(formatRelative(new Date(now.getTime() + 500), now), 'just now')
  })

  it('should report past times with "ago"', () => {
    assert.equal(formatRelative(new Date(now.getTime() - 5000), now), '5 seconds ago')
    assert.equal(formatRelative(new Date(now.getTime() - 60 * 1000), now), '1 minute ago')
    assert.equal(formatRelative(new Date(now.getTime() - 60 * 60 * 1000), now), '1 hour ago')
    assert.equal(formatRelative(new Date(now.getTime() - 24 * 60 * 60 * 1000), now), '1 day ago')
  })

  it('should report future times with "in"', () => {
    assert.equal(formatRelative(new Date(now.getTime() + 5 * 1000), now), 'in 5 seconds')
    assert.equal(formatRelative(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), now), 'in 2 days')
  })

  it('should use month and year units for larger gaps', () => {
    assert.match(formatRelative(new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000), now), /month/)
    assert.match(formatRelative(new Date(now.getTime() - 800 * 24 * 60 * 60 * 1000), now), /year/)
  })
})

describe('interpretAsEpoch', () => {
  const opts = { minYear: 1990, maxYear: 2100 }

  it('should return a seconds candidate for a 10-digit number in range', () => {
    const r = interpretAsEpoch('1700000000', opts)
    assert.equal(r.length, 1)
    assert.equal(r[0].format, 'seconds')
    assert.equal(r[0].date.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('should return a millis candidate for a 13-digit number in range', () => {
    const r = interpretAsEpoch('1700000000000', opts)
    assert.equal(r.length, 1)
    assert.equal(r[0].format, 'millis')
  })

  it('should return a micros candidate for a 16-digit number in range', () => {
    const r = interpretAsEpoch('1700000000000000', opts)
    assert.equal(r.length, 1)
    assert.equal(r[0].format, 'micros')
  })

  it('should reject numbers outside the configured year range', () => {
    // 100 (a 3-digit) → not matched length; pass 10-digit but very small to put before 1990
    assert.deepEqual(interpretAsEpoch('0100000000', opts), []) // year ~1973, outside 1990–2100
    assert.deepEqual(interpretAsEpoch('9999999999', opts), []) // year ~2286, outside
  })

  it('should return an empty array for non-digit input', () => {
    assert.deepEqual(interpretAsEpoch('abc', opts), [])
    assert.deepEqual(interpretAsEpoch('123abc', opts), [])
  })

  it('should return an empty array for lengths other than 10/13/16', () => {
    assert.deepEqual(interpretAsEpoch('12345', opts), [])
    assert.deepEqual(interpretAsEpoch('123456789012', opts), [])
  })
})
