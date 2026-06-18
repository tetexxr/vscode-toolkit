import { formatRelative } from '../editing/convert/timestamp-utils'

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
  /** `@assert` directives (comment lines) attached to this request. */
  asserts: string[]
}

export interface ParsedHttpFile {
  variables: HttpVariable[]
  requests: HttpRequest[]
}

const SEPARATOR_PATTERN = /^###(?:\s+(.*))?$/
const VARIABLE_PATTERN = /^@([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/
const REQUEST_LINE_PATTERN = /^([A-Z]+)\s+(\S.*?)(?:\s+HTTP\/[\d.]+)?\s*$/
const HEADER_PATTERN = /^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/
const ASSERT_PATTERN = /^(?:#|\/\/)\s*@assert\s+(.+)$/i

type ParseState = 'idle' | 'headers' | 'body'

export function parseHttpFile(text: string): ParsedHttpFile {
  const lines = text.split(/\r?\n/)
  const variables: HttpVariable[] = []
  const requests: HttpRequest[] = []

  let state: ParseState = 'idle'
  let current: HttpRequest | null = null
  let bodyLines: string[] = []
  let pendingName: string | null = null
  let pendingAsserts: string[] = []
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
      pendingAsserts = []
      state = 'idle'
      continue
    }

    // `@assert` directives live in comment lines; capture them for the request
    // they belong to (attaching to the current one, or buffering for the next).
    const assertMatch = trimmed.match(ASSERT_PATTERN)
    if (assertMatch) {
      const expr = assertMatch[1].trim()
      if (current) {
        current.asserts.push(expr)
      } else {
        pendingAsserts.push(expr)
      }
      continue
    }

    // Comment lines (`#` or `//`) are ignored everywhere — including inside a
    // body — so a section divider placed after a request's JSON body doesn't
    // get appended to it and corrupt the payload. The `###` separator is
    // matched above, so it's never mistaken for a `#` comment here.
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue
    }

    if (state === 'body') {
      bodyLines.push(raw)
      if (trimmed.length > 0) {
        lastMeaningfulLine = i
      }
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
          endLine: i,
          asserts: pendingAsserts
        }
        pendingName = null
        pendingAsserts = []
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

/* -------------------------------------------------------------------------- */
/*  Assertions                                                                */
/* -------------------------------------------------------------------------- */

export interface AssertResult {
  expr: string
  ok: boolean
  message: string
}

type AssertOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'matches'

function stripQuotes(value: string): string {
  const t = value.trim()
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1)
  }
  return t
}

function compareNumeric(actual: number, op: AssertOp, expected: number): boolean {
  if (Number.isNaN(actual) || Number.isNaN(expected)) {
    return false
  }
  switch (op) {
    case '==': return actual === expected
    case '!=': return actual !== expected
    case '>': return actual > expected
    case '>=': return actual >= expected
    case '<': return actual < expected
    case '<=': return actual <= expected
    default: return false
  }
}

function compareString(actual: string, op: AssertOp, expected: string): boolean {
  switch (op) {
    case '==': return actual === expected
    case '!=': return actual !== expected
    case 'contains': return actual.includes(expected)
    case 'matches':
      try {
        return new RegExp(expected).test(actual)
      } catch {
        return false
      }
    default:
      return compareNumeric(Number(actual), op, Number(expected))
  }
}

/**
 * Resolves a small JSONPath subset against a value: `$`, `.key`, `[index]`,
 * `["key"]`, `['key']`. Returns undefined when the path doesn't resolve or
 * isn't fully consumed (no wildcards or filters).
 */
export function evalJsonPath(json: unknown, path: string): unknown {
  if (path[0] !== '$') {
    return undefined
  }
  let cur: unknown = json
  const re = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]|\["([^"]*)"\]|\['([^']*)'\]/g
  let lastIndex = 1
  let match: RegExpExecArray | null
  re.lastIndex = 1
  while ((match = re.exec(path)) !== null) {
    if (match.index !== lastIndex) {
      return undefined
    }
    const key = match[1] ?? match[3] ?? match[4] ?? match[2]
    if (cur === null || typeof cur !== 'object') {
      return undefined
    }
    cur = (cur as Record<string, unknown>)[key]
    lastIndex = re.lastIndex
  }
  return lastIndex === path.length ? cur : undefined
}

