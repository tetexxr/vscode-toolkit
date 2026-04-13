export interface Pos {
  line: number
  col: number
}

export interface BracelessControl {
  keywordLine: number
  condEnd: Pos
  bodyStart: Pos
  bodyEnd: Pos
  indent: string
}

export interface BracedControl {
  openBrace: Pos
  closeBrace: Pos
  stmtText: string
  indent: string
}

export interface TextReplacement {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
  text: string
}

const CONTROL_RE = /^(\s*)(?:\}\s*)?(if|else\s+if|else|for(?:each)?|while)\b/
const MAX_SEARCH_LINES = 20

// ── Detection ──────────────────────────────────────────────────────

export function findBracelessControl(lines: string[], cursorLine: number): BracelessControl | null {
  const minLine = Math.max(0, cursorLine - MAX_SEARCH_LINES)

  for (let line = cursorLine; line >= minLine; line--) {
    const parsed = parseControlKeyword(lines, line)
    if (!parsed) continue

    const afterCond = nextNonWhitespace(lines, parsed.condEnd.line, parsed.condEnd.col)
    if (!afterCond || afterCond.ch === '{') continue

    const bodyStart: Pos = { line: afterCond.line, col: afterCond.col }
    const bodyEnd = findStatementEnd(lines, bodyStart.line, bodyStart.col)
    if (!bodyEnd) continue

    // Skip empty statements (e.g. do...while terminators: while (cond);)
    if (bodyStart.line === bodyEnd.line && bodyStart.col === bodyEnd.col) continue

    if (cursorLine >= line && cursorLine <= bodyEnd.line) {
      return {
        keywordLine: line,
        condEnd: parsed.condEnd,
        bodyStart,
        bodyEnd,
        indent: parsed.indent
      }
    }

    if (line < cursorLine) break
  }

  return null
}

export function findBracedSingleStatementControl(lines: string[], cursorLine: number): BracedControl | null {
  const minLine = Math.max(0, cursorLine - MAX_SEARCH_LINES)

  for (let line = cursorLine; line >= minLine; line--) {
    const parsed = parseControlKeyword(lines, line)
    if (!parsed) continue

    const afterCond = nextNonWhitespace(lines, parsed.condEnd.line, parsed.condEnd.col)
    if (!afterCond || afterCond.ch !== '{') continue

    const openBrace: Pos = { line: afterCond.line, col: afterCond.col }
    const closeBrace = findClosingBrace(lines, openBrace.line, openBrace.col)
    if (!closeBrace) continue

    if (cursorLine < line || cursorLine > closeBrace.line) {
      if (line < cursorLine) break
      continue
    }

    // Don't offer "Remove braces" if else is on the same line as } (K&R style: "} else {")
    // Allman style (else on its own line) is safe to remove braces
    const afterBrace = nextNonWhitespace(lines, closeBrace.line, closeBrace.col + 1)
    if (afterBrace && afterBrace.line === closeBrace.line) {
      const afterText = lines[afterBrace.line].substring(afterBrace.col)
      if (/^else\b/.test(afterText)) continue
    }

    // Find the single statement inside the braces
    const stmtStart = nextNonWhitespace(lines, openBrace.line, openBrace.col + 1)
    if (!stmtStart || stmtStart.ch === '}') continue

    const stmtEnd = findStatementEnd(lines, stmtStart.line, stmtStart.col)
    if (!stmtEnd) continue

    // Verify nothing else between statement end and closing brace
    const afterStmt = nextNonWhitespace(lines, stmtEnd.line, stmtEnd.col + 1)
    if (!afterStmt || afterStmt.line !== closeBrace.line || afterStmt.col !== closeBrace.col) {
      continue
    }

    const stmtText = getTextRange(lines, stmtStart.line, stmtStart.col, stmtEnd.line, stmtEnd.col + 1)

    return { openBrace, closeBrace, stmtText, indent: parsed.indent }
  }

  return null
}

// ── Transformation ─────────────────────────────────────────────────

export function computeAddBraces(
  lines: string[],
  info: BracelessControl,
  indentUnit: string,
  eol: string,
  braceOnNewLine = false
): TextReplacement {
  const bodyIndent = info.indent + indentUnit
  const bodyLines = extractBodyLines(lines, info, bodyIndent)
  const openBrace = braceOnNewLine ? `${eol}${info.indent}{` : ' {'
  return {
    startLine: info.condEnd.line,
    startCol: info.condEnd.col,
    endLine: info.bodyEnd.line,
    endCol: info.bodyEnd.col + 1,
    text: `${openBrace}${eol}${bodyLines.join(eol)}${eol}${info.indent}}`
  }
}

