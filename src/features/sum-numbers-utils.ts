const NUMBER_PATTERN = /-?\d+(?:[.,]\d+)?/g

export function extractNumbers(text: string): number[] {
  const matches = text.match(NUMBER_PATTERN) ?? []
  const numbers: number[] = []
  for (const match of matches) {
    const normalized = match.replace(',', '.')
    const value = parseFloat(normalized)
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