function evaluateOne(expr: string, response: ResponseLike): AssertResult {
  const fail = (message: string): AssertResult => ({ expr, ok: false, message })
  const pass = (): AssertResult => ({ expr, ok: true, message: expr })

  let m = /^status\s*(==|!=|>=|<=|>|<)\s*(.+)$/i.exec(expr)
  if (m) {
    const ok = compareNumeric(response.status, m[1] as AssertOp, Number(stripQuotes(m[2])))
    return ok ? pass() : fail(`${expr} — got ${response.status}`)
  }

  m = /^header\s+(\S+)\s+(==|!=|contains|matches)\s+(.+)$/i.exec(expr)
  if (m) {
    const actual = findHeader(response.headers, m[1])
    if (actual === undefined) {
      return fail(`${expr} — header "${m[1]}" not present`)
    }
    const ok = compareString(actual, m[2].toLowerCase() as AssertOp, stripQuotes(m[3]))
    return ok ? pass() : fail(`${expr} — got "${actual}"`)
  }

  m = /^body\s+(\$\S*)\s+(==|!=|>=|<=|>|<|contains|matches)\s+(.+)$/i.exec(expr)
  if (m) {
    let json: unknown
    try {
      json = JSON.parse(response.body)
    } catch {
      return fail(`${expr} — body is not valid JSON`)
    }
    const value = evalJsonPath(json, m[1])
    if (value === undefined) {
      return fail(`${expr} — "${m[1]}" not found`)
    }
    const actualStr = typeof value === 'string' ? value : JSON.stringify(value)
    const ok = compareString(actualStr, m[2].toLowerCase() as AssertOp, stripQuotes(m[3]))
    return ok ? pass() : fail(`${expr} — got ${actualStr}`)
  }

  m = /^body\s+(contains|matches|==|!=)\s+(.+)$/i.exec(expr)
  if (m) {
    const ok = compareString(response.body, m[1].toLowerCase() as AssertOp, stripQuotes(m[2]))
    return ok ? pass() : fail(`${expr} — body did not match`)
  }

  return fail(`${expr} — unrecognized assertion`)
}

/** Evaluates each `@assert` expression against a response. */
export function evaluateAssertions(asserts: string[], response: ResponseLike): AssertResult[] {
  return asserts.map(expr => evaluateOne(expr, response))
}

