/**
 * Pure evaluation logic for the JSON Playground. The user pastes JSON and a
 * JavaScript expression; the expression runs with `$` (and `data`) bound to the
 * parsed JSON. Like the Regex Playground, this runs inside a worker thread so a
 * runaway expression (infinite loop, huge output) can't freeze the host.
 */

export interface JsonEvalResult {
  error: string | null
  /** Formatted result (pretty JSON, or a primitive rendering). */
  output: string
  /** Result kind: 'array' | 'object' | 'string' | 'number' | … or '' on error. */
  type: string
  /** Array length or object key count; null for primitives. */
  count: number | null
  /** True when there's no JSON to work with yet. */
  empty: boolean
}

const MAX_OUTPUT = 2_000_000

function describe(value: unknown): { type: string; count: number | null } {
  if (value === null) {
    return { type: 'null', count: null }
  }
  if (Array.isArray(value)) {
    return { type: 'array', count: value.length }
  }
  if (typeof value === 'object') {
    return { type: 'object', count: Object.keys(value).length }
  }
  return { type: typeof value, count: null }
}

function functionLabel(value: { name?: string }): string {
  return `[Function: ${value.name || 'anonymous'}]`
}

/** JSON.stringify that survives circular references, bigint and functions. */
function safeStringify(value: unknown): string | undefined {
  const seen = new WeakSet<object>()
  return JSON.stringify(
    value,
    (_key: string, val: unknown) => {
      if (typeof val === 'bigint') {
        return `${val}n`
      }
      if (typeof val === 'function') {
        return functionLabel(val)
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]'
        }
        seen.add(val)
      }
      return val
    },
    2
  )
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }
  if (typeof value === 'function') {
    return functionLabel(value)
  }
  if (typeof value === 'bigint') {
    return `${value}n`
  }
  if (typeof value === 'symbol') {
    return value.toString()
  }
  // Anything left (object/array/string/number/boolean/null) always stringifies.
  const output = safeStringify(value) ?? 'undefined'
  return output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n… (output truncated)` : output
}

/**
 * Compiles and runs the query. An expression is the common case
 * (`$.users.map(u => u.name)`), so it's wrapped in `return (…)`. If that isn't
 * valid expression syntax, the query is treated as a function body, letting
 * power users write multi-statement queries with their own `return`.
 */
function runQuery(query: string, data: unknown): unknown {
  let fn: (dollar: unknown, data: unknown) => unknown
  try {
    // Evaluating the user's query is the whole point of this feature; it runs
    // in a worker thread with a timeout, on the user's own data.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    fn = new Function('$', 'data', `"use strict"; return (\n${query}\n);`) as typeof fn
  } catch (error) {
    if (error instanceof SyntaxError) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      fn = new Function('$', 'data', `"use strict"; ${query}`) as typeof fn
    } else {
      throw error
    }
  }
  return fn(data, data)
}

export type ParseResult = { ok: true; data: unknown } | { ok: false; error: string }

/** Parses the JSON text. Split out so the worker can cache it across queries. */
export function parseJson(jsonText: string): ParseResult {
  try {
    return { ok: true, data: JSON.parse(jsonText) }
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${(error as Error).message}` }
  }
}

/** Runs a query against already-parsed data. An empty query pretty-prints it. */
export function evaluateParsed(data: unknown, query: string): JsonEvalResult {
  if (query.trim().length === 0) {
    const { type, count } = describe(data)
    return { error: null, output: formatValue(data), type, count, empty: false }
  }
  let result: unknown
  try {
    result = runQuery(query, data)
  } catch (error) {
    const err = error as Error
    return { error: `${err.name}: ${err.message}`, output: '', type: '', count: null, empty: false }
  }
  const { type, count } = describe(result)
  return { error: null, output: formatValue(result), type, count, empty: false }
}

export function evaluateQuery(jsonText: string, query: string): JsonEvalResult {
  if (jsonText.trim().length === 0) {
    return { error: null, output: '', type: '', count: null, empty: true }
  }
  const parsed = parseJson(jsonText)
  if (!parsed.ok) {
    return { error: parsed.error, output: '', type: '', count: null, empty: false }
  }
  return evaluateParsed(parsed.data, query)
}
