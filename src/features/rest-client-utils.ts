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
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, expr: string) => {
    const trimmed = expr.trim()
    if (trimmed === '$timestamp') {
      return String(Math.floor(now / 1000))
    }
    if (trimmed === '$randomUUID') {
      return nextUuid()
    }
    if (trimmed.startsWith('$datetime')) {
      const format = trimmed.slice('$datetime'.length).trim() || 'iso8601'
      if (format === 'iso8601') {
        return new Date(now).toISOString()
      }
      // Unknown format → fall back to iso8601 to keep the template stable.
      return new Date(now).toISOString()
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

/** Builds the curl equivalent of an (already interpolated) request. */
export function buildCurl(req: { method: string; url: string; headers: HttpHeader[]; body: string }): string {
  const parts: string[] = []
  parts.push(req.method === 'GET' ? `curl ${shellQuote(req.url)}` : `curl -X ${req.method} ${shellQuote(req.url)}`)
  for (const header of req.headers) {
    parts.push(`-H ${shellQuote(`${header.name}: ${header.value}`)}`)
  }
  if (req.body.length > 0) {
    parts.push(`--data ${shellQuote(req.body)}`)
  }
  return parts.join(' \\\n  ')
}
