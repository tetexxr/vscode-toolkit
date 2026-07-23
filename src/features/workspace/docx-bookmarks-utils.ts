import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'

/**
 * Word bookmark analysis for .docx templates.
 *
 * A .docx is a ZIP whose text lives in XML parts (`word/document.xml`, plus
 * `word/headerN.xml` / `word/footerN.xml`). A bookmark is a
 * `<w:bookmarkStart w:id w:name/>` … `<w:bookmarkEnd w:id/>` pair; the text it
 * wraps is a sequence of runs (`<w:r>…<w:t>…</w:t></w:r>`).
 *
 * Templates that get populated by replacing a bookmark's *first* run only work
 * when the whole placeholder sits in a single run. Word happily splits a word
 * across several runs (different rsid, autocorrect, edits between saves), which
 * leaves the tail runs untouched at export time — e.g. "Trainer" + "s" +
 * "FullName". This module finds that (and a few other defects) and can
 * consolidate a split bookmark back into one run, preserving its formatting.
 *
 * Everything here is pure (no vscode); the ZIP layer uses fflate. Only the XML
 * container is handled by a dependency — the content is manipulated with
 * regex, matching the rest of the toolkit's zero-dependency XML handling.
 */

/** XML parts of a .docx that can contain bookmarks. */
const WORD_XML_PART = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/

export type BookmarkIssueKind =
  | 'split-runs'
  | 'orphan-start'
  | 'orphan-end'
  | 'duplicate-name'
  | 'name-too-long'

/** Word's maximum bookmark name length; the exporter truncates past this. */
export const MAX_BOOKMARK_NAME_LENGTH = 40

export interface BookmarkIssue {
  kind: BookmarkIssueKind
  name: string
  /** The XML part the issue was found in, e.g. `word/document.xml`. */
  part: string
  detail: string
  /** Whether `fixXmlPart` / `fixDocx` will resolve this issue automatically. */
  fixable: boolean
}

export interface BookmarkInfo {
  name: string
  id: string
  part: string
  /** Number of runs holding text inside the bookmark. */
  runCount: number
  /** Concatenated (still XML-escaped) text of the bookmark. */
  text: string
}

export interface PartAnalysis {
  bookmarks: BookmarkInfo[]
  issues: BookmarkIssue[]
}

export interface DocxAnalysis {
  bookmarks: BookmarkInfo[]
  issues: BookmarkIssue[]
}

interface StartTag {
  id: string
  name: string
  /** Index just after the closing `/>` of the bookmarkStart tag. */
  contentStart: number
  /** Index of the `<` opening the bookmarkStart tag. */
  tagStart: number
}

interface EndTag {
  id: string
  /** Index of the `<` opening the bookmarkEnd tag. */
  index: number
}

/**
 * Word's own structural bookmarks (`_GoBack`, `_Toc…`, `_Ref…`, `_Hlk…`, and
 * anything leading with `_`) are not template placeholders — skip them so the
 * report only surfaces bookmarks the author actually manages.
 */
export function isInternalBookmark(name: string): boolean {
  return name.startsWith('_')
}

export function isWordXmlPart(name: string): boolean {
  return WORD_XML_PART.test(name)
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return match ? match[1] : null
}

/** Runs holding a `<w:t>` inside a region, in document order. */
function textRuns(region: string): string[] {
  const runs = region.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? []
  return runs.filter(run => /<w:t[\s>]/.test(run))
}

function regionText(region: string): string {
  let text = ''
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(region)) !== null) {
    text += match[1]
  }
  return text
}

/**
 * A run is "simple text" when its only content is `<w:t>` — no breaks, tabs,
 * fields, drawings, etc. Consolidation only merges simple-text runs so it can
 * never destroy a line break, image or field inside a bookmark.
 */
function isSimpleTextRun(run: string): boolean {
  return !/<w:(br|tab|drawing|object|pict|fldChar|instrText|noBreakHyphen|sym)\b/.test(run)
}

function parseStarts(xml: string): StartTag[] {
  const starts: StartTag[] = []
  const re = /<w:bookmarkStart\b[^>]*\/>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    const id = attr(match[0], 'w:id')
    const name = attr(match[0], 'w:name')
    if (id === null || name === null) {
      continue
    }
    starts.push({ id, name, tagStart: match.index, contentStart: match.index + match[0].length })
  }
  return starts
}

function parseEnds(xml: string): EndTag[] {
  const ends: EndTag[] = []
  const re = /<w:bookmarkEnd\b[^>]*\/>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    const id = attr(match[0], 'w:id')
    if (id === null) {
      continue
    }
    ends.push({ id, index: match.index })
  }
  return ends
}

