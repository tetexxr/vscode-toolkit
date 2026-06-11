import { strict as assert } from 'assert'
import { analyzeUlid, analyzeUuid, ULID_WORD_RE, UUID_WORD_RE } from '../../src/features/uuid-hover-utils'

describe('analyzeUuid', () => {
  it('should decode the embedded Unix timestamp of a UUID v7', () => {
    // First 48 bits: 0x01893f81a3a8 = 1688987607976 ms (verified independently)
    const info = analyzeUuid('01893f81-a3a8-7000-b2bb-7a76e84d0a5d')
    assert.equal(info!.label, 'UUID v7')
    assert.equal(new Date(info!.timestampMs!).toISOString(), '2023-07-10T11:13:27.976Z')
  })

  it('should identify a UUID v4 as random without timestamp', () => {
    const info = analyzeUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    assert.equal(info!.label, 'UUID v4')
    assert.equal(info!.trait, 'random')
    assert.equal(info!.timestampMs, undefined)
  })

  it('should decode the Gregorian timestamp of a UUID v1', () => {
    // Classic example UUID: 1998-02-04T22:13:53.151Z
    const info = analyzeUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    assert.equal(info!.label, 'UUID v1')
    assert.equal(new Date(info!.timestampMs!).toISOString().slice(0, 10), '1998-02-04')
  })

  it('should be case-insensitive', () => {
    const info = analyzeUuid('01893F81-A3A8-7000-B2BB-7A76E84D0A5D')
    assert.equal(info!.label, 'UUID v7')
  })

  it('should identify the nil UUID', () => {
    const info = analyzeUuid('00000000-0000-0000-0000-000000000000')
    assert.match(info!.trait, /nil/)
  })

  it('should report non-RFC variants without trusting the version nibble', () => {
    // Variant nibble 0xC (110x) — Microsoft legacy layout.
    const info = analyzeUuid('f47ac10b-58cc-4372-c567-0e02b2c3d479')
    assert.equal(info!.label, 'UUID')
    assert.match(info!.trait, /non-RFC/)
  })

  it('should return null for non-UUID strings', () => {
    assert.equal(analyzeUuid('not-a-uuid'), null)
    assert.equal(analyzeUuid('f47ac10b58cc4372a5670e02b2c3d479'), null)
  })
})

describe('analyzeUlid', () => {
  it('should decode the embedded timestamp of a ULID', () => {
    // 01ARZ3NDEK = 1469922850259 ms (verified independently)
    const info = analyzeUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')
    assert.equal(info!.label, 'ULID')
    assert.equal(new Date(info!.timestampMs!).toISOString(), '2016-07-30T23:54:10.259Z')
  })

  it('should be case-insensitive', () => {
    const info = analyzeUlid('01arz3ndektsv4rrffq69g5fav')
    assert.equal(new Date(info!.timestampMs!).toISOString(), '2016-07-30T23:54:10.259Z')
  })

  it('should reject strings with invalid Crockford characters', () => {
    assert.equal(analyzeUlid('01ARZ3NDEKTSV4RRFFQ69G5FAI'), null) // I is excluded
    assert.equal(analyzeUlid('01ARZ3NDEKTSV4RRFFQ69G5FAL'), null) // L is excluded
  })

  it('should reject wrong lengths', () => {
    assert.equal(analyzeUlid('01ARZ3NDEK'), null)
    assert.equal(analyzeUlid('01ARZ3NDEKTSV4RRFFQ69G5FAVX'), null)
  })

  it('should reject identifiers whose timestamp is not plausible', () => {
    // Decodes far in the past (epoch ~0) — likely a random Base32 string, not a ULID.
    assert.equal(analyzeUlid('00000000001SV4RRFFQ69G5FAV'), null)
    // Maximum 48-bit value — year ~10889.
    assert.equal(analyzeUlid('7ZZZZZZZZZZSV4RRFFQ69G5FAV'), null)
  })
})

describe('word-range regexes', () => {
  it('should match a UUID inside a log line', () => {
    const match = UUID_WORD_RE.exec('user id 01893f81-a3a8-7000-b2bb-7a76e84d0a5d created')
    assert.equal(match![0], '01893f81-a3a8-7000-b2bb-7a76e84d0a5d')
  })

  it('should match a ULID inside a log line', () => {
    const match = ULID_WORD_RE.exec('order 01ARZ3NDEKTSV4RRFFQ69G5FAV shipped')
    assert.equal(match![0], '01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })
})
