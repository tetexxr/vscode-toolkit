/**
 * Pure tag-matching utilities for auto-rename-tag.
 * No VS Code dependency — fully unit-testable.
 */

export const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img',
  'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source',
  'track', 'wbr',
]);

export const TAG_NAME_RE = /^[!:\w$]((?![>/])[\S])*/;

export interface TagInfo {
  isClosing: boolean;
  tagNameStart: number;
  tagNameEnd: number;
  tagName: string;
}

export interface TagRange {
  start: number;
  end: number;
}

/**
 * Finds the tag context at the given offset in the text.
 * Returns info about whether it's an opening or closing tag and the tag name range.
 */
export function getTagAtOffset(text: string, offset: number): TagInfo | undefined {
  let i = offset;
  while (i > 0) {
    i--;
    if (text[i] === '<') { break; }
    if (text[i] === '>') { return undefined; }
  }

  if (text[i] !== '<') { return undefined; }

  const isClosing = text[i + 1] === '/';
  const nameStart = isClosing ? i + 2 : i + 1;

  const remaining = text.substring(nameStart);
  const match = remaining.match(TAG_NAME_RE);
  if (!match) { return undefined; }

  const tagName = match[0];
  const nameEnd = nameStart + tagName.length;

  if (offset < nameStart || offset > nameEnd) { return undefined; }

  return { isClosing, tagNameStart: nameStart, tagNameEnd: nameEnd, tagName };
}

/**
 * Checks if the tag at the given position (after the tag name) is self-closing.
 * Looks for '/>' before the closing '>'.
 */
export function isSelfClosingAt(text: string, afterNameOffset: number): boolean {
  for (let i = afterNameOffset; i < text.length; i++) {
    if (text[i] === '>') {
      return text[i - 1] === '/';
    }
    if (text[i] === '<') { return false; }
  }
  return false;
}

/**
 * Scans forward from startOffset to find the matching closing tag.
 * Uses a stack to handle nesting.
 */
export function findMatchingClosingTag(
  text: string,
  startOffset: number,
  tagName: string
): TagRange | undefined {
  let pos = startOffset;
  let depth = 0;

  while (pos < text.length) {
    const idx = text.indexOf('<', pos);
    if (idx === -1) { break; }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_NAME_RE);
      if (match) {
        const name = match[0];
        const nameEnd = nameStart + name.length;
        if (name.toLowerCase() === tagName.toLowerCase()) {
          if (depth === 0) {
            return { start: nameStart, end: nameEnd };
          }
          depth--;
        }
        pos = nameEnd;
        continue;
      }
    } else if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_NAME_RE);
      if (match) {
        const name = match[0];
        const nameEnd = nameStart + name.length;

        if (name.toLowerCase() === tagName.toLowerCase()) {
          if (!isSelfClosingAt(text, nameEnd)) {
            depth++;
          }
        }
        pos = nameEnd;
        continue;
      }
    }

    pos = idx + 1;
  }

  return undefined;
}

/**
 * Scans backward from startOffset to find the matching opening tag.
 * Uses a stack to handle nesting.
 */
export function findMatchingOpeningTag(
  text: string,
  startOffset: number,
  tagName: string
): TagRange | undefined {
  let pos = startOffset;
  let depth = 0;

  while (pos > 0) {
    const idx = text.lastIndexOf('<', pos - 1);
    if (idx === -1) { break; }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_NAME_RE);
      if (match && match[0].toLowerCase() === tagName.toLowerCase()) {
        depth++;
      }
      pos = idx;
      continue;
    }

    if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_NAME_RE);
      if (match) {
        const name = match[0];
        const nameEnd = nameStart + name.length;

        if (name.toLowerCase() === tagName.toLowerCase()) {
          if (!isSelfClosingAt(text, nameEnd)) {
            if (depth === 0) {
              return { start: nameStart, end: nameEnd };
            }
            depth--;
          }
        }
      }
    }

    pos = idx;
  }

  return undefined;
}
