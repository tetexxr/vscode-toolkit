import { randomBytes, randomUUID } from 'node:crypto'

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/* -------------------------------------------------------------------------- */
/*  UUID                                                                      */
/* -------------------------------------------------------------------------- */

export function uuidV4(): string {
  return randomUUID()
}

/**
 * UUID v7 (RFC 9562). Layout:
 *   bytes 0-5:  48-bit unix timestamp (ms), big-endian
 *   byte  6:    high nibble = version (7),  low nibble = top 4 bits of rand_a
 *   byte  7:    low 8 bits of rand_a
 *   byte  8:    top 2 bits = variant (10), bottom 6 bits = top 6 bits of rand_b
 *   bytes 9-15: remaining 56 bits of rand_b
 */
export function uuidV7(now: number = Date.now(), rand: Buffer = randomBytes(10)): string {
  if (rand.length < 10) {
    throw new Error('uuidV7 requires at least 10 random bytes')
  }
  const bytes = Buffer.alloc(16)
  bytes.writeUIntBE(now, 0, 6)
  bytes[6] = 0x70 | (rand[0] & 0x0f)
  bytes[7] = rand[1]
  bytes[8] = 0x80 | (rand[2] & 0x3f)
  for (let i = 0; i < 7; i++) {
    bytes[9 + i] = rand[3 + i]
  }
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/* -------------------------------------------------------------------------- */
/*  ULID                                                                      */
/* -------------------------------------------------------------------------- */

export function ulid(now: number = Date.now(), rand: Buffer = randomBytes(10)): string {
  if (rand.length < 10) {
    throw new Error('ulid requires at least 10 random bytes')
  }
  // 48-bit timestamp → 10 Crockford Base32 chars
  let timeChars = ''
  let t = BigInt(now)
  for (let i = 0; i < 10; i++) {
    timeChars = CROCKFORD_BASE32[Number(t & 31n)] + timeChars
    t >>= 5n
  }
  // 80-bit random → 16 Crockford Base32 chars
  let r = 0n
  for (let i = 0; i < 10; i++) {
    r = (r << 8n) | BigInt(rand[i])
  }
  let randChars = ''
  for (let i = 0; i < 16; i++) {
    randChars = CROCKFORD_BASE32[Number(r & 31n)] + randChars
    r >>= 5n
  }
  return timeChars + randChars
}

/* -------------------------------------------------------------------------- */
/*  Timestamps                                                                */
/* -------------------------------------------------------------------------- */

export function isoTimestamp(now: Date = new Date()): string {
  return now.toISOString()
}

export function unixSeconds(now: number = Date.now()): string {
  return String(Math.floor(now / 1000))
}

export function unixMillis(now: number = Date.now()): string {
  return String(now)
}

/* -------------------------------------------------------------------------- */
/*  Random                                                                    */
/* -------------------------------------------------------------------------- */

export function randomHex(byteLength: number, rand?: Buffer): string {
  if (!Number.isInteger(byteLength) || byteLength < 1) {
    throw new Error('byteLength must be a positive integer')
  }
  const bytes = rand ?? randomBytes(byteLength)
  return bytes.subarray(0, byteLength).toString('hex')
}

export function randomBase64(byteLength: number, rand?: Buffer): string {
  if (!Number.isInteger(byteLength) || byteLength < 1) {
    throw new Error('byteLength must be a positive integer')
  }
  const bytes = rand ?? randomBytes(byteLength)
  return bytes
    .subarray(0, byteLength)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
