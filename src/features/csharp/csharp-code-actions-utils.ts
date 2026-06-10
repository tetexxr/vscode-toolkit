/**
 * Pure utilities for the C# code action provider.
 * No VS Code dependency — testable standalone.
 */

// Matches auto-properties including generics, nullable, arrays, and init accessors
export const PROPERTY_RE =
  /^\s*(?:public|private|protected|internal)\s+(?:(?:static|virtual|override|abstract|sealed|new|required|readonly)\s+)*(.+?)\s+(\w+)\s*\{\s*get;\s*(?:(?:private|protected|internal)\s+)?(?:set|init)?;?\s*\}/gm

export const CLASS_RE = /(?:public|internal|private|protected)\s+(?:(?:static|partial|sealed|abstract)\s+)*class\s+(\w+)/g

export interface PropertyInfo {
  type: string
  name: string
  /** Absolute offset in the full document where the property declaration ends. */
  end: number
}

export interface ClassInfo {
  name: string
  /** Offset of the class body's opening brace. */
  bodyStart: number
  /** Offset of the class body's matching closing brace. */
  bodyEnd: number
}

/** Index of the brace matching the one at `openIndex`, or -1 if unbalanced. */
export function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

/**
 * The class whose declaration or body contains `offset`. When classes are
 * nested, the innermost one wins. Returns null when the offset is outside
 * every class (e.g. between two top-level classes).
 */
export function findClassAtOffset(text: string, offset: number): ClassInfo | null {
  CLASS_RE.lastIndex = 0
  let found: ClassInfo | null = null
  let match: RegExpExecArray | null
  while ((match = CLASS_RE.exec(text)) !== null) {
    if (match.index > offset) {
      break
    }
    const bodyStart = text.indexOf('{', match.index + match[0].length)
    if (bodyStart === -1) {
      continue
    }
    const bodyEnd = findMatchingBrace(text, bodyStart)
    if (bodyEnd === -1) {
      continue
    }
    if (offset <= bodyEnd) {
      // Later matches that still contain the offset are nested classes: innermost wins.
      found = { name: match[1], bodyStart, bodyEnd }
    }
  }
  return found
}

/** Auto-properties declared between `start` and `end` (offsets into `text`). */
export function findProperties(text: string, start = 0, end = text.length): PropertyInfo[] {
  const slice = text.slice(start, end)
  const props: PropertyInfo[] = []
  PROPERTY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PROPERTY_RE.exec(slice)) !== null) {
    props.push({
      type: match[1].trim(),
      name: match[2],
      end: start + match.index + match[0].length
    })
  }
  return props
}

export function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}