export function computeRemoveBraces(
  lines: string[],
  info: BracedControl,
  indentUnit: string,
  eol: string
): TextReplacement {
  const bodyIndent = info.indent + indentUnit

  // Eat trailing whitespace before the opening brace
  let startLine = info.openBrace.line
  let startCol = info.openBrace.col
  const braceLineText = lines[startLine]
  while (startCol > 0 && (braceLineText[startCol - 1] === ' ' || braceLineText[startCol - 1] === '\t')) {
    startCol--
  }

  // If brace is alone on its line (Allman style), extend to end of previous line
  if (startCol === 0 && startLine > 0) {
    startLine--
    startCol = lines[startLine].length
  }

  return {
    startLine,
    startCol,
    endLine: info.closeBrace.line,
    endCol: info.closeBrace.col + 1,
    text: `${eol}${bodyIndent}${info.stmtText.trim()}`
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function parseControlKeyword(lines: string[], line: number): { indent: string; keyword: string; condEnd: Pos } | null {
  const lineText = lines[line]
  const match = CONTROL_RE.exec(lineText)
  if (!match) return null

  const indent = match[1]
  const keyword = match[2]

  if (keyword === 'else') {
    return { indent, keyword, condEnd: { line, col: match.index + match[0].length } }
  }

  const openParen = lineText.indexOf('(', match.index + match[0].length)
  if (openParen === -1) return null

  const closeParen = findClosingParen(lines, line, openParen)
  if (!closeParen) return null

  return { indent, keyword, condEnd: { line: closeParen.line, col: closeParen.col + 1 } }
}

function extractBodyLines(lines: string[], info: BracelessControl, bodyIndent: string): string[] {
  if (info.bodyStart.line === info.bodyEnd.line) {
    const text = lines[info.bodyStart.line]
    return [bodyIndent + text.substring(info.bodyStart.col, info.bodyEnd.col + 1).trim()]
  }

  const rawLines: string[] = []
  for (let l = info.bodyStart.line; l <= info.bodyEnd.line; l++) {
    const text = lines[l]
    if (l === info.bodyStart.line) {
      rawLines.push(text.substring(info.bodyStart.col))
    } else if (l === info.bodyEnd.line) {
      rawLines.push(text.substring(0, info.bodyEnd.col + 1))
    } else {
      rawLines.push(text)
    }
  }

  // Use the first body line's document indent as reference to preserve relative indentation
  const firstLineDocIndent = lines[info.bodyStart.line].length - lines[info.bodyStart.line].trimStart().length
  let minIndent = firstLineDocIndent
  for (let i = 1; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trimStart()
    if (trimmed.length === 0) continue
    minIndent = Math.min(minIndent, rawLines[i].length - trimmed.length)
  }

  return rawLines.map((line, i) => {
    if (i === 0) return bodyIndent + line.trimEnd()
    return bodyIndent + line.substring(minIndent).trimEnd()
  })
}

function getTextRange(lines: string[], startLine: number, startCol: number, endLine: number, endCol: number): string {
  if (startLine === endLine) {
    return lines[startLine].substring(startCol, endCol)
  }
  const parts: string[] = [lines[startLine].substring(startCol)]
  for (let l = startLine + 1; l < endLine; l++) {
    parts.push(lines[l])
  }
  parts.push(lines[endLine].substring(0, endCol))
  return parts.join('\n')
}

// ── Utilities ──────────────────────────────────────────────────────

export function nextNonWhitespace(lines: string[], line: number, col: number): (Pos & { ch: string }) | null {
  for (let l = line; l < lines.length; l++) {
    const text = lines[l]
    for (let c = l === line ? col : 0; c < text.length; c++) {
      if (text[c] !== ' ' && text[c] !== '\t') {
        return { line: l, col: c, ch: text[c] }
      }
    }
  }
  return null
}

export function findClosingParen(lines: string[], line: number, col: number): Pos | null {
  let depth = 0
  for (let l = line; l < lines.length; l++) {
    const text = lines[l]
    for (let i = l === line ? col : 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"' || ch === "'" || ch === '`') {
        i = skipString(text, i)
        continue
      }
      if (ch === '/' && text[i + 1] === '/') break
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) return { line: l, col: i }
      }
    }
  }
  return null
}

export function findClosingBrace(lines: string[], line: number, col: number): Pos | null {
  let depth = 0
  for (let l = line; l < lines.length; l++) {
    const text = lines[l]
    for (let i = l === line ? col : 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"' || ch === "'" || ch === '`') {
        i = skipString(text, i)
        continue
      }
      if (ch === '/' && text[i + 1] === '/') break
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) return { line: l, col: i }
      }
    }
  }
  return null
}

export function findStatementEnd(lines: string[], line: number, col: number): Pos | null {
  let depth = 0
  for (let l = line; l < lines.length; l++) {
    const text = lines[l]
    let lastNonWsCol = -1
    for (let i = l === line ? col : 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"' || ch === "'" || ch === '`') {
        i = skipString(text, i)
        lastNonWsCol = i
        continue
      }
      if (ch === '/' && text[i + 1] === '/') break
      if (ch === '(' || ch === '{' || ch === '[') {
        depth++
        lastNonWsCol = i
      } else if (ch === ')' || ch === '}' || ch === ']') {
        depth--
        if (depth < 0) {
          return lastNonWsCol >= 0 ? { line: l, col: lastNonWsCol } : null
        }
        lastNonWsCol = i
      } else if (ch === ';' && depth === 0) {
        return { line: l, col: i }
      } else if (ch !== ' ' && ch !== '\t') {
        lastNonWsCol = i
      }
    }
    if (depth === 0 && lastNonWsCol >= 0) {
      if (l + 1 < lines.length) {
        const nextText = lines[l + 1].trimStart()
        if (nextText.startsWith('.') || nextText.startsWith('?.')) continue
      }
      return { line: l, col: lastNonWsCol }
    }
  }
  return null
}

export function skipString(text: string, start: number): number {
  const quote = text[start]
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === quote) return i
  }
  return text.length - 1
}
