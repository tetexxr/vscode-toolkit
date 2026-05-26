import { strict as assert } from 'assert'
import {
  uuidV4,
  uuidV7,
  ulid,
  isoTimestamp,
  unixSeconds,
  unixMillis,
  randomHex,
  randomBase64
} from '../../src/features/insert-utils'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('uuidV4', () => {
  it('produces a standard v4 UUID format', () => {
    const id = uuidV4()
    assert.match(id, UUID_REGEX)
    // Version nibble at position 14 is 4; variant nibble at 19 is 8/9/a/b.
    assert.equal(id[14], '4')
    assert.match(id[19], /[89ab]/)
  })

  it('produces a different value on every call', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      seen.add(uuidV4())
    }
    assert.equal(seen.size, 50)
  })
})

describe('uuidV7', () => {
  it('encodes the timestamp in the first 48 bits', () => {
    const now = 0x0123456789ab
    const rand = Buffer.alloc(10, 0)
    const id = uuidV7(now, rand)
    assert.equal(id.slice(0, 8), '01234567')
    assert.equal(id.slice(9, 13), '89ab')
  })

  it('sets the version nibble to 7', () => {
    const id = uuidV7(Date.now(), Buffer.alloc(10, 0))
    assert.equal(id[14], '7')
  })

  it('sets the variant nibble to 8/9/a/b', () => {
    const id = uuidV7(Date.now(), Buffer.alloc(10, 0xff))
    assert.match(id[19], /[89ab]/)
  })

  it('produces a standard UUID format', () => {
    assert.match(uuidV7(), UUID_REGEX)
  })

  it('is time-ordered when generated sequentially', () => {
    const earlier = uuidV7(1000, Buffer.alloc(10, 0))
    const later = uuidV7(2000, Buffer.alloc(10, 0))
    assert.ok(earlier < later, `expected ${earlier} < ${later}`)
  })

  it('throws if fewer than 10 random bytes are provided', () => {
    assert.throws(() => uuidV7(Date.now(), Buffer.alloc(9)))
  })
})

describe('ulid', () => {
  it('produces a 26-character Crockford Base32 string', () => {
    const id = ulid()
    assert.equal(id.length, 26)
    assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('encodes the timestamp in the first 10 characters', () => {
    // For timestamp 0, the first 10 chars are all '0'.
    const id = ulid(0, Buffer.alloc(10, 0))
    assert.equal(id.slice(0, 10), '0000000000')
  })

  it('encodes a known timestamp deterministically', () => {
    // 1469918176385 ms is the example timestamp from the ULID spec → '01ARYZ6S41'.
    const id = ulid(1469918176385, Buffer.alloc(10, 0))
    assert.equal(id.slice(0, 10), '01ARYZ6S41')
  })

  it('encodes all-ones random into all-Z trailing chars', () => {
    const id = ulid(0, Buffer.alloc(10, 0xff))
    assert.equal(id.slice(10), 'ZZZZZZZZZZZZZZZZ')
  })

  it('is time-ordered when generated sequentially', () => {
    const earlier = ulid(1000, Buffer.alloc(10, 0))
    const later = ulid(2000, Buffer.alloc(10, 0))
    assert.ok(earlier < later, `expected ${earlier} < ${later}`)
  })

  it('throws if fewer than 10 random bytes are provided', () => {
    assert.throws(() => ulid(Date.now(), Buffer.alloc(9)))
  })
})

describe('isoTimestamp', () => {
  it('formats a fixed date as ISO 8601 with milliseconds', () => {
    const d = new Date('2024-03-15T12:34:56.789Z')
    assert.equal(isoTimestamp(d), '2024-03-15T12:34:56.789Z')
  })

  it('returns the current time when no argument is provided', () => {
    const out = isoTimestamp()
    assert.match(out, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('unixSeconds / unixMillis', () => {
  it('formats unixSeconds as an integer second-precision string', () => {
    assert.equal(unixSeconds(1700000000123), '1700000000')
  })

  it('formats unixMillis as a millisecond-precision string', () => {
    assert.equal(unixMillis(1700000000123), '1700000000123')
  })

  it('uses Date.now() when no argument is provided', () => {
    const now = Date.now()
    const out = Number(unixMillis())
    assert.ok(Math.abs(out - now) < 1000, `expected ${out} near ${now}`)
  })
})

describe('randomHex', () => {
  it('emits 2 hex chars per byte', () => {
    const out = randomHex(8, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe]))
    assert.equal(out, 'deadbeefcafebabe')
  })

  it('produces 32 chars by default for 16 bytes', () => {
    assert.equal(randomHex(16).length, 32)
  })

  it('throws on non-positive byteLength', () => {
    assert.throws(() => randomHex(0))
    assert.throws(() => randomHex(-1))
  })
})

describe('randomBase64', () => {
  it('produces URL-safe Base64 without padding', () => {
    // 16 bytes → 22 base64 chars (no padding).
    const out = randomBase64(16, Buffer.alloc(16, 0xff))
    assert.equal(out.length, 22)
    assert.doesNotMatch(out, /[+/=]/)
  })

  it('encodes known bytes correctly', () => {
    const out = randomBase64(3, Buffer.from([0xff, 0xff, 0xff]))
    assert.equal(out, '____')
  })

  it('throws on non-positive byteLength', () => {
    assert.throws(() => randomBase64(0))
  })
})
