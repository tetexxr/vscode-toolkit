export interface TodoItem {
  tag: string
  message: string
  line: number
  uri: string
}

export interface ParseOptions {
  tags: readonly string[]
  caseSensitive: boolean
}

/**
 * Builds a single regex that matches a line containing a comment-style prefix
 * followed by one of the configured tags. Supports //, #, /*, *, --, <!--.
 */
function buildLineRegex(opts: ParseOptions): RegExp {
  const escapedTags = opts.tags.map(t => escapeRegex(t)).join('|')
  // Comment markers:
  //   //         (C/JS/TS/...)
  //   #          (Python/Ruby/Shell/YAML)
  //   /*         (C-style block, possibly with leading *s on continuation lines)
  //   *          (a block continuation line)
  //   --         (SQL)
  //   <!--       (HTML/XML/Razor/cshtml)
  const prefix = '(?:\\/\\/|#|\\/\\*+|\\*+|--|<!--)'
  // After the prefix we may have whitespace, optional asterisks (block continuation), more whitespace,
  // then the tag as a whole word, optional colon and whitespace, then the message body.
  // We capture (tag, message). We also strip a trailing */ or --> if present.
  const pattern = `${prefix}\\s*(?:\\*+\\s*)?(${escapedTags})\\b\\s*:?\\s*(.*?)(?:\\s*\\*\\/|\\s*-->)?\\s*$`
  return new RegExp(pattern, opts.caseSensitive ? '' : 'i')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Scans the lines of a document for TODO-like comments. Returns items with
 * 0-based line numbers.
 */
export function parseTodos(text: string, uri: string, opts: ParseOptions): TodoItem[] {
  if (opts.tags.length === 0) {
    return []
  }
  const re = buildLineRegex(opts)
  const lines = text.split(/\r?\n/)
  const out: TodoItem[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(re)
    if (!match) {
      continue
    }
    const tag = opts.caseSensitive ? match[1] : match[1].toUpperCase()
    const message = match[2].trim()
    out.push({ tag, message, line: i, uri })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  Grouping                                                                  */
/* -------------------------------------------------------------------------- */

export interface TagGroup {
  tag: string
  items: TodoItem[]
}

export interface FileGroup {
  uri: string
  items: TodoItem[]
}

export function groupByTag(items: readonly TodoItem[]): TagGroup[] {
  const map = new Map<string, TodoItem[]>()
  for (const item of items) {
    const key = item.tag.toUpperCase()
    const list = map.get(key)
    if (list) {
      list.push(item)
    } else {
      map.set(key, [item])
    }
  }
  return Array.from(map.entries())
    .map(([tag, items]) => ({ tag, items: sortItems(items) }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
}

export function groupByFile(items: readonly TodoItem[]): FileGroup[] {
  const map = new Map<string, TodoItem[]>()
  for (const item of items) {
    const list = map.get(item.uri)
    if (list) {
      list.push(item)
    } else {
      map.set(item.uri, [item])
    }
  }
  return Array.from(map.entries())
    .map(([uri, items]) => ({ uri, items: sortItems(items) }))
    .sort((a, b) => a.uri.localeCompare(b.uri, undefined, { numeric: true, sensitivity: 'base' }))
}

function sortItems(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.uri !== b.uri) {
      return a.uri.localeCompare(b.uri, undefined, { numeric: true, sensitivity: 'base' })
    }
    return a.line - b.line
  })
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

export function formatItemLabel(item: TodoItem): string {
  if (item.message) {
    return item.message
  }
  return `(no description)`
}

export function formatItemDescription(item: TodoItem, relativePath: string): string {
  return `${relativePath}:${item.line + 1}`
}

/* -------------------------------------------------------------------------- */
/*  Preferences                                                               */
/* -------------------------------------------------------------------------- */

export type GroupBy = 'tag' | 'file'

/**
 * Combines the base exclusions (from the declared setting) with the personal
 * ones (stored per-workspace in VS Code's local storage). Base entries come
 * first, duplicates are removed while preserving first-seen order.
 */
export function mergeExclusions(base: readonly string[], personal: readonly string[]): string[] {
  return [...new Set([...base, ...personal])]
}

/**
 * Resolves the effective grouping: the per-workspace stored value wins, falling
 * back to the configured default when it is unset (or not a recognised value).
 */
export function resolveGroupBy(stored: string | undefined, configured: GroupBy): GroupBy {
  return stored === 'tag' || stored === 'file' ? stored : configured
}
