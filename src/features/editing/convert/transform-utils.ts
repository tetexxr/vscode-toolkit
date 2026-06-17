import { createHash } from 'node:crypto'

export class TransformError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransformError'
  }
}

/* -------------------------------------------------------------------------- */
/*  Base64                                                                    */
/* -------------------------------------------------------------------------- */

export function base64Encode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64')
}

export function base64Decode(input: string): string {
  const cleaned = input.trim()
  if (!isValidBase64(cleaned)) {
    throw new TransformError('Input is not valid Base64.')
  }
  return Buffer.from(cleaned, 'base64').toString('utf8')
}

export function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function base64UrlDecode(input: string): string {
  const normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  if (!isValidBase64(padded)) {
    throw new TransformError('Input is not valid URL-safe Base64.')
  }
  return Buffer.from(padded, 'base64').toString('utf8')
}

function isValidBase64(value: string): boolean {
  if (value.length === 0) {
    return true
  }
  if (value.length % 4 !== 0) {
    return false
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

/* -------------------------------------------------------------------------- */
/*  URL                                                                       */
/* -------------------------------------------------------------------------- */

export function urlEncode(input: string): string {
  return encodeURIComponent(input)
}

export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch (error) {
    throw new TransformError(
      `Input contains an invalid percent-encoded sequence: ${(error as Error).message}`
    )
  }
}

/* -------------------------------------------------------------------------- */
/*  HTML entities                                                             */
/* -------------------------------------------------------------------------- */

const HTML_ENCODE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function htmlEncode(input: string): string {
  return input.replace(/[&<>"']/g, ch => HTML_ENCODE_MAP[ch])
}

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢'
}

export function htmlDecode(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    // fromCodePoint throws RangeError beyond 0x10FFFF — keep invalid refs as-is.
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.substring(2), 16)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.substring(1), 10)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    const replacement = HTML_NAMED_ENTITIES[body]
    return replacement !== undefined ? replacement : match
  })
}

/* -------------------------------------------------------------------------- */
/*  Hex                                                                       */
/* -------------------------------------------------------------------------- */

export function hexEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('hex')
}

export function hexDecode(input: string): string {
  const cleaned = input.trim().replace(/\s+/g, '')
  if (cleaned.length === 0) {
    return ''
  }
  if (cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new TransformError('Input is not a valid hex string.')
  }
  return Buffer.from(cleaned, 'hex').toString('utf8')
}

/* -------------------------------------------------------------------------- */
/*  Hashes                                                                    */
/* -------------------------------------------------------------------------- */

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512'

export function hash(input: string, algorithm: HashAlgorithm): string {
  return createHash(algorithm).update(input, 'utf8').digest('hex')
}

/* -------------------------------------------------------------------------- */
/*  JWT                                                                       */
/* -------------------------------------------------------------------------- */

export interface DecodedJwt {
  header: unknown
  payload: unknown
  signature: string
}

export function decodeJwt(token: string): DecodedJwt {
  const trimmed = token.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 3) {
    throw new TransformError(`Expected 3 dot-separated segments, got ${parts.length}.`)
  }
  const [rawHeader, rawPayload, rawSignature] = parts
  let header: unknown
  let payload: unknown
  try {
    header = JSON.parse(base64UrlDecode(rawHeader))
  } catch (error) {
    throw new TransformError(`Could not parse JWT header: ${(error as Error).message}`)
  }
  try {
    payload = JSON.parse(base64UrlDecode(rawPayload))
  } catch (error) {
    throw new TransformError(`Could not parse JWT payload: ${(error as Error).message}`)
  }
  return { header, payload, signature: rawSignature }
}

export function formatDecodedJwt(decoded: DecodedJwt): string {
  return [
    '// Header',
    JSON.stringify(decoded.header, null, 2),
    '',
    '// Payload',
    JSON.stringify(decoded.payload, null, 2),
    '',
    '// Signature (not verified)',
    JSON.stringify(decoded.signature)
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/*  JSON utilities                                                            */
/* -------------------------------------------------------------------------- */

function parseJsonStrict(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch (error) {
    throw new TransformError(`Invalid JSON: ${(error as Error).message}`)
  }
}

export function jsonPrettify(input: string): string {
  return JSON.stringify(parseJsonStrict(input), null, 2)
}

export function jsonMinify(input: string): string {
  return JSON.stringify(parseJsonStrict(input))
}

export function jsonSortKeys(input: string): string {
  return JSON.stringify(sortKeysDeep(parseJsonStrict(input)), null, 2)
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}
