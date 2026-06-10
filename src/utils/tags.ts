/**
 * Pure tag-matching utilities for auto-rename-tag.
 * No VS Code dependency — fully unit-testable.
 */

export const SELF_CLOSING_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'command',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'menuitem',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

export const TAG_NAME_RE = /^[!:\w$]((?![>/])[\S])*/

// Sticky variant: matches a tag name at an exact offset without slicing the
// document. The substring().match() pattern copies the rest of the text for
// every probed `<`, turning scans quadratic on large files.
const TAG_NAME_STICKY_RE = /[!:\w$]((?![>/])[\S])*/y

/** Matches a tag name starting exactly at `offset`, with no string copies. */
export function matchTagNameAt(text: string, offset: number): string | undefined {
  TAG_NAME_STICKY_RE.lastIndex = offset
  const match = TAG_NAME_STICKY_RE.exec(text)
  return match ? match[0] : undefined
}

/**
 * How far `getTagAtOffset` walks backward looking for `<`. Real tag names are
 * tiny; without a bound, typing in a large file with no `<`/`>` before the
 * cursor (the default activation covers all languages) scans to the start
 * of the document on every keystroke.
 */
const MAX_TAG_NAME_SCAN = 256

export interface TagInfo {
  isClosing: boolean
  tagNameStart: number
  tagNameEnd: number
  tagName: string
}

export interface TagRange {
  start: number
  end: number
}

/**
 * Finds the tag context at the given offset in the text.
 * Returns info about whether it's an opening or closing tag and the tag name range.
 */
export function getTagAtOffset(text: string, offset: number): TagInfo | undefined {
  let i = offset
  const lowerBound = Math.max(0, offset - MAX_TAG_NAME_SCAN)
  while (i > lowerBound) {
    i--
    if (text[i] === '<') {
      break
    }
    if (text[i] === '>') {
      return undefined
    }
  }

  if (text[i] !== '<') {
    return undefined
  }

  const isClosing = text[i + 1] === '/'
  const nameStart = isClosing ? i + 2 : i + 1

  const tagName = matchTagNameAt(text, nameStart)
  if (tagName === undefined) {
    return undefined
  }

  const nameEnd = nameStart + tagName.length

  if (offset < nameStart || offset > nameEnd) {
    return undefined
  }

  return { isClosing, tagNameStart: nameStart, tagNameEnd: nameEnd, tagName }
}

/**
 * Checks if the tag at the given position (after the tag name) is self-closing.
 * Looks for '/>' before the closing '>'.
 */
export function isSelfClosingAt(text: string, afterNameOffset: number): boolean {
  for (let i = afterNameOffset; i < text.length; i++) {
    if (text[i] === '>') {
      return text[i - 1] === '/'
    }
    if (text[i] === '<') {
      return false
    }
  }
  return false
}

/**
 * Scans forward from startOffset to find the matching closing tag.
 * Uses a stack to handle nesting.
 */
export function findMatchingClosingTag(text: string, startOffset: number, tagName: string): TagRange | undefined {
  let pos = startOffset
  let depth = 0

  while (pos < text.length) {
    const idx = text.indexOf('<', pos)
    if (idx === -1) {
      break
    }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined) {
        const nameEnd = nameStart + name.length
        if (name.toLowerCase() === tagName.toLowerCase()) {
          if (depth === 0) {
            return { start: nameStart, end: nameEnd }
          }
          depth--
        }
        pos = nameEnd
        continue
      }
    } else if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined) {
        const nameEnd = nameStart + name.length

        if (name.toLowerCase() === tagName.toLowerCase()) {
          if (!isSelfClosingAt(text, nameEnd)) {
            depth++
          }
        }
        pos = nameEnd
        continue
      }
    }

    pos = idx + 1
  }

  return undefined
}

/**
 * Finds the nearest unmatched closing tag scanning forward from startOffset.
 * Uses a stack: opening tags push, closing tags pop. First closing tag at depth 0 wins.
 */
export function findNearestUnmatchedClosingTag(text: string, startOffset: number): TagRange | undefined {
  let pos = startOffset
  let depth = 0

  while (pos < text.length) {
    const idx = text.indexOf('<', pos)
    if (idx === -1) {
      break
    }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined) {
        const nameEnd = nameStart + name.length
        if (depth === 0) {
          return { start: nameStart, end: nameEnd }
        }
        depth--
        pos = nameEnd
        continue
      }
    } else if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined) {
        const nameEnd = nameStart + name.length
        let j = nameEnd
        while (j < text.length && text[j] !== '>') {
          if (text[j] === '<') {
            break
          }
          j++
        }
        const isSelfClosing = j < text.length && text[j] === '>' && text[j - 1] === '/'
        if (!isSelfClosing && !SELF_CLOSING_TAGS.has(name.toLowerCase())) {
          depth++
        }
        pos = nameEnd
        continue
      }
    }

    pos = idx + 1
  }

  return undefined
}

/**
 * Finds the nearest unmatched opening tag scanning backward from startOffset.
 * Uses a stack: closing tags push, opening tags pop. First opening tag at depth 0 wins.
 */
export function findNearestUnmatchedOpeningTag(text: string, startOffset: number): TagRange | undefined {
  let pos = startOffset
  let depth = 0

  while (pos > 0) {
    const idx = text.lastIndexOf('<', pos - 1)
    if (idx === -1) {
      break
    }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined) {
        depth++
      }
      pos = idx
      continue
    }

    if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined) {
        const nameEnd = nameStart + name.length
        let j = nameEnd
        while (j < text.length && text[j] !== '>') {
          if (text[j] === '<') {
            break
          }
          j++
        }
        const isSelfClosing = j < text.length && text[j] === '>' && text[j - 1] === '/'
        if (!isSelfClosing && !SELF_CLOSING_TAGS.has(name.toLowerCase())) {
          if (depth === 0) {
            return { start: nameStart, end: nameEnd }
          }
          depth--
        }
      }
    }

    pos = idx
  }

  return undefined
}

/**
 * Scans backward from startOffset to find the matching opening tag.
 * Uses a stack to handle nesting.
 */
export function findMatchingOpeningTag(text: string, startOffset: number, tagName: string): TagRange | undefined {
  let pos = startOffset
  let depth = 0

  while (pos > 0) {
    const idx = text.lastIndexOf('<', pos - 1)
    if (idx === -1) {
      break
    }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined && name.toLowerCase() === tagName.toLowerCase()) {
        depth++
      }
      pos = idx
      continue
    }

    if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1
      const name = matchTagNameAt(text, nameStart)
      if (name !== undefined) {
        const nameEnd = nameStart + name.length

        if (name.toLowerCase() === tagName.toLowerCase()) {
          if (!isSelfClosingAt(text, nameEnd)) {
            if (depth === 0) {
              return { start: nameStart, end: nameEnd }
            }
            depth--
          }
        }
      }
    }

    pos = idx
  }

  return undefined
}
