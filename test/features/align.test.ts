import { strict as assert } from 'assert'
import { alignLines, resolveSpacing } from '../../src/features/align-utils'

describe('alignLines', () => {
  it('aligns assignment statements by =', () => {
    const input = ['const FOO_BAR = 1;', 'const SHORT = 2;', 'const LONG_NAME = 3;']
    const expected = ['const FOO_BAR   = 1;', 'const SHORT     = 2;', 'const LONG_NAME = 3;']
    assert.deepEqual(alignLines(input, '='), expected)
  })

  it('preserves leading indentation', () => {
    const input = ['  foo = 1;', '    bar = 2;', '  longer = 3;']
    const aligned = alignLines(input, '=')
    // Trimmed prefixes: "  foo" (5), "    bar" (7), "  longer" (8). Max 8, +1 space = col 9.
    assert.deepEqual(aligned, ['  foo    = 1;', '    bar  = 2;', '  longer = 3;'])
  })

  it('leaves lines without the delimiter untouched', () => {
    const input = ['foo = 1', '// just a comment', 'longer = 2']
    const aligned = alignLines(input, '=')
    assert.equal(aligned[1], '// just a comment')
    assert.equal(aligned[0], 'foo    = 1')
    assert.equal(aligned[2], 'longer = 2')
  })

  it('returns input unchanged when fewer than two lines contain the delimiter', () => {
    const input = ['foo = 1', 'no delimiter here']
    assert.deepEqual(alignLines(input, '='), input)
  })

  it('aligns by multi-character delimiters', () => {
    const input = ['x => 1', 'longerName => 2']
    const aligned = alignLines(input, '=>')
    assert.deepEqual(aligned, ['x          => 1', 'longerName => 2'])
  })

  it('aligns line comments at the end of code lines', () => {
    const input = ['foo() // do foo', 'doSomethingLonger() // do it']
    const aligned = alignLines(input, '//')
    assert.deepEqual(aligned, ['foo()               // do foo', 'doSomethingLonger() // do it'])
  })

  it('aligns by colon with no space before by default', () => {
    const input = ['name: string', 'longField: number']
    const aligned = alignLines(input, ':', { spacesBefore: 0, spacesAfter: 1 })
    // Max trimmed prefix = "longField" (9). For "name" (4): padding = 9-4+0 = 5.
    assert.deepEqual(aligned, ['name     : string', 'longField: number'])
  })

  it('trims leading whitespace from suffix', () => {
    const input = ['a =    1', 'longer =   2']
    const aligned = alignLines(input, '=')
    assert.deepEqual(aligned, ['a      = 1', 'longer = 2'])
  })

  it('does not add trailing space when suffix is empty', () => {
    const input = ['short =', 'longerOne =']
    const aligned = alignLines(input, '=')
    assert.deepEqual(aligned, ['short     =', 'longerOne ='])
  })

  it('honors custom spacesBefore and spacesAfter', () => {
    const input = ['foo=1', 'bar=2', 'longer=3']
    const aligned = alignLines(input, '=', { spacesBefore: 2, spacesAfter: 3 })
    // Max trimmed prefix = "longer" (6). spacesBefore = 2.
    // foo (3): padding 6-3+2 = 5. bar (3): 5. longer (6): 2.
    assert.deepEqual(aligned, ['foo     =   1', 'bar     =   2', 'longer  =   3'])
  })

  it('aligns by first occurrence even if delimiter appears multiple times', () => {
    const input = ['a = b = 1', 'longer = c = 2']
    const aligned = alignLines(input, '=')
    assert.deepEqual(aligned, ['a      = b = 1', 'longer = c = 2'])
  })

  it('does nothing when the delimiter is an empty string', () => {
    const input = ['a = 1', 'b = 2']
    assert.deepEqual(alignLines(input, ''), input)
  })

  it('handles single-line input', () => {
    assert.deepEqual(alignLines(['foo = 1'], '='), ['foo = 1'])
  })

  it('handles empty input', () => {
    assert.deepEqual(alignLines([], '='), [])
  })

  it('does not mutate the input array', () => {
    const input = ['foo = 1', 'longer = 2']
    const copy = [...input]
    alignLines(input, '=')
    assert.deepEqual(input, copy)
  })

  it('uses tab-aware trimming for the prefix', () => {
    const input = ['foo\t= 1', 'longer = 2']
    const aligned = alignLines(input, '=')
    assert.deepEqual(aligned, ['foo    = 1', 'longer = 2'])
  })
})

describe('resolveSpacing', () => {
  it('returns the per-delimiter value when present', () => {
    assert.equal(resolveSpacing({ default: 1, ':': 0 }, ':', 99), 0)
  })

  it('falls back to "default" when the delimiter is not in the map', () => {
    assert.equal(resolveSpacing({ default: 2 }, '=', 99), 2)
  })

  it('falls back to the hard-coded value when neither delimiter nor default exists', () => {
    assert.equal(resolveSpacing({}, '=', 7), 7)
  })

  it('falls back when the map is undefined', () => {
    assert.equal(resolveSpacing(undefined, '=', 3), 3)
  })

  it('ignores invalid (non-number or negative) entries', () => {
    assert.equal(resolveSpacing({ '=': -1 as unknown as number, default: 1 }, '=', 99), 1)
  })

  it('accepts zero as a valid value', () => {
    assert.equal(resolveSpacing({ ':': 0 }, ':', 99), 0)
  })
})
