/**
 * Worker-thread entry point for the JSON Playground. User-supplied JavaScript
 * queries can loop forever or produce huge output, so evaluation runs here
 * instead of on the extension host; the host terminates this worker when it
 * exceeds its time budget.
 */

import { parentPort } from 'node:worker_threads'
import { evaluateParsed, parseJson, type JsonEvalResult, type ParseResult } from './json-playground-utils'

export interface JsonEvalRequest {
  id: number
  json: string
  query: string
}

// Cache the parsed JSON so that iterating on the query (the common case, with
// the JSON held constant) doesn't re-parse a potentially large blob each time.
let cachedJson: string | null = null
let cachedParse: ParseResult | null = null

parentPort?.on('message', (msg: JsonEvalRequest) => {
  let result: JsonEvalResult
  if (msg.json.trim().length === 0) {
    result = { error: null, output: '', type: '', count: null, empty: true }
  } else {
    let parse = cachedParse
    if (msg.json !== cachedJson || !parse) {
      cachedJson = msg.json
      parse = parseJson(msg.json)
      cachedParse = parse
    }
    result = parse.ok
      ? evaluateParsed(parse.data, msg.query)
      : { error: parse.error, output: '', type: '', count: null, empty: false }
  }
  parentPort?.postMessage({ id: msg.id, ...result })
})
