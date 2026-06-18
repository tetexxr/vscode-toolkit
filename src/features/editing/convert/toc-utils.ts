/**
 * Pure helpers behind "Generate Table of Contents". Parses ATX headings
 * (skipping fenced code blocks), builds GitHub-compatible anchor slugs, and
 * renders a nested markdown list. Kept side-effect free for unit testing.
 */

export interface Heading {
  level: number
  /** Display text, with inline markdown stripped. */
  text: string
  /** GitHub-style anchor slug (deduped across the whole document). */
  slug: string
}

export interface TocOptions {
  /** Deepest heading level to include (default 3). */
  maxLevel?: number
  /** Shallowest heading level to include (default 1). */
  minLevel?: number
}

export const TOC_START = '<!-- toc -->'
export const TOC_END = '<!-- /toc -->'

const FENCE_RE = /^\s*(`{3,}|~{3,})/
const ATX_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/

/** Removes the inline markdown that anchors and clean labels shouldn't carry. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [label](url) → label
    // Strip code/emphasis/strikethrough markers, but keep underscores: GitHub
    // preserves intraword `_` in anchors (snake_case, new_here).
    .replace(/[`*~]/g, '')
    .trim()
}

/**
 * GitHub's heading-anchor algorithm: lowercase, drop everything but letters,
 * numbers, spaces, `_` and `-`, then each whitespace → a hyphen. Spaces are
 * NOT collapsed, so a removed character between spaces yields a double hyphen
 * (e.g. "Appearance & Viewers" → `appearance--viewers`), exactly like GitHub
 * and VS Code's preview. Duplicates get a `-1`, `-2`… suffix via `used`.
 */
export function githubSlug(text: string, used: Map<string, number>): string {
  const base = stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
  const seen = used.get(base)
  if (seen === undefined) {
    used.set(base, 0)
    return base
  }
  used.set(base, seen + 1)
  return `${base}-${seen + 1}`
}

/**
 * Extracts every ATX heading (levels 1–6), in document order. Slugs are
 * computed for all headings — not just the ones a TOC will show — so the
 * dedupe suffixes match the anchors GitHub actually generates.
 */
export function extractHeadings(lines: string[]): Heading[] {
  const used = new Map<string, number>()
  const headings: Heading[] = []
  let inFence = false
  let fenceChar = ''

  for (const line of lines) {
    const fence = FENCE_RE.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceChar = fence[1][0]
      } else if (line.trimStart().startsWith(fenceChar)) {
        inFence = false
      }
      continue
    }
    if (inFence) {
      continue
    }
    const m = ATX_RE.exec(line)
    if (!m) {
      continue
    }
    const text = stripInlineMarkdown(m[2])
    if (!text) {
      continue
    }
    headings.push({ level: m[1].length, text, slug: githubSlug(m[2], used) })
  }
  return headings
}

/**
 * Renders a nested bullet-list table of contents. Indentation is relative to
 * the shallowest included heading, so a document whose headings start at H2
 * still produces a list with no leading indent.
 */
export function generateToc(lines: string[], options: TocOptions = {}): string {
  const maxLevel = options.maxLevel ?? 3
  const minLevel = options.minLevel ?? 1
  const included = extractHeadings(lines).filter(h => h.level >= minLevel && h.level <= maxLevel)
  if (included.length === 0) {
    return ''
  }
  const top = Math.min(...included.map(h => h.level))
  return included.map(h => `${'  '.repeat(h.level - top)}- [${h.text}](#${h.slug})`).join('\n')
}

/** Wraps a rendered TOC in the update-in-place marker comments. */
export function buildTocBlock(toc: string): string {
  return `${TOC_START}\n\n${toc}\n\n${TOC_END}`
}

/** Locates an existing marker-delimited TOC block, if the document has one. */
export function findTocBlock(lines: string[]): { start: number; end: number } | null {
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase()
    if (start === -1 && trimmed === TOC_START) {
      start = i
    } else if (start !== -1 && trimmed === TOC_END) {
      return { start, end: i }
    }
  }
  return null
}
