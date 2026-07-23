/**
 * Pure logic for Run Scripts — locating the `scripts` entries in a package.json
 * and building the command line to run one. Filesystem- and vscode-free so it
 * can be unit-tested under mocha.
 */

import type { PackageManager } from './npm/npm-types'

export interface ScriptEntry {
  name: string
  /** Zero-based line of the script's key, for placing the CodeLens. */
  line: number
}

/** Span of the `scripts` object's `{ … }` within the source text. */
function findScriptsSpan(text: string): { start: number; end: number } | null {
  const keyMatch = /"scripts"\s*:\s*\{/.exec(text)
  if (!keyMatch) {
    return null
  }
  const open = keyMatch.index + keyMatch[0].length - 1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = open; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        return { start: open, end: i }
      }
    }
  }
  return null
}

function lineOf(text: string, index: number): number {
  let line = 0
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
    }
  }
  return line
}

function findKeyLine(text: string, name: string, span: { start: number; end: number }): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`"${escaped}"\\s*:`, 'g')
  regex.lastIndex = span.start
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > span.end) {
      break
    }
    return lineOf(text, match.index)
  }
  return -1
}

/**
 * Parses the `scripts` block of a package.json, returning each script name and
 * the line its key sits on. The names come from `JSON.parse` (the source of
 * truth); the lines are located with a string-aware scan, so script values that
 * contain braces don't throw the matcher off.
 */
export function parseScripts(text: string): ScriptEntry[] {
  let scripts: Record<string, unknown>
  try {
    const pkg = JSON.parse(text) as { scripts?: unknown }
    if (!pkg.scripts || typeof pkg.scripts !== 'object') {
      return []
    }
    scripts = pkg.scripts as Record<string, unknown>
  } catch {
    return []
  }
  const names = Object.keys(scripts)
  if (names.length === 0) {
    return []
  }
  const span = findScriptsSpan(text)
  if (!span) {
    return []
  }
  const entries: ScriptEntry[] = []
  for (const name of names) {
    const line = findKeyLine(text, name, span)
    if (line >= 0) {
      entries.push({ name, line })
    }
  }
  return entries
}

/** Quotes a script name for the shell only when it contains something unusual. */
export function quoteScriptName(name: string): string {
  return /^[\w.:@/-]+$/.test(name) ? name : JSON.stringify(name)
}

export function buildRunCommand(pm: PackageManager, scriptName: string): string {
  const arg = quoteScriptName(scriptName)
  switch (pm) {
    case 'yarn':
      return `yarn run ${arg}`
    case 'pnpm':
      return `pnpm run ${arg}`
    default:
      return `npm run ${arg}`
  }
}
