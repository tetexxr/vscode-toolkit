/**
 * Worker-thread entry point for the Regex Playground. User-supplied patterns
 * can backtrack catastrophically, so evaluation runs here instead of on the
 * extension host; the host terminates this worker when it exceeds its budget.
 */

import { parentPort } from 'node:worker_threads'
import { evaluatePattern } from './regex-playground-utils'

export interface EvalRequest {
  id: number
  pattern: string
  flags: string
  input: string
  replace: string
}

parentPort?.on('message', (msg: EvalRequest) => {
  const result = evaluatePattern(msg.pattern, msg.flags, msg.input, msg.replace)
  parentPort?.postMessage({ id: msg.id, ...result })
})
