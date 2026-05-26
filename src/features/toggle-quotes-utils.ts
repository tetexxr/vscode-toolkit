export type QuoteChar = "'" | '"' | '`'

export const QUOTE_CHARS: readonly QuoteChar[] = ["'", '"', '`']

export interface StringRange {
  start: number
  end: number
  quote: QuoteChar
}

export class TemplateInterpolationError extends Error {
  constructor() {
    super('Cannot convert template literal: it contains an interpolation expression (${...}).')
    this.name = 'TemplateInterpolationError'
  }
}

/**
 * Finds the string literal in `line` whose quotes enclose the position `col`.
 * Returns null if `col` is not inside a recognized string.
 *
 * Recognizes single-quoted ('), double-quoted (") and backtick (`) strings.
 * Skips escaped quote characters (preceded by an odd number of backslashes).
 * Unterminated strings are ignored.
 */
export function findStringAt(line: string, col: number): StringRange | null {
  for (const range of findAllStrings(line)) {
    if (col >= range.start && col <= range.end) {
      return range
    }
  }
  return null
}

export function findAllStrings(line: string): StringRange[] {
  const ranges: StringRange[] = []
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (c === "'" || c === '"' || c === '`') {
      const start = i
      const quote: QuoteChar = c
      let j = i + 1
      let closed = false
      while (j < line.length) {
        if (line[j] === '\\') {
          j += 2
          continue
        }
        if (line[j] === quote) {
          ranges.push({ start, end: j, quote })
          closed = true
          j++
          break
        }
        j++
      }
      i = closed ? j : line.length
    } else {
      i++
    }
  }
  return ranges
}

/**
 * Returns the next quote in the global cycle ' → " → ` → '.
 */
export function nextQuote(current: QuoteChar): QuoteChar {
  const idx = QUOTE_CHARS.indexOf(current)
  return QUOTE_CHARS[(idx + 1) % QUOTE_CHARS.length]
}

/**
 * Returns the next quote in `allowed` after `current`, or null if cycling is not possible.
 * - null when `allowed` has fewer than 2 quotes.
 * - null when `current` is not in `allowed` (i.e. would be no-op or unsafe to "cycle").
 */
export function getNextAllowedQuote(current: QuoteChar, allowed: readonly QuoteChar[]): QuoteChar | null {
  if (allowed.length < 2) {
    return null
  }
  const idx = allowed.indexOf(current)
  if (idx < 0) {
    return null
  }
  return allowed[(idx + 1) % allowed.length]
}

/**
 * Returns the list of `allowed` filtered + validated to known quote chars,
 * preserving order. Duplicates are removed.
 */
export function normalizeAllowedQuotes(allowed: readonly string[] | undefined): QuoteChar[] {
  if (!allowed) {
    return []
  }
  const out: QuoteChar[] = []
  for (const c of allowed) {
    if ((c === "'" || c === '"' || c === '`') && !out.includes(c)) {
      out.push(c)
    }
  }
  return out
}

/**
 * Re-escapes string content when changing quote type:
 *  - unescapes occurrences of the `from` quote
 *  - escapes occurrences of the `to` quote
 *  - escapes `${` when converting TO backtick (would otherwise become an interpolation)
 *  - throws if converting FROM backtick AND content has an unescaped `${`
 *  - preserves all other escape sequences as-is
 */
export function convertQuote(content: string, from: QuoteChar, to: QuoteChar): string {
  if (from === to) {
    return content
  }
  if (from === '`' && to !== '`' && hasUnescapedInterpolation(content)) {
    throw new TemplateInterpolationError()
  }

  let out = ''
  let i = 0
  while (i < content.length) {
    const c = content[i]
    if (c === '\\' && i + 1 < content.length) {
      const next = content[i + 1]
      // Unescape the previous delimiter (no longer the delimiter).
      if (next === from) {
        out += from
        i += 2
        continue
      }
      // Leaving backtick: \${ is no longer needed as an escape.
      if (from === '`' && next === '$' && i + 2 < content.length && content[i + 2] === '{') {
        out += '${'
        i += 3
        continue
      }
      out += '\\' + next
      i += 2
      continue
    }
    if (c === to) {
      out += '\\' + to
      i++
      continue
    }
    // Entering backtick: escape ${ so it doesn't become an interpolation.
    if (to === '`' && c === '$' && i + 1 < content.length && content[i + 1] === '{') {
      out += '\\${'
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Returns true if `content` contains an unescaped `${`, i.e. a template literal
 * interpolation expression.
 */
export function hasUnescapedInterpolation(content: string): boolean {
  let i = 0
  while (i < content.length) {
    if (content[i] === '\\' && i + 1 < content.length) {
      i += 2
      continue
    }
    if (content[i] === '$' && i + 1 < content.length && content[i + 1] === '{') {
      return true
    }
    i++
  }
  return false
}
