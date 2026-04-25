const LEADING_NUMBER_PATTERN = /^\s*(-?\d+(?:[.,]\d+)?)/

export function extractLeadingNumbers(text: string): number[] {
  const numbers: number[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(LEADING_NUMBER_PATTERN)
    if (!match) {
      continue
    }
    const value = parseFloat(match[1].replace(',', '.'))
    if (!isNaN(value)) {
      numbers.push(value)
    }
  }
  return numbers
}

export function sumNumbers(numbers: number[]): number {
  const total = numbers.reduce((acc, n) => acc + n, 0)
  return Math.round(total * 1e10) / 1e10
}

export function formatSum(value: number): string {
  return String(value).replace('.', ',')
}
