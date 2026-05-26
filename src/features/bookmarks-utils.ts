export interface Bookmark {
  /** 0-based line number. */
  line: number
  label?: string
}

export interface BookmarkData {
  [uri: string]: Bookmark[]
}

export interface DocumentChange {
  range: { start: { line: number }; end: { line: number } }
  text: string
}

export class BookmarkStore {
  private data: BookmarkData = {}

  load(data: BookmarkData): void {
    this.data = {}
    for (const [uri, list] of Object.entries(data ?? {})) {
      if (Array.isArray(list)) {
        const cleaned: Bookmark[] = []
        for (const b of list) {
          if (b && typeof b.line === 'number' && b.line >= 0) {
            const out: Bookmark = { line: b.line }
            if (b.label) {
              out.label = String(b.label)
            }
            cleaned.push(out)
          }
        }
        cleaned.sort((a, b) => a.line - b.line)
        if (cleaned.length > 0) {
          this.data[uri] = cleaned
        }
      }
    }
  }

  serialize(): BookmarkData {
    return JSON.parse(JSON.stringify(this.data)) as BookmarkData
  }

  getAll(): Array<{ uri: string; bookmark: Bookmark }> {
    const out: Array<{ uri: string; bookmark: Bookmark }> = []
    for (const [uri, list] of Object.entries(this.data)) {
      for (const b of list) {
        out.push({ uri, bookmark: b })
      }
    }
    return out
  }

  getForUri(uri: string): Bookmark[] {
    return [...(this.data[uri] ?? [])]
  }

  find(uri: string, line: number): Bookmark | undefined {
    return (this.data[uri] ?? []).find(b => b.line === line)
  }

  toggle(uri: string, line: number, label?: string): { added: boolean; bookmark: Bookmark } {
    const list = this.data[uri] ?? (this.data[uri] = [])
    const idx = list.findIndex(b => b.line === line)
    if (idx >= 0) {
      const [removed] = list.splice(idx, 1)
      if (list.length === 0) {
        delete this.data[uri]
      }
      return { added: false, bookmark: removed }
    }
    const bookmark: Bookmark = label ? { line, label } : { line }
    list.push(bookmark)
    list.sort((a, b) => a.line - b.line)
    return { added: true, bookmark }
  }

  setLabel(uri: string, line: number, label: string | undefined): boolean {
    const list = this.data[uri]
    if (!list) {
      return false
    }
    const b = list.find(bm => bm.line === line)
    if (!b) {
      return false
    }
    if (label && label.length > 0) {
      b.label = label
    } else {
      delete b.label
    }
    return true
  }

  remove(uri: string, line: number): boolean {
    const list = this.data[uri]
    if (!list) {
      return false
    }
    const idx = list.findIndex(b => b.line === line)
    if (idx < 0) {
      return false
    }
    list.splice(idx, 1)
    if (list.length === 0) {
      delete this.data[uri]
    }
    return true
  }

  clearForUri(uri: string): number {
    const list = this.data[uri]
    if (!list) {
      return 0
    }
    const count = list.length
    delete this.data[uri]
    return count
  }

  clearAll(): number {
    const count = this.getAll().length
    this.data = {}
    return count
  }

  /**
   * Re-aligns line numbers for the given URI after a document edit.
   * Returns the number of bookmarks that were dropped because their
   * lines were removed entirely.
   */
  adjustForChange(uri: string, change: DocumentChange): { removed: number } {
    const list = this.data[uri]
    if (!list || list.length === 0) {
      return { removed: 0 }
    }
    const startLine = change.range.start.line
    const endLine = change.range.end.line
    const newLines = countNewlines(change.text)
    const removedLines = endLine - startLine
    const delta = newLines - removedLines

    let removed = 0
    const next: Bookmark[] = []
    for (const b of list) {
      const adjusted = adjustLineNumber(b.line, startLine, endLine, delta)
      if (adjusted === null) {
        removed++
        continue
      }
      next.push({ ...b, line: adjusted })
    }
    // Merge bookmarks that collapsed to the same line — keep the first one.
    const dedup: Bookmark[] = []
    const seen = new Set<number>()
    for (const b of next) {
      if (seen.has(b.line)) {
        continue
      }
      seen.add(b.line)
      dedup.push(b)
    }
    dedup.sort((a, b) => a.line - b.line)
    if (dedup.length === 0) {
      delete this.data[uri]
    } else {
      this.data[uri] = dedup
    }
    return { removed }
  }
}

function countNewlines(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      count++
    }
  }
  return count
}

/**
 * Returns the adjusted line for `line` given a document change that replaced
 * `[startLine..endLine]` with content adding `delta` net lines, or null if
 * the line was removed by the change.
 */
export function adjustLineNumber(
  line: number,
  startLine: number,
  endLine: number,
  delta: number
): number | null {
  if (endLine < line) {
    return line + delta
  }
  if (startLine > line) {
    return line
  }
  if (startLine === line) {
    return line
  }
  // startLine < line <= endLine — the line was inside the replaced range.
  if (delta >= 0) {
    return startLine
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

export interface FormattedBookmark {
  label: string
  description: string
  detail?: string
}

export function formatBookmark(
  uri: string,
  bookmark: Bookmark,
  relativePath: string,
  lineText: string | undefined
): FormattedBookmark {
  const baseLabel = bookmark.label?.trim() || lineText?.trim() || `Line ${bookmark.line + 1}`
  const label = truncate(baseLabel, 80)
  const description = `${relativePath}:${bookmark.line + 1}`
  let detail: string | undefined
  if (bookmark.label && lineText && lineText.trim().length > 0) {
    detail = truncate(lineText.trim(), 200)
  }
  void uri
  return detail ? { label, description, detail } : { label, description }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…'
}
