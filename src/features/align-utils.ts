export interface AlignOptions {
  /** Spaces between the (trimmed) prefix of the longest line and the delimiter. */
  spacesBefore: number
  /** Spaces between the delimiter and the (trimmed) suffix. Ignored on lines where the suffix is empty. */
  spacesAfter: number
}

const DEFAULT_OPTIONS: AlignOptions = {
  spacesBefore: 1,
  spacesAfter: 1
}

/**
 * Aligns lines vertically by the first occurrence of `delimiter`.
 * Lines that don't contain the delimiter are returned untouched.
 * Indentation (leading whitespace) is preserved.
 */
export function alignLines(lines: string[], delimiter: string, options: Partial<AlignOptions> = {}): string[] {
  if (!delimiter) {
    return lines
  }

  const { spacesBefore, spacesAfter } = { ...DEFAULT_OPTIONS, ...options }

  const positions = lines.map(line => line.indexOf(delimiter))
  const linesWithDelimiter = positions.filter(p => p >= 0).length
  if (linesWithDelimiter < 2) {
    return lines
  }

  const trimmedPrefixes = lines.map((line, i) => {
    const idx = positions[i]
    if (idx < 0) {
      return null
    }
    return line.substring(0, idx).replace(/[ \t]+$/, '')
  })

  let maxLen = 0
  for (const p of trimmedPrefixes) {
    if (p !== null && p.length > maxLen) {
      maxLen = p.length
    }
  }

  return lines.map((line, i) => {
    const idx = positions[i]
    if (idx < 0) {
      return line
    }
    const trimmed = trimmedPrefixes[i]!
    const padding = maxLen - trimmed.length + spacesBefore
    const rawSuffix = line.substring(idx + delimiter.length)
    const trimmedSuffix = rawSuffix.replace(/^[ \t]+/, '')
    if (trimmedSuffix.length === 0) {
      return trimmed + ' '.repeat(padding) + delimiter
    }
    return trimmed + ' '.repeat(padding) + delimiter + ' '.repeat(spacesAfter) + trimmedSuffix
  })
}

/**
 * Resolves the effective spacing for a delimiter from a config record.
 * Falls back to `default` key, then to the hard-coded fallback.
 */
export function resolveSpacing(map: Record<string, number> | undefined, delimiter: string, fallback: number): number {
  if (!map) {
    return fallback
  }
  if (Object.prototype.hasOwnProperty.call(map, delimiter)) {
    const v = map[delimiter]
    if (typeof v === 'number' && v >= 0) {
      return v
    }
  }
  if (Object.prototype.hasOwnProperty.call(map, 'default')) {
    const v = map.default
    if (typeof v === 'number' && v >= 0) {
      return v
    }
  }
  return fallback
}
