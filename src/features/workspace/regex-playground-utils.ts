import { escapeHtml } from '../../utils/html'

export interface MatchInfo {
  full: string
  index: number
  end: number
  groups: string[]
  /** Named groups, when present. */
  namedGroups: Record<string, string>
}

export type CompileResult = { ok: true; re: RegExp } | { ok: false; error: string }

const MAX_MATCHES = 10000
const VALID_FLAGS = 'dgimsuvy'

/**
 * Validates flags and constructs a RegExp. Returns an error string on failure.
 */
export function compileRegex(pattern: string, flags: string): CompileResult {
  if (pattern.length === 0) {
    return { ok: false, error: 'Pattern is empty.' }
  }
  if (flags.length !== new Set(flags).size) {
    return { ok: false, error: 'Duplicate flag.' }
  }
  for (const ch of flags) {
    if (!VALID_FLAGS.includes(ch)) {
      return { ok: false, error: `Unknown flag: ${ch}` }
    }
  }
  try {
    return { ok: true, re: new RegExp(pattern, flags) }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

/**
 * Returns up to MAX_MATCHES match infos. Honors the global flag.
 */
export function findAllMatches(re: RegExp, input: string): MatchInfo[] {
  const out: MatchInfo[] = []
  if (re.global) {
    let lastIndex = -1
    for (const m of input.matchAll(re)) {
      if (out.length >= MAX_MATCHES) {
        break
      }
      const index = m.index ?? 0
      // Defensive guard against pathological zero-width loops at the same index.
      if (m[0].length === 0 && index === lastIndex) {
        break
      }
      out.push(toMatchInfo(m, index))
      lastIndex = index
    }
  } else {
    const m = re.exec(input)
    if (m) {
      out.push(toMatchInfo(m, m.index))
    }
  }
  return out
}

function toMatchInfo(m: RegExpMatchArray, index: number): MatchInfo {
  return {
    full: m[0],
    index,
    end: index + m[0].length,
    groups: m.slice(1).map(g => g ?? ''),
    namedGroups: m.groups ? { ...m.groups } : {}
  }
}

/**
 * Renders the input as HTML with non-overlapping <mark> spans for each match.
 * Alternates between two CSS classes so consecutive matches are visually distinguishable.
 */
export function highlightMatches(input: string, matches: MatchInfo[]): string {
  if (matches.length === 0) {
    return escapeHtml(input)
  }
  let out = ''
  let pos = 0
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (m.index < pos) {
      continue // overlapping match; skip
    }
    out += escapeHtml(input.slice(pos, m.index))
    const cls = i % 2 === 0 ? 'm-0' : 'm-1'
    out += `<mark class="match ${cls}">${escapeHtml(m.full)}</mark>`
    pos = m.end
  }
  out += escapeHtml(input.slice(pos))
  return out
}

export function applyReplace(re: RegExp, input: string, replaceText: string): string {
  return input.replace(re, replaceText)
}

export interface EvalResult {
  error: string | null
  matches: MatchInfo[]
  highlightedHtml: string
  replaceResult: string
}

/**
 * Full playground evaluation: compile, match, highlight, replace.
 * Runs inside the regex worker thread so catastrophic backtracking
 * cannot freeze the extension host.
 */
export function evaluatePattern(pattern: string, flags: string, input: string, replaceText: string): EvalResult {
  const compiled = compileRegex(pattern, flags)
  if (!compiled.ok) {
    return { error: compiled.error, matches: [], highlightedHtml: '', replaceResult: '' }
  }
  const matches = findAllMatches(compiled.re, input)
  const highlightedHtml = highlightMatches(input, matches)
  let replaceResult = ''
  try {
    // Fresh RegExp because exec/matchAll above advances lastIndex on global regexes
    const reFresh = compileRegex(pattern, flags) as { ok: true; re: RegExp }
    replaceResult = applyReplace(reFresh.re, input, replaceText)
  } catch (error) {
    replaceResult = `Replace failed: ${(error as Error).message}`
  }
  return { error: null, matches, highlightedHtml, replaceResult }
}
