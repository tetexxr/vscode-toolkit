import * as path from 'node:path'

export type ImageFormat = 'markdown' | 'html'

/**
 * Formats a Date using a small subset of moment-style tokens:
 *   YYYY - 4-digit year
 *   MM   - 2-digit month (01-12)
 *   DD   - 2-digit day
 *   HH   - 2-digit hour (00-23)
 *   mm   - 2-digit minute
 *   ss   - 2-digit second
 */
export function formatTimestamp(date: Date, pattern: string): string {
  const YYYY = String(date.getFullYear()).padStart(4, '0')
  const MM = pad2(date.getMonth() + 1)
  const DD = pad2(date.getDate())
  const HH = pad2(date.getHours())
  const mm = pad2(date.getMinutes())
  const ss = pad2(date.getSeconds())

  return pattern
    .replace(/YYYY/g, YYYY)
    .replace(/DD/g, DD)
    .replace(/HH/g, HH)
    .replace(/MM/g, MM)
    .replace(/mm/g, mm)
    .replace(/ss/g, ss)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Returns the absolute target path, ensuring no collision with `existingPaths`.
 * If a collision is detected, appends "-1", "-2", ... before the extension.
 */
export function resolveTargetPath(
  baseDirectory: string,
  filename: string,
  existingPaths: ReadonlySet<string>
): string {
  const ext = path.extname(filename)
  const stem = filename.slice(0, filename.length - ext.length)
  let candidate = path.join(baseDirectory, filename)
  let suffix = 1
  while (existingPaths.has(candidate)) {
    candidate = path.join(baseDirectory, `${stem}-${suffix}${ext}`)
    suffix++
  }
  return candidate
}

/**
 * Returns the path to embed in the document — relative to `fromFile`'s directory
 * by default, with forward slashes when `useForwardSlashes` is set.
 */
export function relativizePath(fromFile: string, toImage: string, useForwardSlashes = true): string {
  const fromDir = path.dirname(fromFile)
  const rel = path.relative(fromDir, toImage)
  return useForwardSlashes ? rel.split(path.sep).join('/') : rel
}

/**
 * Picks the embed format based on the active file's name and the configured
 * format. `configFormat` of 'auto' uses the extension to decide.
 */
export function detectFormat(
  activeFileName: string | undefined,
  configFormat: 'auto' | 'markdown' | 'html'
): ImageFormat {
  if (configFormat !== 'auto') {
    return configFormat
  }
  if (!activeFileName) {
    return 'markdown'
  }
  const lower = activeFileName.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.razor') || lower.endsWith('.cshtml')) {
    return 'html'
  }
  return 'markdown'
}

export interface RenderOptions {
  alt?: string
  htmlAttributes?: string
}

export function renderLink(format: ImageFormat, relativePath: string, options: RenderOptions = {}): string {
  const alt = options.alt ?? ''
  if (format === 'markdown') {
    return `![${alt}](${relativePath})`
  }
  const extra = options.htmlAttributes?.trim()
  const attrSuffix = extra ? ` ${extra}` : ''
  return `<img src="${escapeHtmlAttr(relativePath)}" alt="${escapeHtmlAttr(alt)}"${attrSuffix} />`
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Removes characters that are unsafe for filenames on the major platforms.
 * Lossy by design — used to derive a filename from a user prompt.
 */
export function sanitizeFilename(input: string): string {
  return input
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
    .replace(/\.+$/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
}
