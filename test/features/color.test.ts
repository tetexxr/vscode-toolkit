import { strict as assert } from 'assert'
import {
  findColors,
  hslToRgb,
  parseColor,
  rgbToHsl,
  toHex,
  toHslString,
  toRgbString
} from '../../src/features/color-utils'

describe('parseColor — hex', () => {
  it('should parse 6-digit hex', () => {
    assert.deepEqual(parseColor('#3498db'), { r: 52, g: 152, b: 219, a: 1 })
  })

  it('should expand 3-digit shorthand', () => {
    assert.deepEqual(parseColor('#abc'), { r: 170, g: 187, b: 204, a: 1 })
  })

  it('should parse 8-digit hex with alpha', () => {
    const c = parseColor('#ff000080')
    assert.equal(c?.r, 255)
    assert.equal(c?.g, 0)
    assert.equal(c?.b, 0)
    assert.ok(Math.abs((c?.a ?? 0) - 128 / 255) < 1e-9)
  })

  it('should expand 4-digit shorthand with alpha', () => {
    const c = parseColor('#f00f')
    assert.deepEqual({ r: c?.r, g: c?.g, b: c?.b, a: c?.a }, { r: 255, g: 0, b: 0, a: 1 })
  })
})

describe('parseColor — rgb / hsl', () => {
  it('should parse rgb()', () => {
    assert.deepEqual(parseColor('rgb(52, 152, 219)'), { r: 52, g: 152, b: 219, a: 1 })
  })

  it('should parse rgba() with alpha', () => {
    assert.deepEqual(parseColor('rgba(255, 0, 0, 0.5)'), { r: 255, g: 0, b: 0, a: 0.5 })
  })

  it('should parse hsl() back to rgb', () => {
    assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 })
  })

  it('should return null for non-colors', () => {
    assert.equal(parseColor('hello'), null)
    assert.equal(parseColor('#12'), null)
  })
})

describe('rgbToHsl', () => {
  it('should convert primary red', () => {
    assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 0, a: 1 }), { h: 0, s: 100, l: 50 })
  })

  it('should convert white and black to zero saturation', () => {
    assert.deepEqual(rgbToHsl({ r: 255, g: 255, b: 255, a: 1 }), { h: 0, s: 0, l: 100 })
    assert.deepEqual(rgbToHsl({ r: 0, g: 0, b: 0, a: 1 }), { h: 0, s: 0, l: 0 })
  })
})

describe('hslToRgb', () => {
  it('should round-trip primary colors', () => {
    assert.deepEqual(hslToRgb(0, 100, 50), { r: 255, g: 0, b: 0, a: 1 })
    assert.deepEqual(hslToRgb(120, 100, 50), { r: 0, g: 255, b: 0, a: 1 })
    assert.deepEqual(hslToRgb(240, 100, 50), { r: 0, g: 0, b: 255, a: 1 })
  })

  it('should carry alpha through', () => {
    assert.equal(hslToRgb(0, 100, 50, 0.3).a, 0.3)
  })
})

describe('formatting', () => {
  it('should format hex without alpha and with alpha', () => {
    assert.equal(toHex({ r: 52, g: 152, b: 219, a: 1 }), '#3498db')
    assert.equal(toHex({ r: 255, g: 0, b: 0, a: 0.5 }), '#ff000080')
  })

  it('should format rgb and rgba', () => {
    assert.equal(toRgbString({ r: 52, g: 152, b: 219, a: 1 }), 'rgb(52, 152, 219)')
    assert.equal(toRgbString({ r: 255, g: 0, b: 0, a: 0.5 }), 'rgba(255, 0, 0, 0.5)')
  })

  it('should format hsl and hsla', () => {
    assert.equal(toHslString({ r: 255, g: 0, b: 0, a: 1 }), 'hsl(0, 100%, 50%)')
    assert.equal(toHslString({ r: 255, g: 0, b: 0, a: 0.5 }), 'hsla(0, 100%, 50%, 0.5)')
  })
})

describe('findColors', () => {
  it('should locate multiple colors with their offsets', () => {
    const text = 'const a = "#fff"; const b = "rgb(0,0,0)"'
    const found = findColors(text)
    assert.equal(found.length, 2)
    assert.equal(text.slice(found[0].start, found[0].end), '#fff')
    assert.equal(text.slice(found[1].start, found[1].end), 'rgb(0,0,0)')
  })

  it('should not match hex runs longer than 8 digits', () => {
    assert.deepEqual(findColors('#0123456789abcdef'), [])
  })

  it('should find hsl literals', () => {
    const found = findColors('color: hsla(210, 50%, 40%, 0.8)')
    assert.equal(found.length, 1)
  })
})
