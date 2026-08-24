import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'

/**
 * `{{Placeholder}}` analysis for .pptx templates.
 *
 * A .pptx is a ZIP whose text lives in DrawingML parts (`ppt/slides/slideN.xml`
 * and, less often, layouts, masters and notes). PowerPoint has no equivalent of
 * a Word bookmark, so templates mark their holes with a literal `{{Token}}` in
 * the text — deliberately a single word, `[A-Za-z0-9]+`, so a placeholder is
 * unmistakable both to the eye and to a regex.
 *
 * PowerPoint splits text across runs (`<a:r><a:t>`) as freely as Word does —
 * autocorrect, a language change, a spell-check pass — so a `{{SendDate}}`
 * typed in one go can end up stored as `{{Send` + `Date` + `}}`. An exporter
 * that joins the paragraph before substituting copes with that; one that
 * replaces run by run does not. Consolidating every placeholder into a single
 * run keeps the template working with either, which is the point of this
 * feature: the template carries the guarantee, not the exporter.
 *
 * Unlike a Word bookmark — a *range* whose useful text is unknown, so the whole
 * region has to be flattened onto the first run's formatting — the token
 * delimits itself. Only `{{Token}}` is merged; the text around it keeps its own
 * runs and formatting untouched.
 *
 * Everything here is pure (no vscode); the ZIP layer uses fflate and the XML is
 * handled with regex, matching the rest of the toolkit's XML handling.
 */

/** DrawingML parts that can hold placeholder text, and how to name them. */
const PART_KINDS = [
  { prefix: 'slides/slide', label: 'slide' },
  { prefix: 'slideLayouts/slideLayout', label: 'layout' },
  { prefix: 'slideMasters/slideMaster', label: 'master' },
  { prefix: 'notesSlides/notesSlide', label: 'notes' }
]

const PPTX_XML_PART =
  /^ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster|notesSlides\/notesSlide)(\d+)\.xml$/

/** A well-formed placeholder: `{{`, one word, `}}`. */
const TOKEN = /\{\{[A-Za-z0-9]+\}\}/g

/** Any `{{…}}` pair — used to report the ones that don't qualify as a token. */
const BRACED = /\{\{([^{}]*)\}\}/g

/** The paragraph: the unit a placeholder can never span. */
const PARAGRAPH = /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g

/** Inline children of a paragraph, in document order. */
const INLINE =
  /<a:r(?:\s[^>]*)?>[\s\S]*?<\/a:r>|<a:fld\b[^>]*>[\s\S]*?<\/a:fld>|<a:br(?:\s[^>]*)?\/>|<a:br(?:\s[^>]*)?>[\s\S]*?<\/a:br>/g

const TEXT = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/
const RUN_PROPERTIES = /<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/

/** Characters of context shown for a brace that couldn't be parsed as a token. */
const EXCERPT_LENGTH = 24

export type PlaceholderIssueKind = 'split-runs' | 'crosses-break' | 'malformed' | 'unclosed'

export interface PlaceholderIssue {
  kind: PlaceholderIssueKind
  /** Placeholder name, or the offending excerpt for `malformed` / `unclosed`. */
  name: string
  /** The XML part the issue was found in, e.g. `ppt/slides/slide9.xml`. */
  part: string
  detail: string
  /** Whether `fixXmlPart` / `fixPptx` will resolve this issue automatically. */
  fixable: boolean
}

export interface PlaceholderInfo {
  name: string
  part: string
  /** Runs the placeholder is spread over; 1 once it is consolidated. */
  runCount: number
}

export interface PartAnalysis {
  placeholders: PlaceholderInfo[]
  issues: PlaceholderIssue[]
}

export interface PptxAnalysis {
  placeholders: PlaceholderInfo[]
  issues: PlaceholderIssue[]
}

type InlineKind = 'run' | 'field' | 'break'

interface Inline {
  kind: InlineKind
  /** Still XML-escaped text this inline contributes to the paragraph. */
  text: string
  /** The inline's `<a:rPr>`, carried over when runs are rebuilt. */
  properties: string
  /** Index of the `<` opening the inline, within the paragraph. */
  start: number
  /** Index just past the inline's closing tag. */
  end: number
}

interface Span {
  name: string
  /** Index of the first/last inline the placeholder touches. */
  first: number
  last: number
  /** Offset of `{{` within the first inline's text. */
  startOffset: number
  /** Offset just past `}}` within the last inline's text. */
  endOffset: number
}

