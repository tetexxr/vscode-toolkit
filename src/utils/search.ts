/**
 * Pure search utilities for the Find File or Folder feature.
 * No VS Code dependency.
 */

/** Score how well path segments match the search terms. Higher = better. */
export function scoreItem(segments: string[], terms: string[]): number {
  let score = 0
  for (const term of terms) {
    let best = 0
    for (const seg of segments) {
      if (seg.startsWith(term)) {
        // Exact prefix match on a segment — best case
        best = 2
        break
      } else if (seg.includes(term)) {
        // Substring match — ok
        best = Math.max(best, 1)
      }
    }
    score += best
  }
  return score
}

/** Check if an item's path matches all include terms and none of the exclude terms. */
export function matchesFilter(description: string, include: string[], exclude: string[]): boolean {
  const text = description.toLowerCase().split('/').join(' ')
  return include.every((t) => text.includes(t)) && !exclude.some((t) => text.includes(t))
}

/** Parse a search query into include and exclude terms. Terms prefixed with `-` are exclusions. */
export function parseTerms(value: string): { include: string[]; exclude: string[] } {
  const allTerms = value.trim().toLowerCase().split(/\s+/)
  const include = allTerms.filter((t) => !t.startsWith('-'))
  const exclude = allTerms
    .filter((t) => t.startsWith('-'))
    .map((t) => t.slice(1))
    .filter(Boolean)
  return { include, exclude }
}