export function formatResponse(response: ResponseLike, prettyJson = true): string {
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
  // Pretty-printing buffers a second copy and re-parses; skip it for huge bodies.
  if (prettyJson && lang === 'json' && body.trim().length > 0) {
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

/**
 * Builds the http-client.private.env.json overlay scaffold: the same
 * environment names as the public file, each mapped to an empty object. Secrets
 * are then added per environment without overriding the public values (which
 * merge key by key). Returns the pretty-printed JSON document (trailing newline
 * included).
 */
export function buildPrivateEnvScaffold(publicFile: EnvironmentFile | null): string {
  const scaffold: EnvironmentFile = {}
  for (const name of Object.keys(publicFile ?? {})) {
    scaffold[name] = {}
  }
  return JSON.stringify(scaffold, null, 2) + '\n'
}

/**
 * Appends a pattern to .gitignore content, under an optional comment. Returns
 * null when the pattern is already present (bare or root-anchored), so the
 * caller can skip writing; otherwise returns the full new file content. A blank
 * line is inserted before the comment unless the file is empty.
 */
export function appendGitignorePattern(current: string, pattern: string, comment?: string): string | null {
  const alreadyIgnored = current
    .split(/\r?\n/)
    .map(line => line.trim())
    .some(line => line === pattern || line === `/${pattern}`)
  if (alreadyIgnored) {
    return null
  }
  const separator = current.length === 0 ? '' : current.endsWith('\n') ? '\n' : '\n\n'
  const header = comment ? `# ${comment}\n` : ''
  return current + separator + header + pattern + '\n'
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
/*  curl → .http import (the inverse of buildCurl)                            */
/* -------------------------------------------------------------------------- */

export interface ParsedCurlRequest {
  method: string
  url: string
  headers: HttpHeader[]
  body: string
  /** Set when the body comes from a file (`curl --data @path`); rendered as `< path`. */
  bodyFile?: string
}

/**
 * Splits a curl command line into shell-like tokens, honoring single quotes,
 * double quotes, backslash escapes and `\` / `^` line continuations. Browser
 * "Copy as cURL" output — including the `'\''` single-quote escape and the
 * Windows `^`-continued form — tokenizes correctly.
 */
export function tokenizeCurl(input: string): string[] {
  const tokens: string[] = []
  let token = ''
  let hasToken = false
  let state: 'normal' | 'single' | 'double' = 'normal'

  const flush = (): void => {
    if (hasToken) {
      tokens.push(token)
      token = ''
      hasToken = false
    }
  }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (state === 'single') {
      if (ch === "'") {
        state = 'normal'
      } else {
        token += ch
        hasToken = true
      }
    } else if (state === 'double') {
      if (ch === '"') {
        state = 'normal'
      } else if (ch === '\\') {
        const next = input[i + 1]
        if (next === '\n') {
          i++
        } else if (next === '"' || next === '\\' || next === '$' || next === '`') {
          token += next
          hasToken = true
          i++
        } else {
          token += ch
          hasToken = true
        }
      } else {
        token += ch
        hasToken = true
      }
    } else if (ch === "'") {
      state = 'single'
      hasToken = true
    } else if (ch === '"') {
      state = 'double'
      hasToken = true
    } else if (ch === '\\') {
      const next = input[i + 1]
      if (next === '\n') {
        i++
      } else if (next !== undefined) {
        token += next
        hasToken = true
        i++
      }
    } else if (ch === '^' && (input[i + 1] === '\n' || input[i + 1] === '\r')) {
      // Windows cmd line-continuation caret — drop it; the newline separates.
    } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      flush()
    } else {
      token += ch
      hasToken = true
    }
  }
  flush()
  return tokens
}

/** curl flags that take no argument and don't affect the request shape. */
const CURL_FLAGS_NO_ARG = new Set([
  '--compressed', '-s', '--silent', '-S', '--show-error', '-i', '--include', '-k', '--insecure',
  '-L', '--location', '-v', '--verbose', '-#', '--progress-bar', '-f', '--fail', '--http1.1',
  '--http2', '-g', '--globoff', '-j', '--junk-session-cookies', '-N', '--no-buffer', '-O',
  '--remote-name', '-q', '--raw', '--no-keepalive'
])

/** curl flags whose following token is consumed but irrelevant to the request. */
const CURL_FLAGS_SKIP_ARG = new Set([
  '-o', '--output', '-m', '--max-time', '--connect-timeout', '--retry', '-w', '--write-out',
  '--cacert', '--cert', '--key', '-x', '--proxy', '--resolve', '-c', '--cookie-jar',
  '--limit-rate', '--max-redirs'
])

/**
 * Parses a curl command into a request. Handles the common flags produced by
 * browsers / Postman: `-X`, `-H`, `-d/--data*`, `--data-urlencode`, `-F`,
 * `-u` (→ Basic auth), `-b`, `-A`, `-e`, `-G`. Returns null when no URL is found.
 */
export function parseCurl(input: string): ParsedCurlRequest | null {
  const tokens = tokenizeCurl(input)
  // Require the `curl` prefix so arbitrary clipboard text isn't turned into a
  // bogus request (and to mirror buildCurl, which always emits `curl …`).
  if (tokens[0]?.toLowerCase() !== 'curl') {
    return null
  }
  let i = 1

  let method = ''
  let url = ''
  const headers: HttpHeader[] = []
  const dataParts: string[] = []
  let bodyFile = ''
  let forceGet = false

  const addHeader = (raw: string): void => {
    const idx = raw.indexOf(':')
    if (idx === -1) {
      return
    }
    const name = raw.slice(0, idx).trim()
    const value = raw.slice(idx + 1).trim()
    if (name) {
      headers.push({ name, value })
    }
  }

  for (; i < tokens.length; i++) {
    const t = tokens[i]
    const arg = (): string => tokens[++i] ?? ''
    if (t === '-X' || t === '--request') {
      method = arg().toUpperCase()
    } else if (t === '-H' || t === '--header') {
      addHeader(arg())
    } else if (t === '--data-raw') {
      // --data-raw never interprets a leading @ as a file.
      dataParts.push(arg())
    } else if (t === '-d' || t === '--data' || t === '--data-ascii' || t === '--data-binary') {
      const v = arg()
      if (v.startsWith('@') && v !== '@-') {
        bodyFile = v.slice(1) // curl reads this file; .http uses `< path`
      } else {
        dataParts.push(v)
      }
    } else if (t === '--data-urlencode') {
      const v = arg()
      const eq = v.indexOf('=')
      dataParts.push(eq === -1 ? encodeURIComponent(v) : `${v.slice(0, eq)}=${encodeURIComponent(v.slice(eq + 1))}`)
    } else if (t === '-F' || t === '--form') {
      dataParts.push(arg())
    } else if (t === '-u' || t === '--user') {
      headers.push({ name: 'Authorization', value: `Basic ${Buffer.from(arg()).toString('base64')}` })
    } else if (t === '-b' || t === '--cookie') {
      headers.push({ name: 'Cookie', value: arg() })
    } else if (t === '-A' || t === '--user-agent') {
      headers.push({ name: 'User-Agent', value: arg() })
    } else if (t === '-e' || t === '--referer') {
      headers.push({ name: 'Referer', value: arg() })
    } else if (t === '-G' || t === '--get') {
      forceGet = true
    } else if (t === '--url') {
      url = arg()
    } else if (CURL_FLAGS_SKIP_ARG.has(t)) {
      i++
    } else if (CURL_FLAGS_NO_ARG.has(t) || (t.startsWith('-') && t.length > 1)) {
      // Known no-arg flag, or an unknown flag we choose to ignore.
    } else if (!url) {
      url = t
    }
  }

  if (!url) {
    return null
  }

  let body = dataParts.length <= 1 ? (dataParts[0] ?? '') : dataParts.join('&')
  if (forceGet && body) {
    url += (url.includes('?') ? '&' : '?') + body
    body = ''
  }
  if (!method) {
    method = body || bodyFile ? 'POST' : 'GET'
  }
  return bodyFile ? { method, url, headers, body, bodyFile } : { method, url, headers, body }
}

/** Pretty-prints a JSON body when the headers declare a JSON content type. */
function formatImportedBody(body: string, headers: HttpHeader[]): string {
  if (/json/i.test(findHeader(headers, 'content-type') ?? '')) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      // Not valid JSON — keep it verbatim.
    }
  }
  return body
}