export function isPptxXmlPart(name: string): boolean {
  return PPTX_XML_PART.test(name)
}

/** Human location for the table: `ppt/slides/slide9.xml` → `slide 9`. */
export function partLabel(part: string): string {
  const match = PPTX_XML_PART.exec(part)
  if (!match) {
    return part
  }
  const kind = PART_KINDS.find(candidate => candidate.prefix === match[1])
  return kind ? `${kind.label} ${match[2]}` : part
}

/** Slides before layouts before masters before notes, and slide 2 before slide 10. */
function comparePart(a: string, b: string): number {
  const matchA = PPTX_XML_PART.exec(a)
  const matchB = PPTX_XML_PART.exec(b)
  if (!matchA || !matchB) {
    return a.localeCompare(b)
  }
  const kindA = PART_KINDS.findIndex(kind => kind.prefix === matchA[1])
  const kindB = PART_KINDS.findIndex(kind => kind.prefix === matchB[1])
  return kindA === kindB ? Number(matchA[2]) - Number(matchB[2]) : kindA - kindB
}

function inlineKind(xml: string): InlineKind {
  if (xml.startsWith('<a:br')) {
    return 'break'
  }
  return xml.startsWith('<a:fld') ? 'field' : 'run'
}

function parseInlines(paragraph: string): Inline[] {
  const inlines: Inline[] = []
  INLINE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE.exec(paragraph)) !== null) {
    const xml = match[0]
    inlines.push({
      kind: inlineKind(xml),
      text: TEXT.exec(xml)?.[1] ?? '',
      properties: RUN_PROPERTIES.exec(xml)?.[0] ?? '',
      start: match.index,
      end: match.index + xml.length
    })
  }
  return inlines
}

function paragraphText(inlines: Inline[]): string {
  return inlines.map(inline => inline.text).join('')
}

/** Which inline holds a given offset of the paragraph text. Empty inlines (breaks) are skipped. */
function locate(inlines: Inline[], position: number): { index: number; offset: number } {
  let consumed = 0
  for (let i = 0; i < inlines.length; i++) {
    const length = inlines[i].text.length
    if (position < consumed + length) {
      return { index: i, offset: position - consumed }
    }
    consumed += length
  }
  return { index: Math.max(inlines.length - 1, 0), offset: 0 }
}

function findSpans(inlines: Inline[]): Span[] {
  const joined = paragraphText(inlines)
  const spans: Span[] = []
  TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN.exec(joined)) !== null) {
    const start = locate(inlines, match.index)
    const end = locate(inlines, match.index + match[0].length - 1)
    spans.push({
      name: match[0].slice(2, -2),
      first: start.index,
      last: end.index,
      startOffset: start.offset,
      endOffset: end.offset + 1
    })
  }
  return spans
}

/** Inlines the placeholder is spread over — breaks and fields included. */
function spannedInlines(inlines: Inline[], span: Span): Inline[] {
  return inlines.slice(span.first, span.last + 1)
}

/**
 * A span can be merged when it is spread over plain runs only. A line break or
 * a field (slide number, automatic date) between the braces is reported but
 * never rewritten — merging would swallow it.
 */
function isMergeable(inlines: Inline[], span: Span): boolean {
  return span.last > span.first && spannedInlines(inlines, span).every(inline => inline.kind === 'run')
}

function excerpt(text: string, index: number): string {
  const slice = text.slice(index, index + EXCERPT_LENGTH)
  return slice.length < text.length - index ? `${slice}…` : slice
}

/** `{{…}}` pairs that aren't a single word, and braces with no counterpart. */
function braceIssues(joined: string): { malformed: string[]; unclosed: string[] } {
  const malformed: string[] = []
  BRACED.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BRACED.exec(joined)) !== null) {
    if (!/^[A-Za-z0-9]+$/.test(match[1])) {
      malformed.push(match[0])
    }
  }

  const rest = joined.replace(BRACED, '')
  const unclosed: string[] = []
  for (const marker of ['{{', '}}']) {
    let index = rest.indexOf(marker)
    while (index !== -1) {
      unclosed.push(excerpt(rest, index))
      index = rest.indexOf(marker, index + marker.length)
    }
  }
  return { malformed, unclosed }
}

