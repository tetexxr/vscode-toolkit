export type LineOperation = (lines: string[]) => string[]

export interface SortOptions {
  caseSensitive?: boolean
  natural?: boolean
  descending?: boolean
}

export function sortLines(lines: string[], options: SortOptions = {}): string[] {
  const { caseSensitive = true, natural = true, descending = false } = options
  const collator = new Intl.Collator(undefined, {
    sensitivity: caseSensitive ? 'variant' : 'base',
    numeric: natural
  })
  const sorted = [...lines].sort((a, b) => collator.compare(a, b))
  return descending ? sorted.reverse() : sorted
}

export function sortLinesByLength(lines: string[], descending = false): string[] {
  const sorted = [...lines].sort((a, b) => a.length - b.length)
  return descending ? sorted.reverse() : sorted
}

const FIRST_NUMBER_PATTERN = /-?\d+(?:[.,]\d+)?/

export function sortLinesNumerically(lines: string[], descending = false): string[] {
  const decorated = lines.map((line, index) => {
    const match = line.match(FIRST_NUMBER_PATTERN)
    const value = match ? parseFloat(match[0].replace(',', '.')) : NaN
    return { line, index, value }
  })

  decorated.sort((a, b) => {
    const aIsNaN = isNaN(a.value)
    const bIsNaN = isNaN(b.value)
    if (aIsNaN && bIsNaN) {
      return a.index - b.index
    }
    if (aIsNaN) {
      return 1
    }
    if (bIsNaN) {
      return -1
    }
    if (a.value === b.value) {
      return a.index - b.index
    }
    return a.value - b.value
  })

  const sorted = decorated.map(d => d.line)
  return descending ? sorted.reverse() : sorted
}

export function reverseLines(lines: string[]): string[] {
  return [...lines].reverse()
}

export type RandomFn = () => number

export function shuffleLines(lines: string[], random: RandomFn = Math.random): string[] {
  const out = [...lines]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface DedupeOptions {
  caseSensitive?: boolean
  keepLast?: boolean
  trim?: boolean
}

export function removeDuplicateLines(lines: string[], options: DedupeOptions = {}): string[] {
  const { caseSensitive = true, keepLast = false, trim = false } = options
  const keyFor = (line: string): string => {
    let key = line
    if (trim) {
      key = key.trim()
    }
    if (!caseSensitive) {
      key = key.toLowerCase()
    }
    return key
  }

  if (keepLast) {
    const seen = new Set<string>()
    const out: string[] = []
    for (let i = lines.length - 1; i >= 0; i--) {
      const key = keyFor(lines[i])
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      out.push(lines[i])
    }
    return out.reverse()
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const key = keyFor(line)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(line)
  }
  return out
}

export function removeEmptyLines(lines: string[]): string[] {
  return lines.filter(line => line.trim().length > 0)
}

export function trimTrailingWhitespace(lines: string[]): string[] {
  return lines.map(line => line.replace(/[ \t]+$/, ''))
}

/**
 * Creates a deterministic PRNG (mulberry32) for testing shuffle.
 */
export function seededRandom(seed: number): RandomFn {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
