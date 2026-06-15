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
  /** Total response body size in bytes (before any storage truncation). */
  bodyBytes?: number
  /** Resolved request headers actually sent, when history is set to store the request. */
  requestHeaders?: HttpHeader[]
  /** Resolved request body actually sent, when stored. */
  requestBody?: string
  /** Origin of the request, for "go to source" and source-based re-send. */
  source?: { uri: string; name: string }
  /**
   * Set when the request never produced an HTTP response (DNS failure, refused
   * connection, timeout, …). HTTP error statuses (4xx/5xx) are normal responses
   * and do NOT set this — they carry their real status instead.
   */
  error?: string
}

/** A fully interpolated request, ready to send (or replay from history). */
export interface ResolvedRequest {
  method: string
  url: string
  headers: HttpHeader[]
  body?: string
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

/** Human-readable status for an entry: `200 OK`, or `Failed: <error>` for a request that never responded. */
export function historyStatusLabel(entry: ResponseHistoryEntry): string {
  return entry.error
    ? `Failed: ${entry.error}`
    : `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ''}`
}

/** Timing + relative-time suffix for an entry (e.g. `123ms · 2 minutes ago · body truncated`). */
export function historyEntryTiming(entry: ResponseHistoryEntry, now: number = Date.now()): string {
  const when = formatRelative(new Date(entry.timestamp), new Date(now))
  return `${entry.durationMs}ms · ${when}${entry.bodyTruncated ? ' · body truncated' : ''}`
}

/** Quick-pick label + description for a history entry (e.g. `200 OK · 123ms · 2 minutes ago`). */
export function describeHistoryEntry(
  entry: ResponseHistoryEntry,
  now: number = Date.now()
): { label: string; description: string } {
  return {
    label: `${entry.method} ${entry.url}`,
    description: `${historyStatusLabel(entry)} · ${historyEntryTiming(entry, now)}`
  }
}

/** One endpoint (method + final URL) with all of its responses, newest first. */
export interface RequestGroup {
  /** Stable group key: `${method} ${url}`. */
  key: string
  method: string
  url: string
  entries: ResponseHistoryEntry[]
}

/**
 * Groups history entries by request (method + final URL) so repeated calls to
 * the same endpoint collapse together instead of appearing interleaved. The input
 * is assumed newest-first; each group keeps that order, and the groups themselves
 * are ordered by their most-recent entry (so the just-used endpoint floats to the
 * top).
 */
export function groupHistoryByRequest(history: ResponseHistoryEntry[]): RequestGroup[] {
  const groups: RequestGroup[] = []
  const byKey = new Map<string, RequestGroup>()
  for (const entry of history) {
    const key = `${entry.method} ${entry.url}`
    let group = byKey.get(key)
    if (!group) {
      group = { key, method: entry.method, url: entry.url, entries: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
}

/** Coarse status bucket used to pick an icon and color for a history entry. */
export type HistoryStatusKind = 'success' | 'redirect' | 'clientError' | 'serverError' | 'failed'

export function historyStatusKind(entry: ResponseHistoryEntry): HistoryStatusKind {
  if (entry.error || entry.status === 0) {
    return 'failed'
  }
  if (entry.status >= 500) {
    return 'serverError'
  }
  if (entry.status >= 400) {
    return 'clientError'
  }
  if (entry.status >= 300) {
    return 'redirect'
  }
  return 'success'
}

/** Human-readable byte size: `820 B`, `1.2 KB`, `3 MB`. Empty string for unknown sizes. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return ''
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  // One decimal under 10 (1.5 KB), whole numbers above (20 KB); drop a trailing .0.
  const rounded = value < 10 ? Number(value.toFixed(1)) : Math.round(value)
  return `${rounded} ${units[i]}`
}

/**
 * Filters history by a free-text query matched against `method url status`.
 * Whitespace-separated terms are AND-ed (case-insensitive), so `POST users` keeps
 * POST calls whose URL contains "users", and `500` keeps server errors. An empty
 * query returns the list unchanged.
 */
export function filterHistory(history: ResponseHistoryEntry[], query: string): ResponseHistoryEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return history
  }
  return history.filter(entry => {
    const status = entry.error ? `failed ${entry.error}` : `${entry.status} ${entry.statusText}`
    const haystack = `${entry.method} ${entry.url} ${status}`.toLowerCase()
    return terms.every(term => haystack.includes(term))
  })
}

/** Per-group status breakdown, newest status first: e.g. `2×200 1×500` (`ERR` for failures). */
export function summarizeGroupStatuses(entries: ResponseHistoryEntry[]): string {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = entry.error || entry.status === 0 ? 'ERR' : String(entry.status)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([status, count]) => `${count}×${status}`).join(' ')
}

/* -------------------------------------------------------------------------- */
/*  Detail panel (webview) HTML                                               */
/* -------------------------------------------------------------------------- */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])
}

/**
 * Serializes a value to JSON safe to embed inside an inline `<script>`. Escapes
 * `<` (so a body containing `</script>` or `<!--` can't break out) and the line
 * separators that are invalid in JS string literals.
 */
export function embedJsonInScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export interface DetailHtmlOptions {
  /** Webview `cspSource` for the Content-Security-Policy. */
  cspSource: string
  /** Per-render nonce allowing the single inline <script>. */
  nonce: string
}

