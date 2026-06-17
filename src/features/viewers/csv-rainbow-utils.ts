export interface CsvField {
  index: number
  start: number
  end: number
}

export const DEFAULT_DELIMITERS = [',', ';', '\t', '|']

export function parseCsvLine(line: string, delimiter: string): CsvField[] {
  const fields: CsvField[] = []
  let i = 0
  let fieldStart = 0
  let inQuotes = false
  let atFieldStart = true

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      i++
      continue
    }

    if (atFieldStart && ch === '"') {
      inQuotes = true
      atFieldStart = false
      i++
      continue
    }

    if (ch === delimiter) {
      fields.push({ index: fields.length, start: fieldStart, end: i })
      i++
      fieldStart = i
      atFieldStart = true
      continue
    }

    atFieldStart = false
    i++
  }

  fields.push({ index: fields.length, start: fieldStart, end: line.length })
  return fields
}

export function detectDelimiter(text: string, candidates: string[] = DEFAULT_DELIMITERS): string {
  const lines = text
    .split(/\r?\n/)
    .filter(l => l.length > 0)
    .slice(0, 10)
  if (lines.length === 0) {
    return candidates[0] ?? ','
  }

  let best = candidates[0] ?? ','
  let bestScore = -1

  for (const cand of candidates) {
    const counts = lines.map(l => countOutsideQuotes(l, cand))
    const min = Math.min(...counts)
    if (min === 0) {
      continue
    }
    const max = Math.max(...counts)
    const consistency = min === max ? 1 : 0.5
    const score = min * consistency * 1000 + max
    if (score > bestScore) {
      bestScore = score
      best = cand
    }
  }

  return best
}

function countOutsideQuotes(line: string, ch: string): number {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ch) {
      count++
    }
  }
  return count
}
