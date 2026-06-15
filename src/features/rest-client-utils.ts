import { formatRelative } from './timestamp-utils'

export interface HttpHeader {
  name: string
  value: string
}

export interface HttpVariable {
  name: string
  value: string
  line: number
}

export interface HttpRequest {
  name: string
  method: string
  url: string
  headers: HttpHeader[]
  body: string
  startLine: number
  endLine: number
}

export interface ParsedHttpFile {
  variables: HttpVariable[]
  requests: HttpRequest[]
}

const SEPARATOR_PATTERN = /^###(?:\s+(.*))?$/
const VARIABLE_PATTERN = /^@([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/
const REQUEST_LINE_PATTERN = /^([A-Z]+)\s+(\S.*?)(?:\s+HTTP\/[\d.]+)?\s*$/
const HEADER_PATTERN = /^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/

type ParseState = 'idle' | 'headers' | 'body'

export function parseHttpFile(text: string): ParsedHttpFile {
  const lines = text.split(/\r?\n/)
  const variables: HttpVariable[] = []
  const requests: HttpRequest[] = []

  let state: ParseState = 'idle'
  let current: HttpRequest | null = null
  let bodyLines: string[] = []
  let pendingName: string | null = null
  let lastMeaningfulLine = -1

  const finalize = () => {
    if (!current) {
      return
    }
    if (bodyLines.length > 0) {
      let start = 0
      while (start < bodyLines.length && bodyLines[start].trim() === '') {
        start++
      }
      let end = bodyLines.length - 1
      while (end >= start && bodyLines[end].trim() === '') {
        end--
      }
      if (end >= start) {
        current.body = bodyLines.slice(start, end + 1).join('\n')
      }
    }
    current.endLine = Math.max(current.startLine, lastMeaningfulLine)
    requests.push(current)
    current = null
    bodyLines = []
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    const sepMatch = trimmed.match(SEPARATOR_PATTERN)
    if (sepMatch) {
      finalize()
      const name = sepMatch[1]?.trim()
      pendingName = name && name.length > 0 ? name : null
      state = 'idle'
      continue
    }

    if (state === 'body') {
      bodyLines.push(raw)
      if (trimmed.length > 0) {
        lastMeaningfulLine = i
      }
      continue
    }

    // Comments (single #) outside of body are ignored.
    if (trimmed.startsWith('#')) {
      continue
    }

    if (state === 'idle') {
      if (trimmed === '') {
        continue
      }
      const varMatch = trimmed.match(VARIABLE_PATTERN)
      if (varMatch) {
        variables.push({ name: varMatch[1], value: varMatch[2].trim(), line: i })
        continue
      }
      const reqMatch = trimmed.match(REQUEST_LINE_PATTERN)
      if (reqMatch) {
        const name = pendingName ?? `Request ${requests.length + 1}`
        current = {
          name,
          method: reqMatch[1].toUpperCase(),
          url: reqMatch[2].trim(),
          headers: [],
          body: '',
          startLine: i,
          endLine: i
        }
        pendingName = null
        lastMeaningfulLine = i
        state = 'headers'
        continue
      }
      continue
    }

    // state === 'headers'
    if (trimmed === '') {
      state = 'body'
      continue
    }
    const headerMatch = trimmed.match(HEADER_PATTERN)
    if (headerMatch && current) {
      current.headers.push({ name: headerMatch[1], value: headerMatch[2].trim() })
      lastMeaningfulLine = i
      continue
    }
    const varMatch = trimmed.match(VARIABLE_PATTERN)
    if (varMatch) {
      variables.push({ name: varMatch[1], value: varMatch[2].trim(), line: i })
      continue
    }
  }

  finalize()
  return { variables, requests }
}

/* -------------------------------------------------------------------------- */
/*  Interpolation                                                             */
/* -------------------------------------------------------------------------- */

export interface InterpolateOptions {
  /** Wall-clock time used for $timestamp / $datetime. */
  now?: number
  /** Pure function returning fresh UUIDs for each $randomUUID. */
  nextUuid?: () => string
  /** Pure function returning a float in [0, 1) for $randomInt. Defaults to Math.random. */
  random?: () => number
  /** Process environment used to resolve {{$processEnv NAME}}. */
  processEnv?: Record<string, string | undefined>
  /** Variables loaded from a .env file, used to resolve {{$dotenv NAME}}. */
  dotenv?: Record<string, string>
}

/** Offset units accepted by $timestamp / $datetime (e.g. `-1 d`). */
const OFFSET_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
}

/**
 * Applies an `<amount> <unit>` offset to a base epoch (ms). Years (`y`) and
 * months (`M`) use calendar arithmetic; the rest are fixed multiples of ms.
 * Returns the base unchanged when the offset can't be parsed.
 */
function applyTimeOffset(baseMs: number, amount: string | undefined, unit: string | undefined): number {
  if (amount === undefined || unit === undefined) {
    return baseMs
  }
  const value = Number.parseInt(amount, 10)
  if (!Number.isFinite(value)) {
    return baseMs
  }
  if (unit === 'y' || unit === 'M') {
    const date = new Date(baseMs)
    if (unit === 'y') {
      date.setUTCFullYear(date.getUTCFullYear() + value)
    } else {
      date.setUTCMonth(date.getUTCMonth() + value)
    }
    return date.getTime()
  }
  const factor = OFFSET_UNIT_MS[unit]
  return factor ? baseMs + value * factor : baseMs
}

export function interpolate(
  template: string,
  variables: Record<string, string>,
  options: InterpolateOptions = {}
): string {
  if (!template) {
    return template
  }
  const now = options.now ?? Date.now()
  const nextUuid = options.nextUuid ?? (() => fallbackUuid())
  const random = options.random ?? Math.random
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, expr: string) => {
    const trimmed = expr.trim()
    if (trimmed.startsWith('$')) {
      const [name, ...args] = trimmed.split(/\s+/)
      if (name === '$timestamp') {
        return String(Math.floor(applyTimeOffset(now, args[0], args[1]) / 1000))
      }
      if (name === '$randomUUID') {
        return nextUuid()
      }
      if (name === '$randomInt') {
        const min = Number.parseInt(args[0] ?? '0', 10)
        const max = Number.parseInt(args[1] ?? '1000', 10)
        const lo = Number.isFinite(min) ? min : 0
        const hi = Number.isFinite(max) ? max : 1000
        if (hi < lo) {
          return String(lo)
        }
        return String(lo + Math.floor(random() * (hi - lo + 1)))
      }
      if (name === '$datetime') {
        const format = args[0] || 'iso8601'
        const when = new Date(applyTimeOffset(now, args[1], args[2]))
        if (format === 'rfc1123') {
          return when.toUTCString()
        }
        if (format === 'unix') {
          return String(Math.floor(when.getTime() / 1000))
        }
        // iso8601 and any unknown format fall back to ISO to keep the template stable.
        return when.toISOString()
      }
      if (name === '$processEnv') {
        return options.processEnv?.[args[0] ?? ''] ?? ''
      }
      if (name === '$dotenv') {
        return options.dotenv?.[args[0] ?? ''] ?? ''
      }
    }
    if (Object.prototype.hasOwnProperty.call(variables, trimmed)) {
      return variables[trimmed]
    }
    return match
  })
}

