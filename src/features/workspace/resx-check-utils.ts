/**
 * Pure logic for the .resx localization checker.
 * No VS Code dependency — testable standalone.
 *
 * A "localization group" is a neutral resx (`Foo.resx`) plus its per-locale
 * satellites (`Foo.en.resx`, `Foo.ca.resx`, ...). The neutral file is the
 * source of truth: every key it declares is expected in every satellite, in
 * the same order. WinForms designer resx are intentionally partial in their
 * satellites, so groups whose neutral is a designer file are not drift-checked.
 */

/** A single <data> entry, captured as the block of lines it spans. */
export interface ResxEntry {
  name: string
  /** Text inside the first <value>…</value>, or '' when absent/self-closing. */
  value: string
  /** 0-based line of the opening `<data …>`. */
  startLine: number
  /** 0-based line of the closing `</data>` (or the same line when one-liner). */
  endLine: number
  /** The exact source lines for this entry, verbatim (for lossless reorder). */
  rawLines: string[]
  /** Designer/binary entry: carries a type/mimetype or a `>>` metadata name. */
  designer: boolean
}

const DATA_OPEN_RE = /<data\b[^>]*\bname\s*=\s*"([^"]*)"/i
const VALUE_RE = /<value>([\s\S]*?)<\/value>/i
const TYPE_OR_MIME_RE = /\b(?:type|mimetype)\s*=/i

/**
 * Parse a resx document into its <data> entries, line by line.
 *
 * Handles both the compact one-liner form used by web/Blazor projects
 *   `<data name="X" xml:space="preserve"><value>v</value></data>`
 * and the multi-line standard form emitted by Visual Studio.
 */
export function parseResx(text: string): ResxEntry[] {
  const lines = text.split(/\r?\n/)
  const entries: ResxEntry[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = DATA_OPEN_RE.exec(lines[i])
    if (!open) {
      continue
    }
    const startLine = i
    // A `<data .../>` self-closing tag or a line already containing </data>
    // is a one-liner; otherwise scan forward to the closing tag.
    let endLine = i
    if (!/\/>\s*$/.test(lines[i]) && !/<\/data>/i.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        endLine = j
        if (/<\/data>/i.test(lines[j])) {
          break
        }
      }
    }
    const rawLines = lines.slice(startLine, endLine + 1)
    const block = rawLines.join('\n')
    const valueMatch = VALUE_RE.exec(block)
    const name = open[1]
    entries.push({
      name,
      value: valueMatch ? valueMatch[1] : '',
      startLine,
      endLine,
      rawLines,
      designer: TYPE_OR_MIME_RE.test(rawLines[0]) || name.startsWith('>>')
    })
    i = endLine
  }
  return entries
}

/** Translatable string entries only — the ones drift checks care about. */
export function stringEntries(entries: ResxEntry[]): ResxEntry[] {
  return entries.filter(e => !e.designer)
}

/** Escape text destined for an XML text node (resx <value> content). */
export function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape text destined for an XML attribute value (e.g. a `name="…"`). */
export function escapeXmlAttr(text: string): string {
  return escapeXmlText(text).replace(/"/g, '&quot;')
}

/** Decode the XML entities that appear in resx values, for display/editing. */
export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Locate the character offsets of the inner text of a key's first
 * `<value>…</value>`, so an editor can replace just the value. Returns null
 * when the key is absent or carries no <value> (e.g. designer/self-closing).
 */
export function findValueOffsets(text: string, key: string): { start: number; end: number } | null {
  const dataRe = new RegExp(`<data\\b[^>]*\\bname="${escapeRegExp(key)}"[^>]*>([\\s\\S]*?)</data>`, 'i')
  const dataMatch = dataRe.exec(text)
  if (!dataMatch) {
    return null
  }
  const body = dataMatch[1]
  const valueMatch = /<value>([\s\S]*?)<\/value>/i.exec(body)
  if (!valueMatch) {
    return null
  }
  const bodyStart = dataMatch.index + dataMatch[0].indexOf(body)
  const innerStart = bodyStart + valueMatch.index + '<value>'.length
  return { start: innerStart, end: innerStart + valueMatch[1].length }
}

/**
 * A resx is "designer style" (WinForms forms, images, typed objects) when it
 * carries designer/binary entries or a <metadata> block. Such files have
 * intentionally partial satellites, so we skip missing-key drift for them.
 */
export function isDesignerResx(text: string): boolean {
  if (/<metadata\b/i.test(text)) {
    return true
  }
  return parseResx(text).some(e => e.designer)
}

// A locale segment: 2–3 letter language, optional script/region suffixes.
// Lowercase language keeps real keys like `Validations` from being mistaken
// for a locale, while still matching `en`, `ca`, `es-ES`, `zh-Hans`, `pt-BR`.
const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/

export interface ResxName {
  /** Base name shared by the whole group (no locale, no extension). */
  base: string
  /** The locale, or null for the neutral file. */
  locale: string | null
}

/**
 * Split a resx file name into its base and locale.
 *   `List.resx`        → { base: 'List',        locale: null }
 *   `List.en.resx`     → { base: 'List',        locale: 'en' }
 *   `A.B.es-ES.resx`   → { base: 'A.B',         locale: 'es-ES' }
 * Returns null when the name is not a `.resx` file.
 */
export function parseResxName(fileName: string): ResxName | null {
  if (!fileName.toLowerCase().endsWith('.resx')) {
    return null
  }
  const stem = fileName.slice(0, -'.resx'.length)
  const dot = stem.lastIndexOf('.')
  if (dot > 0) {
    const maybeLocale = stem.slice(dot + 1)
    if (LOCALE_RE.test(maybeLocale)) {
      return { base: stem.slice(0, dot), locale: maybeLocale }
    }
  }
  return { base: stem, locale: null }
}

export interface ResxDiff {
  /** Keys in the neutral file but absent from the locale file. */
  missing: string[]
  /** Keys in the locale file but not declared in the neutral file. */
  orphan: string[]
  /** Keys declared more than once in the locale file. */
  duplicates: string[]
  /** True when the shared keys are in a different order than the neutral file. */
  orderDiffers: boolean
  /** Keys whose `{0}`/`{1}` placeholder set differs from the neutral value. */
  placeholderMismatch: string[]
}

function placeholderIndices(value: string): string {
  const found = new Set<string>()
  const re = /\{(\d+)(?::[^}]*)?\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    found.add(m[1])
  }
  return [...found].sort().join(',')
}