function headerRows(headers: HttpHeader[]): string {
  if (headers.length === 0) {
    return '<tr><td colspan="2" class="muted">— none —</td></tr>'
  }
  return headers
    .map(h => `<tr><td class="hname">${escapeHtml(h.name)}</td><td class="hval">${escapeHtml(h.value)}</td></tr>`)
    .join('')
}

/**
 * Builds the standalone HTML document for the response detail panel. Pure so it
 * can be unit-tested; all VS Code-specific values (CSP source, nonce) are passed
 * in. Colors come from the editor theme via CSS variables.
 */
export function buildResponseDetailHtml(entry: ResponseHistoryEntry, opts: DetailHtmlOptions): string {
  const kind = historyStatusKind(entry)
  const statusText = entry.error ? `Failed — ${entry.error}` : historyStatusLabel(entry)
  const contentType = findHeader(entry.headers, 'content-type') ?? ''
  const isJson = inferLanguageFromContentType(contentType) === 'json'
  const pretty = isJson ? tryPrettyJson(entry.body) : entry.body
  const size = formatBytes(entry.bodyBytes)
  const meta = [
    `${entry.durationMs} ms`,
    size,
    entry.bodyTruncated ? 'body truncated' : '',
    new Date(entry.timestamp).toLocaleString()
  ]
    .filter(Boolean)
    .join(' · ')

  const hasReqHeaders = (entry.requestHeaders?.length ?? 0) > 0
  const hasReqBody = (entry.requestBody?.length ?? 0) > 0
  const requestSection =
    hasReqHeaders || hasReqBody
      ? `<details><summary>Request</summary>${
          hasReqHeaders ? `<table>${headerRows(entry.requestHeaders ?? [])}</table>` : ''
        }${hasReqBody ? `<pre class="reqbody">${escapeHtml(entry.requestBody ?? '')}</pre>` : ''}</details>`
      : ''

  const bodyData = embedJsonInScript({ pretty, raw: entry.body })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'unsafe-inline'; script-src 'nonce-${opts.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 16px 24px; }
  .topbar { position: sticky; top: 0; background: var(--vscode-editor-background); padding: 14px 0 10px; z-index: 1; }
  .reqline { font-family: var(--vscode-editor-font-family); font-size: 13px; word-break: break-all; margin-bottom: 8px; }
  .method { font-weight: 600; margin-right: 6px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 600; font-size: 12px; color: #fff; }
  .badge.success { background: var(--vscode-testing-iconPassed, #2ea043); }
  .badge.redirect { background: var(--vscode-charts-blue, #3794ff); }
  .badge.clientError { background: var(--vscode-charts-yellow, #cca700); color: #000; }
  .badge.serverError, .badge.failed { background: var(--vscode-charts-red, #f14c4c); }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 6px 0 10px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer; font-size: 12px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--vscode-descriptionForeground); margin: 18px 0 6px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td { padding: 3px 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
  .hname { color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-foreground)); white-space: nowrap; font-family: var(--vscode-editor-font-family); }
  .hval { font-family: var(--vscode-editor-font-family); word-break: break-all; }
  .muted { color: var(--vscode-descriptionForeground); }
  details { margin-top: 6px; }
  summary { cursor: pointer; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--vscode-descriptionForeground); margin: 14px 0 4px; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
  pre.wrap { white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>
  <div class="topbar">
    <div class="reqline"><span class="method">${escapeHtml(entry.method)}</span>${escapeHtml(entry.url)}</div>
    <span class="badge ${kind}">${escapeHtml(statusText)}</span>
    <div class="meta">${escapeHtml(meta)}</div>
    <div class="actions">
      <button id="resend">▶ Re-send</button>
      <button id="copyCurl" class="secondary">Copy as curl</button>
      <button id="copyBody" class="secondary">Copy body</button>
      <button id="openText" class="secondary">Open as text</button>
      <button id="toggleWrap" class="secondary">Toggle wrap</button>
      <button id="toggleRaw" class="secondary">Show raw</button>
    </div>
  </div>
  <h3>Response headers</h3>
  <table>${headerRows(entry.headers)}</table>
  ${requestSection}
  <h3>Body</h3>
  <pre id="body"></pre>
  <script nonce="${opts.nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${bodyData};
    const bodyEl = document.getElementById('body');
    let raw = false;
    const render = () => { bodyEl.textContent = raw ? data.raw : data.pretty; };
    render();
    document.getElementById('toggleRaw').addEventListener('click', () => {
      raw = !raw;
      document.getElementById('toggleRaw').textContent = raw ? 'Show pretty' : 'Show raw';
      render();
    });
    document.getElementById('toggleWrap').addEventListener('click', () => bodyEl.classList.toggle('wrap'));
    const post = cmd => () => vscode.postMessage({ command: cmd });
    document.getElementById('resend').addEventListener('click', post('resend'));
    document.getElementById('copyCurl').addEventListener('click', post('copyCurl'));
    document.getElementById('copyBody').addEventListener('click', post('copyBody'));
    document.getElementById('openText').addEventListener('click', post('openText'));
  </script>
</body>
</html>`
}
