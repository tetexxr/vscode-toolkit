/**
 * JSON ⇄ YAML conversion without external dependencies.
 *
 * The emitter covers everything JSON can express. The parser covers the
 * block-style YAML subset that the emitter produces, plus flow collections,
 * quoted scalars, and comments — enough for config-file YAML. Unsupported
 * constructs (block scalars `|`/`>`, anchors, aliases, tags, multiple
 * documents) throw a TransformError with a clear message.
 */

import { TransformError } from './transform-utils'

/* -------------------------------------------------------------------------- */
/*  JSON → YAML                                                               */
/* -------------------------------------------------------------------------- */

export function jsonToYaml(input: string): string {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (error) {
    throw new TransformError(`Invalid JSON: ${(error as Error).message}`)
  }
  return emitNode(value, 0).join('\n')
}

const PLAIN_SCALAR_RE = /^[A-Za-z_][A-Za-z0-9_ ./@-]*$/
const YAML_RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'])

function scalarToYaml(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  if (typeof value !== 'string') {
    // JSON.parse only yields scalars handled above; defensive fallback.
    return JSON.stringify(value)
  }
  const s = value
  // Control characters / newlines / quotes / backslashes: JSON-style escapes.
   
  if (/[\u0000-\u001f"\\]/.test(s)) {
    return JSON.stringify(s)
  }
  if (
    s.length > 0 &&
    s === s.trim() &&
    PLAIN_SCALAR_RE.test(s) &&
    !YAML_RESERVED.has(s.toLowerCase()) &&
    !s.includes('  ')
  ) {
    return s
  }
  return `'${s.replaceAll("'", "''")}'`
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== 'object'
}

function emitNode(value: unknown, depth: number): string[] {
  const pad = '  '.repeat(depth)
  if (isScalar(value)) {
    return [pad + scalarToYaml(value)]
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [pad + '[]']
    }
    const lines: string[] = []
    for (const item of value) {
      if (isScalar(item)) {
        lines.push(`${pad}- ${scalarToYaml(item)}`)
      } else if (Array.isArray(item) ? item.length === 0 : Object.keys(item as object).length === 0) {
        lines.push(`${pad}- ${Array.isArray(item) ? '[]' : '{}'}`)
      } else {
        // Compact notation: the first line of the nested block rides on the dash.
        const sub = emitNode(item, depth + 1)
        lines.push(`${pad}- ${sub[0].slice((depth + 1) * 2)}`)
        lines.push(...sub.slice(1))
      }
    }
    return lines
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) {
    return [pad + '{}']
  }
  const lines: string[] = []
  for (const [key, entryValue] of entries) {
    const yamlKey = scalarToYaml(key)
    if (isScalar(entryValue)) {
      lines.push(`${pad}${yamlKey}: ${scalarToYaml(entryValue)}`)
    } else if (
      Array.isArray(entryValue) ? entryValue.length === 0 : Object.keys(entryValue as object).length === 0
    ) {
      lines.push(`${pad}${yamlKey}: ${Array.isArray(entryValue) ? '[]' : '{}'}`)
    } else {
      lines.push(`${pad}${yamlKey}:`)
      lines.push(...emitNode(entryValue, depth + 1))
    }
  }
  return lines
}

/* -------------------------------------------------------------------------- */
/*  YAML → JSON                                                               */
/* -------------------------------------------------------------------------- */

export function yamlToJson(input: string): string {
  const value = parseYaml(input)
  return JSON.stringify(value, null, 2)
}

interface YamlLine {
  indent: number
  content: string
}

export function parseYaml(input: string): unknown {
  const rawLines = input.split(/\r?\n/)
  const lines: YamlLine[] = []
  let sawDocumentMarker = false

  for (const raw of rawLines) {
    const withoutComment = stripFullLineComment(raw)
    if (withoutComment.trim().length === 0) {
      continue
    }
    if (/^\s*---\s*$/.test(withoutComment)) {
      if (sawDocumentMarker || lines.length > 0) {
        throw new TransformError('Multiple YAML documents are not supported.')
      }
      sawDocumentMarker = true
      continue
    }
    const indentMatch = /^[ ]*/.exec(withoutComment)![0]
    if (withoutComment[indentMatch.length] === '\t' || indentMatch.includes('\t')) {
      throw new TransformError('Tabs are not allowed in YAML indentation.')
    }
    lines.push({ indent: indentMatch.length, content: withoutComment.trim() })
  }

  if (lines.length === 0) {
    return null
  }

  const parser = new BlockParser(lines)
  const value = parser.parseBlock(lines[0].indent)
  if (parser.position < lines.length) {
    throw new TransformError(`Unexpected content at: "${lines[parser.position].content}"`)
  }
  return value
}

function stripFullLineComment(line: string): string {
  return /^\s*#/.test(line) ? '' : line
}

class BlockParser {
  position = 0

  constructor(private lines: YamlLine[]) {}

  parseBlock(indent: number): unknown {
    const line = this.lines[this.position]
    if (line.content === '-' || line.content.startsWith('- ')) {
      return this.parseSequence(indent)
    }
    if (findKeySplit(line.content) !== null) {
      return this.parseMapping(indent)
    }
    // Single scalar document / nested scalar value
    this.position++
    return parseScalar(line.content)
  }