function fallbackUuid(): string {
  // Cheap stub for environments without crypto; the production path injects randomUUID().
  let s = ''
  for (let i = 0; i < 32; i++) {
    s += Math.floor(Math.random() * 16).toString(16)
  }
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}

/* -------------------------------------------------------------------------- */
/*  File bodies (< path / <@ path / <@encoding path)                          */
/* -------------------------------------------------------------------------- */

export interface BodyFileRef {
  /** File path as written, relative to the .http file (or absolute). */
  path: string
  /** When true (`<@`), `{{variables}}` inside the file are interpolated. */
  interpolateVariables: boolean
  /** Buffer encoding used to decode the file (default utf-8). */
  encoding: BufferEncoding
}

const VALID_ENCODINGS: ReadonlySet<string> = new Set([
  'utf-8',
  'utf8',
  'latin1',
  'ascii',
  'utf16le',
  'ucs2',
  'base64',
  'hex'
])

/**
 * Recognizes a body that is a single `< path` directive (JetBrains/REST Client
 * style). `< path` sends the raw file; `<@ path` interpolates `{{variables}}`
 * inside it; `<@encoding path` does the same with an explicit encoding.
 * Returns null for any inline body — including XML/HTML that merely starts with
 * `<` (those have no whitespace right after the `<`, or span several lines).
 */
