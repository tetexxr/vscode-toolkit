/**
 * Pure logic for the Number Base converter — parsing integer literals in any
 * base and formatting them into the others. Uses BigInt throughout so 64-bit
 * values keep full precision. vscode-free for mocha.
 */

export type Base = 'dec' | 'hex' | 'bin' | 'oct'

export interface ParsedNumber {
  value: bigint
  /** Base the literal was written in. */
  base: Base
  /** True when the literal carried an explicit 0x / 0b / 0o prefix. */
  prefixed: boolean
}

/** Regex matching a single number literal (with optional base prefix). */
export const NUMBER_TOKEN = /0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+/

/** Parses a number literal in dec / 0x / 0b / 0o form. Returns null if invalid. */
export function parseNumber(token: string): ParsedNumber | null {
  const text = token.trim()
  try {
    if (/^0[xX][0-9a-fA-F]+$/.test(text)) {
      return { value: BigInt(text), base: 'hex', prefixed: true }
    }
    if (/^0[bB][01]+$/.test(text)) {
      return { value: BigInt(text), base: 'bin', prefixed: true }
    }
    if (/^0[oO][0-7]+$/.test(text)) {
      return { value: BigInt(text), base: 'oct', prefixed: true }
    }
    if (/^\d+$/.test(text)) {
      return { value: BigInt(text), base: 'dec', prefixed: false }
    }
  } catch {
    return null
  }
  return null
}

/** Formats a value into the given base, with the conventional prefix for non-decimal. */
export function formatBase(value: bigint, base: Base): string {
  switch (base) {
    case 'hex':
      return `0x${value.toString(16)}`
    case 'bin':
      return `0b${value.toString(2)}`
    case 'oct':
      return `0o${value.toString(8)}`
    default:
      return value.toString(10)
  }
}

/**
 * Whether a literal is worth showing a hover for. Prefixed literals (0x/0b/0o)
 * always qualify; bare decimals only when they have at least `minDecimalDigits`
 * digits, so the hover doesn't fire on every `0`, `1`, or loop index.
 */
export function isHoverWorthy(parsed: ParsedNumber, minDecimalDigits: number): boolean {
  if (parsed.prefixed) {
    return true
  }
  return parsed.value.toString(10).length >= minDecimalDigits
}

/** Groups a binary string into nibbles for readability, e.g. 1010 1100. */
export function groupBinary(binary: string): string {
  const padded = binary.padStart(Math.ceil(binary.length / 4) * 4, '0')
  return padded.replace(/(.{4})(?=.)/g, '$1 ')
}
