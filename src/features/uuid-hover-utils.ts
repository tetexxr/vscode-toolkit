/**
 * Pure decoding logic for the UUID / ULID hover.
 * No VS Code dependency — testable standalone.
 */

/** Matches a full UUID (any version) for word-range detection. */
export const UUID_WORD_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/

/** Matches a 26-char Crockford-Base32 ULID for word-range detection. */
export const ULID_WORD_RE = /[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}/

export interface IdInfo {
  /** Display label, e.g. "UUID v7" or "ULID". */
  label: string
  /** Short trait description, e.g. "time-ordered" or "random". */
  trait: string
  /** Embedded creation time, when the format carries one. */
  timestampMs?: number
}

const STRICT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{12}$/

/** Milliseconds between the Gregorian epoch (1582-10-15) and the Unix epoch. */
const GREGORIAN_TO_UNIX_MS = 12219292800000n

const UUID_TRAITS: Record<number, string> = {
  1: 'time-based (Gregorian clock + node)',
  2: 'DCE security',
  3: 'name-based (MD5)',
  4: 'random',
  5: 'name-based (SHA-1)',
  6: 'time-ordered (reordered Gregorian clock)',
  7: 'time-ordered (Unix epoch)',
  8: 'custom / vendor-specific'
}

export function analyzeUuid(text: string): IdInfo | null {
  const lower = text.toLowerCase()
  const match = STRICT_UUID_RE.exec(lower)
  if (!match) {
    return null
  }
  if (lower === '00000000-0000-0000-0000-000000000000') {
    return { label: 'UUID', trait: 'nil UUID (all zeros)' }
  }

  const version = parseInt(match[1], 16)
  const variantNibble = parseInt(match[2], 16)
  // RFC 9562 variant is 10xx — variant nibble 8, 9, a, or b. Anything else
  // is a legacy/non-RFC layout where the version nibble has no meaning.
  if (variantNibble < 8 || variantNibble > 0xb) {
    return { label: 'UUID', trait: 'non-RFC variant (version bits not meaningful)' }
  }

  const trait = UUID_TRAITS[version]
  if (!trait) {
    return { label: 'UUID', trait: `unknown version (${version})` }
  }

  const info: IdInfo = { label: `UUID v${version}`, trait }
  const hex = lower.replace(/-/g, '')

  if (version === 7) {
    // First 48 bits: Unix epoch in milliseconds.
    info.timestampMs = parseInt(hex.slice(0, 12), 16)
  } else if (version === 1 || version === 6) {
    // 60-bit count of 100ns intervals since 1582-10-15.
    // v1 layout: time_low(32) - time_mid(16) - [ver]time_hi(12)
    // v6 layout: time_high(32) - time_mid(16) - [ver]time_low(12) — already ordered.
    const ticksHex =
      version === 1 ? hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8) : hex.slice(0, 8) + hex.slice(8, 12) + hex.slice(13, 16)
    const ticks = BigInt('0x' + ticksHex)
    info.timestampMs = Number(ticks / 10000n - GREGORIAN_TO_UNIX_MS)
  }

  return info
}

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Plausibility window for ULID timestamps. A random 26-char Base32-looking
 * identifier decodes to *some* number; only dates in a sane range are
 * worth showing as a ULID.
 */
const ULID_MIN_MS = Date.UTC(2010, 0, 1)
const ULID_MAX_MS = Date.UTC(2120, 11, 31)

export function analyzeUlid(text: string): IdInfo | null {
  if (text.length !== 26) {
    return null
  }
  const upper = text.toUpperCase()
  let value = 0
  for (const ch of upper.slice(0, 10)) {
    const index = CROCKFORD_ALPHABET.indexOf(ch)
    if (index < 0) {
      return null
    }
    value = value * 32 + index
  }
  for (const ch of upper.slice(10)) {
    if (CROCKFORD_ALPHABET.indexOf(ch) < 0) {
      return null
    }
  }
  if (value < ULID_MIN_MS || value > ULID_MAX_MS) {
    return null
  }
  return { label: 'ULID', trait: 'time-ordered (Crockford Base32)', timestampMs: value }
}