export function parseBodyFileRef(body: string): BodyFileRef | null {
  const trimmed = body.trim()
  const match = trimmed.match(/^<(@[A-Za-z0-9-]*)?[ \t]+(.+)$/)
  if (!match) {
    return null
  }
  const filePath = match[2].trim()
  if (!filePath) {
    return null
  }
  if (match[1] === undefined) {
    return { path: filePath, interpolateVariables: false, encoding: 'utf-8' }
  }
  const requested = match[1].slice(1).toLowerCase()
  const encoding = (requested && VALID_ENCODINGS.has(requested) ? requested : 'utf-8') as BufferEncoding
  return { path: filePath, interpolateVariables: true, encoding }
}

/* -------------------------------------------------------------------------- */
/*  .env parsing (for {{$dotenv NAME}})                                       */
/* -------------------------------------------------------------------------- */

/**
 * Minimal `.env` parser: `KEY=value` per line, `#` comments, optional `export`
 * prefix, and single/double quoted values (quotes stripped). Good enough for
 * resolving {{$dotenv NAME}} without pulling in a dependency.
 */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) {
      continue
    }
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) {
      continue
    }
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    out[match[1]] = value
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  Response formatting                                                       */
/* -------------------------------------------------------------------------- */

export interface ResponseLike {
  status: number
  statusText: string
  headers: HttpHeader[]
  body: string
  durationMs: number
  httpVersion?: string
}

export function inferLanguageFromContentType(contentType: string | undefined): string {
  if (!contentType) {
    return 'plaintext'
  }
  const lower = contentType.toLowerCase()
  if (lower.includes('json')) {
    return 'json'
  }
  if (lower.includes('xml')) {
    return 'xml'
  }
  if (lower.includes('html')) {
    return 'html'
  }
  if (lower.includes('javascript')) {
    return 'javascript'
  }
  if (lower.includes('css')) {
    return 'css'
  }
  if (lower.includes('csv')) {
    return 'csv'
  }
  return 'plaintext'
}

export function findHeader(headers: HttpHeader[], name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) {
      return h.value
    }
  }
  return undefined
}

export function formatResponse(response: ResponseLike): string {
  const httpVersion = response.httpVersion ?? 'HTTP/1.1'
  const lines: string[] = [`${httpVersion} ${response.status} ${response.statusText}`.trimEnd()]
  for (const h of response.headers) {
    lines.push(`${h.name}: ${h.value}`)
  }
  lines.push(`X-Toolkit-Time: ${response.durationMs}ms`)
  lines.push('')

  const contentType = findHeader(response.headers, 'content-type') ?? ''
  const lang = inferLanguageFromContentType(contentType)
  let body = response.body
  if (lang === 'json' && body.trim().length > 0) {
    body = tryPrettyJson(body)
  }
  lines.push(body)
  return lines.join('\n')
}

export function tryPrettyJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

/* -------------------------------------------------------------------------- */
/*  Lookup                                                                    */
/* -------------------------------------------------------------------------- */

export function findRequestAtLine(parsed: ParsedHttpFile, line: number): HttpRequest | undefined {
  for (const req of parsed.requests) {
    if (line >= req.startLine && line <= req.endLine) {
      return req
    }
  }
  return undefined
}

/* -------------------------------------------------------------------------- */
/*  Environments (http-client.env.json, JetBrains-compatible)                 */
/* -------------------------------------------------------------------------- */

export type EnvironmentFile = Record<string, Record<string, string>>