  private parseSequence(indent: number): unknown[] {
    const items: unknown[] = []
    while (this.position < this.lines.length) {
      const line = this.lines[this.position]
      if (line.indent !== indent || (line.content !== '-' && !line.content.startsWith('- '))) {
        break
      }
      const rest = line.content === '-' ? '' : line.content.slice(2).trim()
      if (rest === '') {
        this.position++
        items.push(this.parseNested(indent))
      } else if (rest === '-' || rest.startsWith('- ')) {
        // Compact nested sequence on the dash ("- - 4"): re-materialize the
        // inline part as a deeper line and parse the sequence from there.
        const itemIndent = indent + 2
        this.lines[this.position] = { indent: itemIndent, content: rest }
        items.push(this.parseSequence(itemIndent))
      } else if (findKeySplit(rest) !== null) {
        // Compact mapping on the dash: re-materialize the inline part as a
        // deeper line and parse the mapping from there.
        const itemIndent = indent + 2
        this.lines[this.position] = { indent: itemIndent, content: rest }
        items.push(this.parseMapping(itemIndent))
      } else {
        this.position++
        items.push(parseScalar(rest))
      }
    }
    return items
  }

  private parseMapping(indent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    while (this.position < this.lines.length) {
      const line = this.lines[this.position]
      if (line.indent !== indent) {
        break
      }
      const split = findKeySplit(line.content)
      if (split === null) {
        break
      }
      const { key, rest } = split
      if (rest === '') {
        this.position++
        result[key] = this.parseNested(indent)
      } else {
        this.position++
        result[key] = parseScalar(rest)
      }
    }
    return result
  }

  /** Parses the block under a `key:` / `-` line, or null when there is none. */
  private parseNested(parentIndent: number): unknown {
    if (this.position >= this.lines.length) {
      return null
    }
    const next = this.lines[this.position]
    if (next.indent > parentIndent) {
      return this.parseBlock(next.indent)
    }
    // A sequence may sit at the same indent as its parent mapping key.
    if (next.indent === parentIndent && (next.content === '-' || next.content.startsWith('- '))) {
      return this.parseSequence(next.indent)
    }
    return null
  }
}

/** Splits `key: value` / `key:` outside quotes. Returns null when the line is not a mapping entry. */
function findKeySplit(content: string): { key: string; rest: string } | null {
  let keyEnd = -1
  if (content.startsWith("'") || content.startsWith('"')) {
    const quote = content[0]
    let i = 1
    while (i < content.length) {
      if (quote === "'" && content[i] === "'" && content[i + 1] === "'") {
        i += 2
        continue
      }
      if (quote === '"' && content[i] === '\\') {
        i += 2
        continue
      }
      if (content[i] === quote) {
        break
      }
      i++
    }
    if (i >= content.length) {
      return null
    }
    const afterQuote = content.slice(i + 1).trimStart()
    if (!afterQuote.startsWith(':')) {
      return null
    }
    const rest = afterQuote.slice(1)
    if (rest !== '' && !rest.startsWith(' ')) {
      return null
    }
    return { key: String(parseScalar(content.slice(0, i + 1))), rest: rest.trim() }
  }

  for (let i = 0; i < content.length; i++) {
    if (content[i] === ':' && (i === content.length - 1 || content[i + 1] === ' ')) {
      keyEnd = i
      break
    }
  }
  if (keyEnd <= 0) {
    return null
  }
  return { key: content.slice(0, keyEnd).trim(), rest: content.slice(keyEnd + 1).trim() }
}

const NUMBER_RE = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/

function parseScalar(text: string): unknown {
  const trimmed = stripInlineComment(text)

  if (trimmed.startsWith('|') || trimmed.startsWith('>')) {
    throw new TransformError('Block scalars (| and >) are not supported.')
  }
  if (trimmed.startsWith('&') || trimmed.startsWith('*')) {
    throw new TransformError('YAML anchors and aliases are not supported.')
  }
  if (trimmed.startsWith('!')) {
    throw new TransformError('YAML tags are not supported.')
  }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseFlow(trimmed)
  }
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as string
    } catch {
      throw new TransformError(`Invalid double-quoted string: ${trimmed}`)
    }
  }
  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'") || trimmed.length < 2) {
      throw new TransformError(`Invalid single-quoted string: ${trimmed}`)
    }
    return trimmed.slice(1, -1).replaceAll("''", "'")
  }
  if (trimmed === '' || trimmed === '~' || trimmed.toLowerCase() === 'null') {
    return null
  }
  if (trimmed === 'true' || trimmed === 'True') {
    return true
  }
  if (trimmed === 'false' || trimmed === 'False') {
    return false
  }
  if (NUMBER_RE.test(trimmed)) {
    return Number(trimmed)
  }
  return trimmed
}

/** Drops a ` # comment` suffix from a plain (unquoted) scalar. */
function stripInlineComment(text: string): string {
  if (text.startsWith('"') || text.startsWith("'")) {
    return text.trim()
  }
  const idx = text.indexOf(' #')
  return (idx === -1 ? text : text.slice(0, idx)).trim()
}

/** Minimal flow-collection parser: [a, b], {k: v}, nested combinations of both. */
function parseFlow(text: string): unknown {
  const open = text[0]
  const close = open === '[' ? ']' : '}'
  if (!text.endsWith(close)) {
    throw new TransformError(`Unterminated flow collection: ${text}`)
  }
  const inner = text.slice(1, -1).trim()
  if (inner === '') {
    return open === '[' ? [] : {}
  }
  const parts = splitTopLevel(inner)
  if (open === '[') {
    return parts.map(part => parseScalar(part))
  }
  const result: Record<string, unknown> = {}
  for (const part of parts) {
    const split = findKeySplit(part)
    if (!split) {
      throw new TransformError(`Invalid flow mapping entry: ${part}`)
    }
    result[split.key] = parseScalar(split.rest)
  }
  return result
}

/** Splits on commas that are not inside quotes or nested brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (quote === "'" && ch === "'" && text[i + 1] === "'") {
        i++
      } else if (quote === '"' && ch === '\\') {
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
    } else if (ch === '[' || ch === '{') {
      depth++
    } else if (ch === ']' || ch === '}') {
      depth--
    } else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts
}
