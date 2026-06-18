/**
 * Worker-thread entry point for the JSON Playground. User-supplied JavaScript
 * queries can loop forever or produce huge output, so evaluation runs here
 * instead of on the extension host; the host terminates this worker when it
 * exceeds its time budget.
 */

import { parentPort } from 'node:worker_threads'
import { evaluateQuery } from './json-playground-utils'

export interface JsonEvalRequest {
  id: number
  json: string
  query: string
}

parentPort?.on('message', (msg: JsonEvalRequest) => {
  const result = evaluateQuery(msg.json, msg.query)
  parentPort?.postMessage({ id: msg.id, ...result })
})
