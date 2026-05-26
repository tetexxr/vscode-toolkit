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
  it('detects 10-digit numbers as seconds', () => {
    assert.equal(detectInputFormat('1700000000'), 'seconds')
  })

  it('detects 13-digit numbers as milliseconds', () => {
    assert.equal(detectInputFormat('1700000000000'), 'millis')
  })

  it('detects 16-digit numbers as microseconds', () => {
    assert.equal(detectInputFormat('1700000000000000'), 'micros')
  })

  it('falls back to milliseconds for other digit lengths', () => {
    assert.equal(detectInputFormat('12345'), 'millis')
    assert.equal(detectInputFormat('12345678901234'), 'millis')
  })

  it('detects ISO 8601 strings', () => {
    assert.equal(detectInputFormat('2024-03-15T12:34:56Z'), 'iso')
    assert.equal(detectInputFormat('2024-03-15T12:34:56.789Z'), 'iso')
    assert.equal(detectInputFormat('2024-03-15T12:34:56+02:00'), 'iso')
    assert.equal(detectInputFormat('2024-03-15'), 'iso')
  })

  it('returns null for unrecognized input', () => {
    assert.equal(detectInputFormat(''), null)
    assert.equal(detectInputFormat('hello world'), null)
    assert.equal(detectInputFormat('not a date'), null)
  })

  it('handles negative integers (pre-1970 epochs)', () => {
    // 10 digits after the sign → seconds
    assert.equal(detectInputFormat('-1000000000'), 'seconds')
    // Other digit lengths fall back to millis
    assert.equal(detectInputFormat('-12345'), 'millis')
  })

  it('trims whitespace', () => {
    assert.equal(detectInputFormat('  1700000000  '), 'seconds')
  })
})

describe('parseTimestamp', () => {
  it('parses Unix seconds correctly', () => {
    const date = parseTimestamp('1700000000')
    assert.equal(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('parses Unix milliseconds correctly', () => {
    const date = parseTimestamp('1700000000000')
    assert.equal(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('parses Unix microseconds correctly', () => {
    const date = parseTimestamp('1700000000000000')
    assert.equal(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('parses ISO 8601 strings', () => {
    const date = parseTimestamp('2024-03-15T12:34:56.789Z')
    assert.equal(date!.getTime(), Date.UTC(2024, 2, 15, 12, 34, 56, 789))
  })

  it('returns null for invalid input', () => {
    assert.equal(parseTimestamp('not a date'), null)
    assert.equal(parseTimestamp(''), null)
  })

  it('respects an explicit format hint', () => {
    // 13-digit value, but force interpretation as seconds (overflow far into future).
    const date = parseTimestamp('1700000000000', 'seconds')
    assert.ok(date instanceof Date)
    assert.notEqual(date!.toISOString(), '2023-11-14T22:13:20.000Z')
  })
})

describe('toIsoUtc / toIsoLocal / toUnixSeconds / toUnixMillis', () => {
  const date = new Date(Date.UTC(2024, 2, 15, 12, 34, 56, 789))

  it('toIsoUtc emits standard ISO 8601 Z form', () => {
    assert.equal(toIsoUtc(date), '2024-03-15T12:34:56.789Z')
  })

  it('toUnixSeconds rounds down to seconds', () => {
    assert.equal(toUnixSeconds(date), String(Math.floor(date.getTime() / 1000)))
  })

  it('toUnixMillis returns full ms', () => {
    assert.equal(toUnixMillis(date), String(date.getTime()))
  })

  it('toIsoLocal with +00:00 offset matches UTC representation', () => {
    assert.equal(toIsoLocal(date, 0), '2024-03-15T12:34:56.789+00:00')
  })

  it('toIsoLocal with +120 offset (CEST) produces +02:00', () => {
    assert.equal(toIsoLocal(date, 120), '2024-03-15T14:34:56.789+02:00')
  })

  it('toIsoLocal with -300 offset (EST) produces -05:00', () => {
    assert.equal(toIsoLocal(date, -300), '2024-03-15T07:34:56.789-05:00')
  })

  it('toIsoLocal handles half-hour offsets (IST +330)', () => {
    assert.equal(toIsoLocal(date, 330), '2024-03-15T18:04:56.789+05:30')
  })
})

describe('formatRelative', () => {
  const now = new Date('2024-03-15T12:00:00Z')

  it('reports "just now" for sub-second differences', () => {
    assert.equal(formatRelative(new Date(now.getTime() + 500), now), 'just now')
  })

  it('reports past times with "ago"', () => {
    assert.equal(formatRelative(new Date(now.getTime() - 5000), now), '5 seconds ago')
    assert.equal(formatRelative(new Date(now.getTime() - 60 * 1000), now), '1 minute ago')
    assert.equal(formatRelative(new Date(now.getTime() - 60 * 60 * 1000), now), '1 hour ago')
    assert.equal(formatRelative(new Date(now.getTime() - 24 * 60 * 60 * 1000), now), '1 day ago')
  })

  it('reports future times with "in"', () => {
    assert.equal(formatRelative(new Date(now.getTime() + 5 * 1000), now), 'in 5 seconds')
    assert.equal(formatRelative(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), now), 'in 2 days')
  })

  it('uses month and year units for larger gaps', () => {
    assert.match(formatRelative(new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000), now), /month/)
    assert.match(formatRelative(new Date(now.getTime() - 800 * 24 * 60 * 60 * 1000), now), /year/)
  })
})

describe('interpretAsEpoch', () => {
  const opts = { minYear: 1990, maxYear: 2100 }

  it('returns a seconds candidate for a 10-digit number in range', () => {
    const r = interpretAsEpoch('1700000000', opts)
    assert.equal(r.length, 1)
    assert.equal(r[0].format, 'seconds')
    assert.equal(r[0].date.toISOString(), '2023-11-14T22:13:20.000Z')
  })

  it('returns a millis candidate for a 13-digit number in range', () => {
    const r = interpretAsEpoch('1700000000000', opts)
    assert.equal(r.length, 1)
    assert.equal(r[0].format, 'millis')
  })

  it('returns a micros candidate for a 16-digit number in range', () => {
    const r = interpretAsEpoch('1700000000000000', opts)
    assert.equal(r.length, 1)
    assert.equal(r[0].format, 'micros')
  })

  it('rejects numbers outside the configured year range', () => {
    // 100 (a 3-digit) → not matched length; pass 10-digit but very small to put before 1990
    assert.deepEqual(interpretAsEpoch('0100000000', opts), []) // year ~1973, outside 1990–2100
    assert.deepEqual(interpretAsEpoch('9999999999', opts), []) // year ~2286, outside
  })

  it('returns empty for non-digit input', () => {
    assert.deepEqual(interpretAsEpoch('abc', opts), [])
    assert.deepEqual(interpretAsEpoch('123abc', opts), [])
  })

  it('returns empty for lengths other than 10/13/16', () => {
    assert.deepEqual(interpretAsEpoch('12345', opts), [])
    assert.deepEqual(interpretAsEpoch('123456789012', opts), [])
  })
})