/** Match each start to the nearest following end sharing its id. */
function pairStarts(starts: StartTag[], ends: EndTag[]): {
  pairs: { start: StartTag; end: EndTag }[]
  orphanStarts: StartTag[]
  orphanEnds: EndTag[]
} {
  const pairs: { start: StartTag; end: EndTag }[] = []
  const orphanStarts: StartTag[] = []
  const usedEnds = new Set<EndTag>()

  for (const start of starts) {
    const end = ends
      .filter(e => e.id === start.id && e.index >= start.contentStart && !usedEnds.has(e))
      .sort((a, b) => a.index - b.index)[0]
    if (end) {
      usedEnds.add(end)
      pairs.push({ start, end })
    } else {
      orphanStarts.push(start)
    }
  }

  const orphanEnds = ends.filter(e => !usedEnds.has(e))
  return { pairs, orphanStarts, orphanEnds }
}

export function analyzeXmlPart(xml: string, part: string): PartAnalysis {
  const { pairs, orphanStarts, orphanEnds } = pairStarts(parseStarts(xml), parseEnds(xml))
  const bookmarks: BookmarkInfo[] = []
  const issues: BookmarkIssue[] = []

  const nameCounts = new Map<string, number>()
  for (const { start } of pairs) {
    nameCounts.set(start.name, (nameCounts.get(start.name) ?? 0) + 1)
  }

  for (const { start, end } of pairs) {
    if (isInternalBookmark(start.name)) {
      continue
    }
    const region = xml.slice(start.contentStart, end.index)
    const runs = textRuns(region)
    bookmarks.push({ name: start.name, id: start.id, part, runCount: runs.length, text: regionText(region) })

    if (runs.length > 1) {
      const fixable = runs.every(isSimpleTextRun)
      issues.push({
        kind: 'split-runs',
        name: start.name,
        part,
        detail: fixable
          ? `Text is split across ${runs.length} runs; only the first would be replaced at export.`
          : `Text is split across ${runs.length} runs and contains breaks/tabs/fields — needs manual review.`,
        fixable
      })
    }

    if (start.name.length > MAX_BOOKMARK_NAME_LENGTH) {
      issues.push({
        kind: 'name-too-long',
        name: start.name,
        part,
        detail: `Name is ${start.name.length} chars; Word caps names at ${MAX_BOOKMARK_NAME_LENGTH} and the exporter truncates it.`,
        fixable: false
      })
    }
  }

  for (const [name, count] of nameCounts) {
    if (count > 1 && !isInternalBookmark(name)) {
      issues.push({
        kind: 'duplicate-name',
        name,
        part,
        detail: `Declared ${count} times; only one location will be populated.`,
        fixable: false
      })
    }
  }

  for (const start of orphanStarts) {
    if (isInternalBookmark(start.name)) {
      continue
    }
    issues.push({
      kind: 'orphan-start',
      name: start.name,
      part,
      detail: `bookmarkStart (id ${start.id}) has no matching bookmarkEnd.`,
      fixable: false
    })
  }

  for (const end of orphanEnds) {
    issues.push({
      kind: 'orphan-end',
      name: `(id ${end.id})`,
      part,
      detail: `bookmarkEnd (id ${end.id}) has no matching bookmarkStart.`,
      fixable: false
    })
  }

  return { bookmarks, issues }
}

/**
 * Rewrite a bookmark's runs into a single run, keeping the first run's
 * formatting (`<w:rPr>`) and concatenating the text of every run. Only merges
 * simple-text runs; a bookmark containing breaks/tabs/fields is left untouched.
 */
function consolidateRegion(region: string): { region: string; changed: boolean } {
  const runs = textRuns(region)
  if (runs.length <= 1 || !runs.every(isSimpleTextRun)) {
    return { region, changed: false }
  }

  const text = regionText(region)
  const firstRun = runs[0]

  const openMatch = /^<w:r\b[^>]*>/.exec(firstRun)
  const runOpen = openMatch ? openMatch[0] : '<w:r>'
  const rPrMatch = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(firstRun)
  const rPr = rPrMatch ? rPrMatch[0] : ''
  const space = /^\s|\s$/.test(strFromU8Safe(text)) ? ' xml:space="preserve"' : ''
  const newRun = `${runOpen}${rPr}<w:t${space}>${text}</w:t></w:r>`

  // Replace the first run in place, drop the remaining runs.
  let out = region.replace(firstRun, newRun)
  for (let i = 1; i < runs.length; i++) {
    out = out.replace(runs[i], '')
  }
  return { region: out, changed: true }
}

