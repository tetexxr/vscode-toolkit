import { strict as assert } from 'assert'
import {
  formatBase,
  groupBinary,
  isHoverWorthy,
  parseNumber,
  type ParsedNumber
} from '../../src/features/number-base-utils'

describe('parseNumber', () => {
  it('should parse decimal literals', () => {
    assert.deepEqual(parseNumber('255'), { value: 255n, base: 'dec', prefixed: false })
  })

  it('should parse hex, binary and octal with their prefixes', () => {
    assert.deepEqual(parseNumber('0xFF'), { value: 255n, base: 'hex', prefixed: true })
    assert.deepEqual(parseNumber('0b1010'), { value: 10n, base: 'bin', prefixed: true })
    assert.deepEqual(parseNumber('0o17'), { value: 15n, base: 'oct', prefixed: true })
  })

  it('should keep full precision for 64-bit values', () => {
    const parsed = parseNumber('18446744073709551615')
    assert.equal(parsed?.value, 18446744073709551615n)
  })

  it('should trim surrounding whitespace', () => {
    assert.equal(parseNumber('  42 ')?.value, 42n)
  })

  it('should return null for non-numbers', () => {
    assert.equal(parseNumber('hello'), null)
    assert.equal(parseNumber('0xZZ'), null)
    assert.equal(parseNumber('0b12'), null)
    assert.equal(parseNumber(''), null)
  })
})

describe('formatBase', () => {
  it('should format into each base with the conventional prefix', () => {
    assert.equal(formatBase(255n, 'dec'), '255')
    assert.equal(formatBase(255n, 'hex'), '0xff')
    assert.equal(formatBase(255n, 'bin'), '0b11111111')
    assert.equal(formatBase(255n, 'oct'), '0o377')
  })
})

describe('isHoverWorthy', () => {
  const prefixed = (base: ParsedNumber['base']): ParsedNumber => ({ value: 1n, base, prefixed: true })

  it('should always show for prefixed literals', () => {
    assert.equal(isHoverWorthy(prefixed('hex'), 3), true)
  })

  it('should require the minimum digit count for bare decimals', () => {
    assert.equal(isHoverWorthy({ value: 5n, base: 'dec', prefixed: false }, 3), false)
    assert.equal(isHoverWorthy({ value: 255n, base: 'dec', prefixed: false }, 3), true)
  })
})

describe('groupBinary', () => {
  it('should pad and group into nibbles', () => {
    assert.equal(groupBinary('1010'), '1010')
    assert.equal(groupBinary('11111111'), '1111 1111')
    assert.equal(groupBinary('101'), '0101')
  })
})