/**
 * Compare a locale file against its neutral source of truth.
 * Only string entries participate; designer entries are ignored.
 */
export function diffResx(neutralText: string, localeText: string): ResxDiff {
  const neutral = stringEntries(parseResx(neutralText))
  const locale = stringEntries(parseResx(localeText))
  const neutralKeys = neutral.map(e => e.name)
  const localeKeys = locale.map(e => e.name)
  const neutralSet = new Set(neutralKeys)
  const localeSet = new Set(localeKeys)
  const neutralValue = new Map(neutral.map(e => [e.name, e.value]))

  const missing = neutralKeys.filter(k => !localeSet.has(k))
  const orphan = localeKeys.filter(k => !neutralSet.has(k))

  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const k of localeKeys) {
    if (seen.has(k) && !duplicates.includes(k)) {
      duplicates.push(k)
    }
    seen.add(k)
  }

  // Order: compare the shared keys in each file's own sequence.
  const sharedInNeutral = neutralKeys.filter(k => localeSet.has(k))
  const sharedInLocale = localeKeys.filter(k => neutralSet.has(k))
  const orderDiffers = sharedInNeutral.join(' ') !== sharedInLocale.join(' ')

  const placeholderMismatch: string[] = []
  for (const e of locale) {
    if (neutralValue.has(e.name)) {
      if (placeholderIndices(e.value) !== placeholderIndices(neutralValue.get(e.name)!)) {
        placeholderMismatch.push(e.name)
      }
    }
  }

  return { missing, orphan, duplicates, orderDiffers, placeholderMismatch }
}

/** The format of a file's existing entries, used to add new ones in the same style. */
export interface ResxFormat {
  /** Leading indentation of an entry, e.g. '  '. */
  indent: string
  /** Whether existing string entries are written as a single line. */
  oneLine: boolean
}

export function detectFormat(text: string): ResxFormat {
  const entries = stringEntries(parseResx(text))
  const sample = entries.find(e => e.startLine === e.endLine) ?? entries[0]
  if (sample) {
    const indentMatch = /^(\s*)/.exec(sample.rawLines[0])
    return {
      indent: indentMatch ? indentMatch[1] : '  ',
      oneLine: sample.startLine === sample.endLine
    }
  }
  return { indent: '  ', oneLine: true }
}

/** Render a new, empty string entry for `key` in the given style. */
export function renderEmptyEntry(key: string, format: ResxFormat): string {
  const escaped = escapeXmlAttr(key)
  if (format.oneLine) {
    return `${format.indent}<data name="${escaped}" xml:space="preserve"><value></value></data>`
  }
  return (
    `${format.indent}<data name="${escaped}" xml:space="preserve">\n` +
    `${format.indent}  <value></value>\n` +
    `${format.indent}</data>`
  )
}

export interface ResxInsertion {
  /** 0-based line to insert before. */
  atLine: number
  /** Full text to insert (one or more entries, no trailing newline). */
  text: string
}

/**
 * Plan where to insert `missing` keys into `localeText` so the result keeps
 * the neutral file's key order. Keys sharing an anchor are grouped into one
 * insertion, in neutral order. Keys with no later anchor go before `</root>`.
 */