/** Detect leading/trailing whitespace on the *decoded* text. */
function strFromU8Safe(escaped: string): string {
  return escaped.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/**
 * Consolidate split-run bookmarks in one XML part. When `shouldFix` is given,
 * only bookmarks whose name it accepts are consolidated — lets the UI fix a
 * single row instead of every split bookmark in the file.
 */
export function fixXmlPart(xml: string, shouldFix?: (name: string) => boolean): { xml: string; fixed: string[] } {
  const { pairs } = pairStarts(parseStarts(xml), parseEnds(xml))
  const fixed: string[] = []

  // Process from last to first so earlier offsets stay valid as we splice.
  const ordered = [...pairs].sort((a, b) => b.start.contentStart - a.start.contentStart)
  let out = xml
  for (const { start, end } of ordered) {
    if (isInternalBookmark(start.name) || (shouldFix && !shouldFix(start.name))) {
      continue
    }
    const region = out.slice(start.contentStart, end.index)
    const result = consolidateRegion(region)
    if (result.changed) {
      out = out.slice(0, start.contentStart) + result.region + out.slice(end.index)
      fixed.push(start.name)
    }
  }

  fixed.reverse()
  return { xml: out, fixed }
}

export function analyzeDocx(buffer: Uint8Array): DocxAnalysis {
  const entries = unzipSync(buffer)
  const bookmarks: BookmarkInfo[] = []
  const issues: BookmarkIssue[] = []
  for (const name of Object.keys(entries).sort()) {
    if (!isWordXmlPart(name)) {
      continue
    }
    const analysis = analyzeXmlPart(strFromU8(entries[name]), name)
    bookmarks.push(...analysis.bookmarks)
    issues.push(...analysis.issues)
  }
  return { bookmarks, issues }
}

export interface BookmarkRow {
  /** Absolute path — used to message the extension back. */
  file: string
  /** Workspace-relative path — shown in the table. */
  relPath: string
  /** XML part, e.g. `word/document.xml`. */
  part: string
  name: string
  kind: BookmarkIssueKind | 'ok'
  detail: string
  runCount: number
  fixable: boolean
}

function isOrphan(issue: BookmarkIssue): boolean {
  return issue.kind === 'orphan-start' || issue.kind === 'orphan-end'
}

/**
 * Flatten a document analysis into table rows: one row per bookmark (carrying
 * its most relevant issue, or `ok`), plus a row per orphan marker. `split-runs`
 * takes precedence when a bookmark has several issues, since it's the fixable
 * one the UI acts on.
 */
export function analysisToRows(file: string, relPath: string, analysis: DocxAnalysis): BookmarkRow[] {
  const rows: BookmarkRow[] = []
  for (const bookmark of analysis.bookmarks) {
    const related = analysis.issues.filter(i => i.part === bookmark.part && i.name === bookmark.name && !isOrphan(i))
    const primary = related.find(i => i.kind === 'split-runs') ?? related[0]
    rows.push({
      file,
      relPath,
      part: bookmark.part,
      name: bookmark.name,
      kind: primary ? primary.kind : 'ok',
      detail: primary ? primary.detail : '',
      runCount: bookmark.runCount,
      fixable: primary ? primary.fixable : false
    })
  }
  for (const issue of analysis.issues.filter(isOrphan)) {
    rows.push({ file, relPath, part: issue.part, name: issue.name, kind: issue.kind, detail: issue.detail, runCount: 0, fixable: false })
  }
  return rows
}

export interface BookmarkTarget {
  part: string
  name: string
}

export interface DocxFixResult {
  buffer: Uint8Array
  /** Fixed bookmarks as `{ part, name }`. */
  fixed: BookmarkTarget[]
}

/**
 * Consolidate split-run bookmarks across a .docx buffer, returning a new ZIP.
 * When `targets` is given, only those `{ part, name }` bookmarks are fixed;
 * otherwise every fixable bookmark in the document is consolidated.
 */
export function fixDocx(buffer: Uint8Array, targets?: BookmarkTarget[]): DocxFixResult {
  const entries = unzipSync(buffer)
  const fixed: BookmarkTarget[] = []
  const namesByPart = targets
    ? targets.reduce((map, target) => map.set(target.part, (map.get(target.part) ?? new Set<string>()).add(target.name)), new Map<string, Set<string>>())
    : null

  for (const name of Object.keys(entries)) {
    if (!isWordXmlPart(name)) {
      continue
    }
    if (namesByPart && !namesByPart.has(name)) {
      continue
    }
    const wanted = namesByPart?.get(name)
    const result = fixXmlPart(strFromU8(entries[name]), wanted ? bookmarkName => wanted.has(bookmarkName) : undefined)
    if (result.fixed.length > 0) {
      entries[name] = strToU8(result.xml)
      for (const bookmarkName of result.fixed) {
        fixed.push({ part: name, name: bookmarkName })
      }
    }
  }
  return { buffer: zipSync(entries, { level: 6 }), fixed }
}
