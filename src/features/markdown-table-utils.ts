/**
 * Pure logic for the Markdown table formatter.
 * No VS Code dependency — testable standalone.
 */

type Alignment = 'left' | 'center' | 'right' | 'none'

/**
 * Splits a table row into cells, honoring escaped pipes (\|) and pipes
 * inside inline code spans (`a|b`).
 */
export function splitRow(line: string): string[] {
  let content = line.trim()
  if (content.startsWith('|')) {
    content = content.slice(1)
  }
  if (content.endsWith('|') && !content.endsWith('\\|')) {
    content = content.slice(0, -1)
  }
  const cells: string[] = []
  let current = ''
  let inCode = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === '\\' && content[i + 1] === '|') {
      current += '\\|'
      i++
      continue
    }
    if (ch === '`') {
      inCode = !inCode
      current += ch
      continue
    }
    if (ch === '|' && !inCode) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

/** Whether the cells form a GFM separator row (---, :--, :-:, --:). */
export function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell))
}

function parseAlignment(cell: string): Alignment {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return 'none'
}

function buildSeparatorCell(alignment: Alignment, width: number): string {
  const dashes = (n: number) => '-'.repeat(Math.max(1, n))
  switch (alignment) {
    case 'center':
      return `:${dashes(width - 2)}:`
    case 'right':
      return `${dashes(width - 1)}:`
    case 'left':
      return `:${dashes(width - 1)}`
    default:
      return dashes(width)
  }
}

function padCell(content: string, width: number, alignment: Alignment): string {
  const gap = width - content.length
  if (gap <= 0) {
    return content
  }
  switch (alignment) {
    case 'right':
      return ' '.repeat(gap) + content
    case 'center': {
      const leftPad = Math.floor(gap / 2)
      return ' '.repeat(leftPad) + content + ' '.repeat(gap - leftPad)
    }
    default:
      return content + ' '.repeat(gap)
  }
}

/**
 * Whether `lines[index]` starts a table: a row containing a pipe whose next
 * line is a separator row.
 */
function startsTable(lines: string[], index: number): boolean {
  const line = lines[index]
  const next = lines[index + 1]
  if (!line || !next || !line.includes('|') || !next.includes('-')) {
    return false
  }
  if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(next)) {
    return false
  }
  return isSeparatorRow(splitRow(next))
}

function isTableRow(line: string | undefined): boolean {
  return !!line && line.includes('|') && line.trim().length > 0
}

export interface TableBlock {
  /** 0-based index of the first line of the table. */
  start: number
  /** 0-based index of the last line (inclusive). */
  end: number
}

/** Finds every table block (header + separator + body rows) in the lines. */
export function findTableBlocks(lines: string[]): TableBlock[] {
  const blocks: TableBlock[] = []
  let i = 0
  while (i < lines.length - 1) {
    if (!startsTable(lines, i)) {
      i++
      continue
    }
    let end = i + 1
    while (end + 1 < lines.length && isTableRow(lines[end + 1])) {
      end++
    }
    blocks.push({ start: i, end })
    i = end + 1
  }
  return blocks
}

export type TableFormatMode = 'align' | 'compact'

/**
 * Formats the lines of a single table, preserving the leading indentation.
 * 'align' pads every column to its widest cell; 'compact' strips all
 * alignment padding (minimal separators, single spaces) — same rendering,
 * fewer characters, and diffs that only touch the row that changed.
 */
export function formatTable(lines: string[], mode: TableFormatMode = 'align'): string[] {
  const indent = /^\s*/.exec(lines[0])![0]
  const rows = lines.map(splitRow)
  const separatorCells = rows[1]
  const alignments = separatorCells.map(parseAlignment)
  const columnCount = Math.max(...rows.map(r => r.length))

  if (mode === 'compact') {
    const MINIMAL: Record<Alignment, string> = { none: '---', left: ':--', right: '--:', center: ':-:' }
    return rows.map((cells, rowIndex) => {
      const formatted: string[] = []
      for (let col = 0; col < columnCount; col++) {
        formatted.push(rowIndex === 1 ? MINIMAL[alignments[col] ?? 'none'] : (cells[col] ?? ''))
      }
      return `${indent}| ${formatted.join(' | ')} |`
    })
  }

  // Column width: widest content cell (separator excluded), minimum 3.
  const widths: number[] = []
  for (let col = 0; col < columnCount; col++) {
    let width = 3
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      if (rowIndex === 1) {
        continue
      }
      width = Math.max(width, (rows[rowIndex][col] ?? '').length)
    }
    widths.push(width)
  }

  return rows.map((cells, rowIndex) => {
    const formatted: string[] = []
    for (let col = 0; col < columnCount; col++) {
      const alignment = alignments[col] ?? 'none'
      if (rowIndex === 1) {
        formatted.push(buildSeparatorCell(alignment, widths[col]))
      } else {
        formatted.push(padCell(cells[col] ?? '', widths[col], alignment))
      }
    }
    return `${indent}| ${formatted.join(' | ')} |`
  })
}

/** Formats every table found in `text`, leaving everything else untouched. */
export function formatMarkdownTables(text: string, mode: TableFormatMode = 'align'): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  for (const block of findTableBlocks(lines)) {
    const formatted = formatTable(lines.slice(block.start, block.end + 1), mode)
    lines.splice(block.start, formatted.length, ...formatted)
  }
  return lines.join(eol)
}

/** The table block containing `line`, or null. */
export function tableBlockAtLine(lines: string[], line: number): TableBlock | null {
  return findTableBlocks(lines).find(b => line >= b.start && line <= b.end) ?? null
}