export function planInsertions(localeText: string, neutralKeys: string[], missing: string[]): ResxInsertion[] {
  const localeEntries = stringEntries(parseResx(localeText))
  const localeStart = new Map(localeEntries.map(e => [e.name, e.startLine]))
  const format = detectFormat(localeText)
  const lines = localeText.split(/\r?\n/)

  // Closing </root> (fallback append point) — the last line that has it.
  let rootClose = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/<\/root>/i.test(lines[i])) {
      rootClose = i
      break
    }
  }

  const neutralIndex = new Map(neutralKeys.map((k, i) => [k, i]))
  const missingSorted = [...missing].sort((a, b) => (neutralIndex.get(a) ?? 0) - (neutralIndex.get(b) ?? 0))

  // For each missing key, find the anchor line: the first key that follows it
  // in the neutral order and already exists in the locale file.
  const byAnchor = new Map<number, string[]>()
  for (const key of missingSorted) {
    const idx = neutralIndex.get(key) ?? -1
    let anchor = rootClose
    for (let j = idx + 1; j < neutralKeys.length; j++) {
      const start = localeStart.get(neutralKeys[j])
      if (start !== undefined) {
        anchor = start
        break
      }
    }
    const bucket = byAnchor.get(anchor) ?? []
    bucket.push(key)
    byAnchor.set(anchor, bucket)
  }

  return [...byAnchor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([atLine, keys]) => ({
      atLine,
      text: keys.map(k => renderEmptyEntry(k, format)).join('\n')
    }))
}

/**
 * Reorder `localeText`'s string entries to match the neutral key order, with
 * any locale-only keys kept (appended after, in their original order).
 * Designer entries and all surrounding text (header, comments, blank lines)
 * are preserved verbatim; only the run of string entries is reshuffled in
 * place. Returns the new full document text.
 */
export function reorderToNeutral(localeText: string, neutralKeys: string[]): string {
  const lines = localeText.split(/\r?\n/)
  const entries = parseResx(localeText)
  const stringOnes = entries.filter(e => !e.designer)
  if (stringOnes.length < 2) {
    return localeText
  }

  // The block of string entries spans from the first to the last; reorder only
  // within that span so designer entries outside it keep their place.
  const spanStart = stringOnes[0].startLine
  const spanEnd = stringOnes[stringOnes.length - 1].endLine

  // Any non-string lines interleaved in the span (rare) are left where the
  // reorder would otherwise drop them: we only reassemble the string entries,
  // so if a designer entry sits between strings we bail out to stay safe.
  const designerInSpan = entries.some(e => e.designer && e.startLine >= spanStart && e.endLine <= spanEnd)
  if (designerInSpan) {
    return localeText
  }

  const order = new Map(neutralKeys.map((k, i) => [k, i]))
  const sorted = [...stringOnes].sort((a, b) => {
    const ia = order.has(a.name) ? order.get(a.name)! : Number.MAX_SAFE_INTEGER
    const ib = order.has(b.name) ? order.get(b.name)! : Number.MAX_SAFE_INTEGER
    if (ia !== ib) {
      return ia - ib
    }
    return a.startLine - b.startLine
  })

  const before = lines.slice(0, spanStart)
  const after = lines.slice(spanEnd + 1)
  const body = sorted.flatMap(e => e.rawLines)
  return [...before, ...body, ...after].join('\n')
}

/** The 0-based line span of a key's entry, for deletion. Null when absent. */
export function findEntryLineRange(text: string, key: string): { startLine: number; endLine: number } | null {
  const entry = parseResx(text).find(e => e.name === key)
  return entry ? { startLine: entry.startLine, endLine: entry.endLine } : null
}

/** Rename a key in place, leaving everything else (value, attributes) untouched. */
export function renameKeyInText(text: string, oldKey: string, newKey: string): string {
  const escapedNew = escapeXmlAttr(newKey)
  const re = new RegExp(`(<data\\b[^>]*\\bname=")${escapeRegExp(oldKey)}("[^>]*>)`, 'g')
  return text.replace(re, (_match, before: string, after: string) => before + escapedNew + after)
}

/**
 * Rewrite every string entry to the canonical compact one-line form with a
 * consistent indent, preserving the value (and any `<comment>`) verbatim.
 * Designer entries, the header, comments and blank lines are left untouched.
 * Idempotent: a file already in canonical form is returned unchanged.
 */
export function normalizeResx(text: string, indent = '  '): string {
  const lines = text.split(/\r?\n/)
  const byStart = new Map(parseResx(text).map(e => [e.startLine, e]))
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const entry = byStart.get(i)
    if (!entry) {
      out.push(lines[i])
      continue
    }
    if (entry.designer) {
      out.push(...entry.rawLines)
    } else {
      const block = entry.rawLines.join('\n')
      const commentMatch = /<comment>([\s\S]*?)<\/comment>/i.exec(block)
      const comment = commentMatch ? `<comment>${commentMatch[1]}</comment>` : ''
      out.push(`${indent}<data name="${entry.name}" xml:space="preserve"><value>${entry.value}</value>${comment}</data>`)
    }
    i = entry.endLine
  }
  return out.join('\n')
}
