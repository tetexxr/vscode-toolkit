import type * as vscode from 'vscode'

/**
 * Drops edits whose range overlaps an earlier one (after sorting by start).
 * VS Code rejects an entire `editor.edit` containing overlapping ranges, so
 * two cursors resolving to the same word/string would silently apply nothing.
 * Identical ranges collapse to one; merely adjacent ranges are kept.
 */
export function dropOverlappingEdits<T extends { range: vscode.Range }>(edits: T[]): T[] {
  const sorted = [...edits].sort((a, b) => a.range.start.compareTo(b.range.start))
  const out: T[] = []
  for (const edit of sorted) {
    const last = out[out.length - 1]
    if (last && edit.range.start.isBefore(last.range.end)) {
      continue
    }
    out.push(edit)
  }
  return out
}