/** Renders a parsed request as an `.http` block. */
export function renderHttpRequest(req: ParsedCurlRequest, name = 'Imported from curl'): string {
  const lines = [`### ${name}`, `${req.method} ${req.url}`]
  for (const header of req.headers) {
    lines.push(`${header.name}: ${header.value}`)
  }
  if (req.bodyFile) {
    lines.push('', `< ${req.bodyFile}`)
  } else if (req.body) {
    lines.push('', formatImportedBody(req.body, req.headers))
  }
  return lines.join('\n')
}

/** Converts a curl command into an `.http` block, or null when it can't be parsed. */
export function curlToHttpRequest(input: string, name?: string): string | null {
  const req = parseCurl(input)
  return req ? renderHttpRequest(req, name) : null
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
  /** True when the failure was a timeout — surfaces the "retry with longer timeout" actions. */
  timedOut?: boolean
}

/** Preset timeouts offered for retrying a request that timed out. */
export const RETRY_TIMEOUT_PRESETS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '1 min', ms: 60_000 },
  { label: '2 min', ms: 120_000 },
  { label: '5 min', ms: 300_000 },
  { label: '10 min', ms: 600_000 },
  { label: '30 min', ms: 1_800_000 }
]

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

/**
 * Prepends an entry and caps the history two ways (newest first): at most
 * `perRequestMax` entries per request (method + URL), so a busy endpoint can't
 * evict every other endpoint's history, and at most `globalMax` overall as a
 * storage safety net. Either limit at 0 disables history.
 */