/** Parses an http-client.env.json document. Returns null when unusable. */
export function parseEnvironmentFile(json: string): EnvironmentFile | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null
  }
  const out: EnvironmentFile = {}
  for (const [envName, vars] of Object.entries(data)) {
    if (typeof vars !== 'object' || vars === null || Array.isArray(vars)) {
      continue
    }
    const envVars: Record<string, string> = {}
    for (const [key, value] of Object.entries(vars as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        envVars[key] = String(value)
      }
    }
    out[envName] = envVars
  }
  return out
}

/** Environment names across both files, public order first. */
export function environmentNames(publicFile: EnvironmentFile | null, privateFile: EnvironmentFile | null): string[] {
  const names = Object.keys(publicFile ?? {})
  for (const name of Object.keys(privateFile ?? {})) {
    if (!names.includes(name)) {
      names.push(name)
    }
  }
  return names
}

/** Variables of one environment; the private file overrides the public one key by key. */
export function mergeEnvironmentVariables(
  publicFile: EnvironmentFile | null,
  privateFile: EnvironmentFile | null,
  environment: string
): Record<string, string> {
  return { ...(publicFile?.[environment] ?? {}), ...(privateFile?.[environment] ?? {}) }
}

/* -------------------------------------------------------------------------- */
/*  curl export                                                               */
/* -------------------------------------------------------------------------- */

/** POSIX single-quote escaping: ' → '\'' */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * Builds the curl equivalent of an (already interpolated) request. When
 * `bodyFile` is set the body is sent with `--data @path` (curl reads the file
 * itself); otherwise the inline `body` is passed with `--data`.
 */
export function buildCurl(req: {
  method: string
  url: string
  headers: HttpHeader[]
  body: string
  bodyFile?: string
}): string {
  const parts: string[] = []
  parts.push(req.method === 'GET' ? `curl ${shellQuote(req.url)}` : `curl -X ${req.method} ${shellQuote(req.url)}`)
  for (const header of req.headers) {
    parts.push(`-H ${shellQuote(`${header.name}: ${header.value}`)}`)
  }
  if (req.bodyFile) {
    parts.push(`--data ${shellQuote(`@${req.bodyFile}`)}`)
  } else if (req.body.length > 0) {
    parts.push(`--data ${shellQuote(req.body)}`)
  }
  return parts.join(' \\\n  ')
}

/* -------------------------------------------------------------------------- */
/*  Response history                                                          */
/* -------------------------------------------------------------------------- */

export interface ResponseHistoryEntry {
  /** Stable id used to address the entry from a diff URI. */
  id: string
  method: string
  /** Final (interpolated) URL that was actually requested. */
  url: string
  status: number
  statusText: string
  durationMs: number
  /** Epoch ms at which the response completed. */
  timestamp: number
  headers: HttpHeader[]
  body: string
  /** True when the stored body was clipped to keep workspace state small. */
  bodyTruncated: boolean
  /**
   * Set when the request never produced an HTTP response (DNS failure, refused
   * connection, timeout, …). HTTP error statuses (4xx/5xx) are normal responses
   * and do NOT set this — they carry their real status instead.
   */
  error?: string
}

/** Clips a body to `maxChars` so history never bloats the workspace state. */
export function truncateForHistory(body: string, maxChars: number): { body: string; truncated: boolean } {
  if (body.length <= maxChars) {
    return { body, truncated: false }
  }
  return { body: body.slice(0, maxChars), truncated: true }
}

/** Prepends an entry to the history list and caps it at `max` (newest first). */
export function addHistoryEntry(
  list: ResponseHistoryEntry[],
  entry: ResponseHistoryEntry,
  max: number
): ResponseHistoryEntry[] {
  if (max <= 0) {
    return []
  }
  return [entry, ...list].slice(0, max)
}

/** Quick-pick label + description for a history entry (e.g. `200 OK · 123ms · 2 minutes ago`). */
export function describeHistoryEntry(
  entry: ResponseHistoryEntry,
  now: number = Date.now()
): { label: string; description: string } {
  const when = formatRelative(new Date(entry.timestamp), new Date(now))
  const status = entry.error
    ? `Failed: ${entry.error}`
    : `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ''}`
  return {
    label: `${entry.method} ${entry.url}`,
    description: `${status} · ${entry.durationMs}ms · ${when}${entry.bodyTruncated ? ' · body truncated' : ''}`
  }
}
