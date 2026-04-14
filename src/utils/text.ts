/**
 * Shared text utilities for case conversion and slug generation.
 * Zero external dependencies — all transformations are pure functions.
 */

/**
 * Splits text into words by detecting boundaries:
 * - camelCase transitions (lowercase→uppercase, e.g. "helloWorld" → ["hello", "World"])
 * - Consecutive uppercase runs (e.g. "HTMLParser" → ["HTML", "Parser"])
 * - Non-alphanumeric delimiters (_, -, ., /, spaces, etc.)
 */
export function splitWords(input: string): string[] {
  // Insert a separator before uppercase letters that follow lowercase or digits
  // and before the last uppercase in a consecutive run followed by lowercase
  const result = input.replace(/([a-z\d])([A-Z])/g, '$1\0$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1\0$2')

  return result.split(/[\0\s_\-./\\]+/).filter(w => w.length > 0)
}

// ── Case converters ──────────────────────────────────────────────

export function toCamelCase(input: string): string {
  const words = splitWords(input)
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
}

export function toSnakeCase(input: string): string {
  return splitWords(input)
    .map(w => w.toLowerCase())
    .join('_')
}

export function toPascalCase(input: string): string {
  return splitWords(input)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

export function toConstantCase(input: string): string {
  return splitWords(input)
    .map(w => w.toUpperCase())
    .join('_')
}

export function toKebabCase(input: string): string {
  return splitWords(input)
    .map(w => w.toLowerCase())
    .join('-')
}

export function toTitleCase(input: string): string {
  return splitWords(input)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function toLowerCase(input: string): string {
  return input.toLowerCase()
}

export function toUpperCase(input: string): string {
  return input.toUpperCase()
}

export function toDotCase(input: string): string {
  return splitWords(input)
    .map(w => w.toLowerCase())
    .join('.')
}

export function toPathCase(input: string): string {
  return splitWords(input)
    .map(w => w.toLowerCase())
    .join('/')
}

export function toSentenceCase(input: string): string {
  const words = splitWords(input).map(w => w.toLowerCase())
  if (words.length === 0) {
    return ''
  }
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  return words.join(' ')
}

export function toSwapCase(input: string): string {
  return input
    .split('')
    .map(c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
    .join('')
}

export function toNoCase(input: string): string {
  return splitWords(input)
    .map(w => w.toLowerCase())
    .join(' ')
}

// ── Slug ─────────────────────────────────────────────────────────

/** Common unicode character replacements (subset of sindresorhus/slugify). */
const CHAR_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  å: 'a',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ñ: 'n',
  ç: 'c',
  ð: 'd',
  ý: 'y',
  ÿ: 'y',
  þ: 'th',
  ş: 's',
  ğ: 'g',
  ı: 'i',
  ș: 's',
  ț: 't',
  '&': ' and ',
  '@': ' at ',
  '#': ' number '
}

export interface SlugOptions {
  separator?: string
  decamelize?: boolean
  lowercase?: boolean
}

export function toSlug(input: string, options: SlugOptions = {}): string {
  const { separator = '-', decamelize = true, lowercase = true } = options

  let result = input

  // Apply character map replacements
  result = result.replace(/./g, c => CHAR_MAP[c] || c)

  // Normalize unicode and strip combining diacritical marks
  result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Decamelize: split camelCase into separate words
  if (decamelize) {
    result = result.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1 $2')
  }

  // Lowercase
  if (lowercase) {
    result = result.toLowerCase()
  }

  // Replace non-alphanumeric characters with separator
  const pattern = lowercase ? /[^a-z\d]+/g : /[^a-zA-Z\d]+/g
  result = result.replace(pattern, separator)

  // Collapse consecutive separators
  const escapedSep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  result = result.replace(new RegExp(`${escapedSep}{2,}`, 'g'), separator)

  // Trim leading/trailing separator
  result = result.replace(new RegExp(`^${escapedSep}|${escapedSep}$`, 'g'), '')

  return result
}