export function addHistoryEntry(
  list: ResponseHistoryEntry[],
  entry: ResponseHistoryEntry,
  perRequestMax: number,
  globalMax: number
): ResponseHistoryEntry[] {
  if (perRequestMax <= 0 || globalMax <= 0) {
    return []
  }
  const counts = new Map<string, number>()
  const kept: ResponseHistoryEntry[] = []
  for (const candidate of [entry, ...list]) {
    const key = `${candidate.method} ${candidate.url}`
    const seen = counts.get(key) ?? 0
    if (seen >= perRequestMax) {
      continue
    }
    counts.set(key, seen + 1)
    kept.push(candidate)
    if (kept.length >= globalMax) {
      break
    }
  }
  return kept
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

/**
 * Immediate children of a directory within a flat list of workspace-relative
 * file paths, for the Requests view's folder-tree mode. `prefix` is the parent
 * directory ('' for the root). Returns the immediate sub-directory paths and the
 * file paths that sit directly in `prefix`, both sorted.
 */
export function directoryChildren(relPaths: string[], prefix: string): { dirs: string[]; files: string[] } {
  const prefixSegs = prefix ? prefix.split('/') : []
  const dirs = new Set<string>()
  const files: string[] = []
  for (const rel of relPaths) {
    if (prefix && !rel.startsWith(prefix + '/')) {
      continue
    }
    const rest = rel.split('/').slice(prefixSegs.length)
    if (rest.length === 1) {
      files.push(rel)
    } else if (rest.length > 1) {
      dirs.add([...prefixSegs, rest[0]].join('/'))
    }
  }
  return { dirs: [...dirs].sort(), files: files.sort() }
}

/** Tree label + description for a request node in the Requests view. */
export function describeRequestNode(request: HttpRequest): { label: string; description: string } {
  // The parser names unnamed blocks "Request N"; for those, lead with method+URL.
  if (/^Request \d+$/.test(request.name)) {
    return { label: `${request.method} ${request.url}`, description: '' }
  }
  return { label: request.name, description: `${request.method} ${request.url}` }
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

/** The collapsible "Request" section (headers + body). Empty string when there's nothing to show. */
function requestSectionHtml(headers: HttpHeader[] | undefined, body: string | undefined, open: boolean): string {
  const hasHeaders = (headers?.length ?? 0) > 0
  const hasBody = (body?.length ?? 0) > 0
  if (!hasHeaders && !hasBody) {
    return ''
  }
  const inner = `${hasHeaders ? `<table>${headerRows(headers ?? [])}</table>` : ''}${
    hasBody ? `<pre class="reqbody">${escapeHtml(body ?? '')}</pre>` : ''
  }`
  return `<details${open ? ' open' : ''}><summary>Request</summary>${inner}</details>`
}

/** Shared stylesheet for the detail/pending panels (theme-driven colors). */
const DETAIL_STYLES = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 16px 24px; }
  .topbar { position: sticky; top: 0; background: var(--vscode-editor-background); padding: 14px 0 10px; z-index: 1; }
  .reqline { font-family: var(--vscode-editor-font-family); font-size: 13px; word-break: break-all; margin-bottom: 8px; }
  .method { display: inline-block; font-weight: 600; font-size: 11px; margin-right: 8px; padding: 3px 8px; border-radius: 4px; color: #fff; background: var(--vscode-badge-background, #4d4d4d); vertical-align: middle; }
  .method-POST { background: #6a9955; color: #000; }
  .method-PUT { background: #d9822b; }
  .method-PATCH { background: var(--vscode-charts-yellow, #cca700); color: #000; }
  .method-DELETE { background: var(--vscode-charts-red, #f14c4c); }
  .method-OPTIONS { background: var(--vscode-charts-blue, #3794ff); }
  .method-HEAD { background: var(--vscode-charts-blue, #3794ff); }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 600; font-size: 12px; color: #fff; }
  .badge.success { background: #82b541; }
  .badge.redirect { background: var(--vscode-charts-blue, #3794ff); }
  .badge.clientError { background: var(--vscode-charts-yellow, #cca700); color: #000; }
  .badge.serverError, .badge.failed { background: #d9605a; }
  .badge.pending { background: var(--vscode-charts-blue, #3794ff); }
  .dot { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 6px 0 10px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .actions.pending { margin-top: 12px; }
  .retry-row { margin-top: 8px; align-items: center; }
  .retry-label { color: var(--vscode-descriptionForeground); font-size: 12px; margin-right: 2px; }
  .elapsed { color: var(--vscode-descriptionForeground); font-size: 12px; margin-left: 8px; font-variant-numeric: tabular-nums; }
  .truncated { color: var(--vscode-charts-yellow, #cca700); font-size: 12px; margin-top: 10px; padding: 6px 10px; border-left: 3px solid var(--vscode-charts-yellow, #cca700); background: var(--vscode-textBlockQuote-background, rgba(255,255,255,.04)); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer; font-size: 12px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: .5; cursor: default; }
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
`

/** Wraps body + an inline (nonce-gated) script into a complete CSP'd HTML document. */
function detailDocument(opts: DetailHtmlOptions, bodyHtml: string, scriptBody: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'unsafe-inline'; script-src 'nonce-${opts.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${DETAIL_STYLES}</style>
</head>
<body>
${bodyHtml}
<script nonce="${opts.nonce}">${scriptBody}</script>
</body>
</html>`
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

  const bodyData = embedJsonInScript({ pretty, raw: entry.body })

  // The history stores at most ~1 MB per response; flag when what's shown is clipped.
  const shownSize = formatBytes(Buffer.byteLength(entry.body, 'utf-8'))
  const truncatedNote = entry.bodyTruncated
    ? `<p class="truncated">⚠ Response truncated — showing the first ${escapeHtml(shownSize)}${
        entry.bodyBytes ? ` of ${escapeHtml(formatBytes(entry.bodyBytes))}` : ''
      }. The history keeps up to ~1&nbsp;MB per response.</p>`
    : ''

  // On timeout, offer one-click retries at preset timeouts (no incremental ramp).
  const retryRow = entry.timedOut
    ? `<div class="actions retry-row"><span class="retry-label">Retry with:</span>${RETRY_TIMEOUT_PRESETS.map(
        p => `<button class="retry secondary" data-ms="${p.ms}">${escapeHtml(p.label)}</button>`
      ).join('')}</div>`
    : ''

  const bodyHtml = `  <div class="topbar">
    <div class="reqline"><span class="method method-${escapeHtml(entry.method)}">${escapeHtml(entry.method)}</span>${escapeHtml(entry.url)}</div>
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
    ${retryRow}
  </div>
  <h3>Response headers</h3>
  <table>${headerRows(entry.headers)}</table>
  ${requestSectionHtml(entry.requestHeaders, entry.requestBody, false)}
  <h3>Body</h3>
  <pre id="body"></pre>
  ${truncatedNote}`

  const scriptBody = `
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
    document.querySelectorAll('.retry').forEach(b =>
      b.addEventListener('click', () => vscode.postMessage({ command: 'retry', timeoutMs: Number(b.dataset.ms) }))
    );
  `

  return detailDocument(opts, bodyHtml, scriptBody)
}

/** A request being sent (for the live execution view). */
export interface PendingRequest {
  method: string
  url: string
  headers: HttpHeader[]
  body?: string
}

/**
 * Builds the "executing" view shown the instant a request is sent: the request we
 * already know, a live elapsed-time counter and a Cancel button. When `cancelled`
 * is true it renders a terminal "Cancelled" state (no timer, no Cancel button).
 */
export function buildPendingDetailHtml(request: PendingRequest, opts: DetailHtmlOptions, cancelled = false): string {
  // The elapsed time lives outside the badge so the badge keeps a fixed width as
  // the counter ticks (otherwise the number changing would resize the badge).
  const badge = cancelled
    ? `<span class="badge failed">Cancelled</span>`
    : `<span class="badge pending"><span class="dot">●</span> Sending…</span><span class="elapsed" id="elapsed">0.0s</span>`
  const actions = cancelled ? '' : `<div class="actions pending"><button id="cancel">Cancel</button></div>`

  const bodyHtml = `  <div class="topbar">
    <div class="reqline"><span class="method method-${escapeHtml(request.method)}">${escapeHtml(request.method)}</span>${escapeHtml(request.url)}</div>
    ${badge}
    ${actions}
  </div>
  ${requestSectionHtml(request.headers, request.body, true)}`

  // Timer runs entirely client-side; Cancel just signals the extension.
  const scriptBody = cancelled
    ? ''
    : `
    const vscode = acquireVsCodeApi();
    const el = document.getElementById('elapsed');
    const t0 = performance.now();
    const timer = setInterval(() => { el.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
    const cancel = document.getElementById('cancel');
    cancel.addEventListener('click', () => {
      vscode.postMessage({ command: 'cancel' });
      clearInterval(timer);
      cancel.disabled = true;
      cancel.textContent = 'Cancelling…';
    });
  `

  return detailDocument(opts, bodyHtml, scriptBody)
}