export function analyzeXmlPart(xml: string, part: string): PartAnalysis {
  const placeholders: PlaceholderInfo[] = []
  const issues: PlaceholderIssue[] = []

  for (const paragraph of xml.match(PARAGRAPH) ?? []) {
    const inlines = parseInlines(paragraph)
    const joined = paragraphText(inlines)
    if (!joined.includes('{{') && !joined.includes('}}')) {
      continue
    }

    for (const span of findSpans(inlines)) {
      const spanned = spannedInlines(inlines, span)
      const runCount = spanned.filter(inline => inline.kind !== 'break').length
      placeholders.push({ name: span.name, part, runCount })

      if (span.last === span.first) {
        continue
      }
      const mergeable = isMergeable(inlines, span)
      issues.push({
        kind: mergeable ? 'split-runs' : 'crosses-break',
        name: span.name,
        part,
        detail: mergeable
          ? `Stored across ${runCount} runs; an exporter that replaces run by run would only fill the first.`
          : `Stored across ${runCount} runs with a line break or field in between — needs manual review.`,
        fixable: mergeable
      })
    }

    const braces = braceIssues(joined)
    for (const name of braces.malformed) {
      issues.push({
        kind: 'malformed',
        name,
        part,
        detail: 'Not a single-word placeholder; the exporter will not recognise it and it would be printed as is.',
        fixable: false
      })
    }
    for (const name of braces.unclosed) {
      issues.push({
        kind: 'unclosed',
        name,
        part,
        detail: 'Braces with no counterpart in the same paragraph; the exporter would leave them in the slide.',
        fixable: false
      })
    }
  }

  return { placeholders, issues }
}

export function analyzePptx(buffer: Uint8Array): PptxAnalysis {
  const entries = unzipSync(buffer)
  const placeholders: PlaceholderInfo[] = []
  const issues: PlaceholderIssue[] = []
  for (const name of Object.keys(entries).filter(isPptxXmlPart).sort(comparePart)) {
    const analysis = analyzeXmlPart(strFromU8(entries[name]), name)
    placeholders.push(...analysis.placeholders)
    issues.push(...analysis.issues)
  }
  return { placeholders, issues }
}

export interface PlaceholderRow {
  /** Absolute path — used to message the extension back. */
  file: string
  /** Workspace-relative path — shown in the table. */
  relPath: string
  /** XML part, e.g. `ppt/slides/slide9.xml`. */
  part: string
  /** The part rendered for humans, e.g. `slide 9`. */
  location: string
  name: string
  kind: PlaceholderIssueKind | 'ok'
  detail: string
  runCount: number
  /** Times the placeholder appears in this part. */
  uses: number
  fixable: boolean
}

/**
 * Flatten an analysis into table rows: one row per placeholder *per part*, so
 * a `{{Company}}` used on slides 1 and 9 is two rows and can be reviewed where
 * it lives. Repeats within the same part collapse into one row — the same Fix
 * consolidates them all — keeping the worst status and run count. Malformed
 * and unclosed braces get a row of their own, keyed by their excerpt.
 */
export function analysisToRows(file: string, relPath: string, analysis: PptxAnalysis): PlaceholderRow[] {
  const rows: PlaceholderRow[] = []
  const byPartAndName = new Map<string, PlaceholderRow>()

  for (const placeholder of analysis.placeholders) {
    const key = `${placeholder.part}|${placeholder.name}`
    const existing = byPartAndName.get(key)
    if (existing) {
      existing.uses++
      existing.runCount = Math.max(existing.runCount, placeholder.runCount)
      continue
    }
    const row: PlaceholderRow = {
      file,
      relPath,
      part: placeholder.part,
      location: partLabel(placeholder.part),
      name: placeholder.name,
      kind: 'ok',
      detail: '',
      runCount: placeholder.runCount,
      uses: 1,
      fixable: false
    }
    byPartAndName.set(key, row)
    rows.push(row)
  }

  for (const issue of analysis.issues) {
    const row = byPartAndName.get(`${issue.part}|${issue.name}`)
    if (!row) {
      rows.push({
        file,
        relPath,
        part: issue.part,
        location: partLabel(issue.part),
        name: issue.name,
        kind: issue.kind,
        detail: issue.detail,
        runCount: 0,
        uses: 1,
        fixable: issue.fixable
      })
      continue
    }
    // 'split-runs' wins over 'crosses-break': it is the one the Fix action acts on.
    if (row.kind === 'ok' || issue.kind === 'split-runs') {
      row.kind = issue.kind
      row.detail = issue.detail
      row.fixable = issue.fixable
    }
  }

  return rows
}

