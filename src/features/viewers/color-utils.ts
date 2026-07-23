/**
 * Pure color parsing and conversion for the color decorators feature.
 * vscode-free so it can be unit-tested under mocha. Channels r/g/b are 0–255,
 * alpha is 0–1.
 */

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])'
const RGB = 'rgba?\\(\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*(?:,\\s*[\\d.]+\\s*)?\\)'
const HSL = 'hsla?\\(\\s*[\\d.]+\\s*,\\s*[\\d.]+%\\s*,\\s*[\\d.]+%\\s*(?:,\\s*[\\d.]+\\s*)?\\)'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function parseHex(token: string): Rgba | null {
  let hex = token.slice(1)
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map(c => c + c)
      .join('')
  }
  if (hex.length !== 6 && hex.length !== 8) {
    return null
  }
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
  return { r, g, b, a }
}

function parseNumbers(token: string): number[] {
  const inner = token.slice(token.indexOf('(') + 1, token.lastIndexOf(')'))
  return inner.split(',').map(part => parseFloat(part.trim()))
}

function parseRgb(token: string): Rgba | null {
  const parts = parseNumbers(token)
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) {
    return null
  }
  return {
    r: clamp(parts[0], 0, 255),
    g: clamp(parts[1], 0, 255),
    b: clamp(parts[2], 0, 255),
    a: parts.length >= 4 ? clamp(parts[3], 0, 1) : 1
  }
}

function parseHslToken(token: string): Rgba | null {
  const inner = token.slice(token.indexOf('(') + 1, token.lastIndexOf(')'))
  const parts = inner.split(',').map(part => parseFloat(part.trim()))
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) {
    return null
  }
  const a = parts.length >= 4 ? clamp(parts[3], 0, 1) : 1
  return hslToRgb(parts[0], parts[1], parts[2], a)
}

/** Parses a single color token (hex / rgb(a) / hsl(a)) into an Rgba, or null. */
export function parseColor(token: string): Rgba | null {
  const trimmed = token.trim()
  if (trimmed.startsWith('#')) {
    return parseHex(trimmed)
  }
  if (/^rgba?\(/i.test(trimmed)) {
    return parseRgb(trimmed)
  }
  if (/^hsla?\(/i.test(trimmed)) {
    return parseHslToken(trimmed)
  }
  return null
}

export interface FoundColor {
  start: number
  end: number
  color: Rgba
}

export function findColors(text: string): FoundColor[] {
  const regex = new RegExp(`${HEX}|${RGB}|${HSL}`, 'gi')
  const found: FoundColor[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const color = parseColor(match[0])
    if (color) {
      found.push({ start: match.index, end: match.index + match[0].length, color })
    }
  }
  return found
}

function hexByte(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
}

/** `#rrggbb`, or `#rrggbbaa` when the color has alpha below 1. */
export function toHex({ r, g, b, a }: Rgba): string {
  const base = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
  return a < 1 ? `${base}${hexByte(a * 255)}` : base
}

/** `rgb(r, g, b)`, or `rgba(r, g, b, a)` when the color has alpha below 1. */
export function toRgbString({ r, g, b, a }: Rgba): string {
  const rr = Math.round(r)
  const gg = Math.round(g)
  const bb = Math.round(b)
  return a < 1 ? `rgba(${rr}, ${gg}, ${bb}, ${round(a, 2)})` : `rgb(${rr}, ${gg}, ${bb})`
}

/** `hsl(h, s%, l%)`, or `hsla(h, s%, l%, a)` when the color has alpha below 1. */
export function toHslString(rgba: Rgba): string {
  const { h, s, l } = rgbToHsl(rgba)
  return rgba.a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${round(rgba.a, 2)})` : `hsl(${h}, ${s}%, ${l}%)`
}

export interface Hsl {
  h: number
  s: number
  l: number
}

/** RGB → HSL. h is 0–360, s and l are 0–100 (rounded). */
export function rgbToHsl({ r, g, b }: Rgba): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) {
    tt += 1
  }
  if (tt > 1) {
    tt -= 1
  }
  if (tt < 1 / 6) {
    return p + (q - p) * 6 * tt
  }
  if (tt < 1 / 2) {
    return q
  }
  if (tt < 2 / 3) {
    return p + (q - p) * (2 / 3 - tt) * 6
  }
  return p
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl'

export function formatColor(rgba: Rgba, format: ColorFormat): string {
  switch (format) {
    case 'rgb':
      return toRgbString(rgba)
    case 'hsl':
      return toHslString(rgba)
    default:
      return toHex(rgba)
  }
}

/** HSL → RGB. h is 0–360, s and l are 0–100; alpha passes through. */
export function hslToRgb(h: number, s: number, l: number, a = 1): Rgba {
  const hn = (((h % 360) + 360) % 360) / 360
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  if (sn === 0) {
    const v = ln * 255
    return { r: v, g: v, b: v, a }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  return {
    r: hue2rgb(p, q, hn + 1 / 3) * 255,
    g: hue2rgb(p, q, hn) * 255,
    b: hue2rgb(p, q, hn - 1 / 3) * 255,
    a
  }
}