/**
 * `<a:t>` preserves its whitespace by default in DrawingML, so rebuilt runs
 * need no `xml:space` — this is exactly what PowerPoint writes itself.
 */
function makeRun(properties: string, text: string): string {
  return `<a:r>${properties}<a:t>${text}</a:t></a:r>`
}

/**
 * Rewrite the runs a placeholder is spread over as up to three: the text before
 * `{{`, the placeholder itself, and the text after `}}`. The placeholder takes
 * the formatting of the run it starts in; the text around it keeps its own.
 */
function mergeSpan(paragraph: string, inlines: Inline[], span: Span): string {
  const first = inlines[span.first]
  const last = inlines[span.last]
  const prefix = first.text.slice(0, span.startOffset)
  const suffix = last.text.slice(span.endOffset)
  const merged =
    (prefix ? makeRun(first.properties, prefix) : '') +
    makeRun(first.properties, `{{${span.name}}}`) +
    (suffix ? makeRun(last.properties, suffix) : '')
  return paragraph.slice(0, first.start) + merged + paragraph.slice(last.end)
}

function consolidateParagraph(
  paragraph: string,
  shouldFix?: (name: string) => boolean
): { paragraph: string; fixed: string[] } {
  const fixed: string[] = []
  let out = paragraph
  // Each merge leaves its placeholder in a single run, so the candidate list
  // shrinks by one every pass and the loop always terminates.
  for (;;) {
    const inlines = parseInlines(out)
    const span = findSpans(inlines).find(
      candidate => isMergeable(inlines, candidate) && (!shouldFix || shouldFix(candidate.name))
    )
    if (!span) {
      return { paragraph: out, fixed }
    }
    out = mergeSpan(out, inlines, span)
    fixed.push(span.name)
  }
}

/**
 * Consolidate split placeholders in one XML part. When `shouldFix` is given,
 * only placeholders whose name it accepts are merged — lets the UI fix a single
 * row instead of every split placeholder in the file.
 */
export function fixXmlPart(xml: string, shouldFix?: (name: string) => boolean): { xml: string; fixed: string[] } {
  const fixed: string[] = []
  let out = ''
  let position = 0
  PARAGRAPH.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PARAGRAPH.exec(xml)) !== null) {
    const result = consolidateParagraph(match[0], shouldFix)
    out += xml.slice(position, match.index) + result.paragraph
    position = match.index + match[0].length
    fixed.push(...result.fixed)
  }
  return { xml: out + xml.slice(position), fixed }
}

export interface PlaceholderTarget {
  part: string
  name: string
}

export interface PptxFixResult {
  buffer: Uint8Array
  /** Fixed placeholders as `{ part, name }`. */
  fixed: PlaceholderTarget[]
}

/**
 * Consolidate split placeholders across a .pptx buffer, returning a new ZIP.
 * When `targets` is given, only those `{ part, name }` placeholders are merged;
 * otherwise every fixable placeholder in the presentation is.
 */
export function fixPptx(buffer: Uint8Array, targets?: PlaceholderTarget[]): PptxFixResult {
  const entries = unzipSync(buffer)
  const fixed: PlaceholderTarget[] = []
  const namesByPart = targets
    ? targets.reduce(
        (map, target) => map.set(target.part, (map.get(target.part) ?? new Set<string>()).add(target.name)),
        new Map<string, Set<string>>()
      )
    : null

  for (const name of Object.keys(entries)) {
    if (!isPptxXmlPart(name)) {
      continue
    }
    if (namesByPart && !namesByPart.has(name)) {
      continue
    }
    const wanted = namesByPart?.get(name)
    const result = fixXmlPart(strFromU8(entries[name]), wanted ? placeholder => wanted.has(placeholder) : undefined)
    if (result.fixed.length > 0) {
      entries[name] = strToU8(result.xml)
      for (const placeholder of result.fixed) {
        fixed.push({ part: name, name: placeholder })
      }
    }
  }
  return { buffer: zipSync(entries, { level: 6 }), fixed }
}
