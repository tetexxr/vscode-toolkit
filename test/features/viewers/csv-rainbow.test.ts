import { strict as assert } from 'assert'
import { parseCsvLine, detectDelimiter } from '../../../src/features/viewers/csv-rainbow-utils'

describe('parseCsvLine', () => {
  it('should split a simple comma-separated line', () => {
    const fields = parseCsvLine('a,b,c', ',')
    assert.deepEqual(
      fields.map(f => [f.start, f.end]),
      [
        [0, 1],
        [2, 3],
        [4, 5]
      ]
    )
  })

  it('should produce indices in order', () => {
    const fields = parseCsvLine('a,b,c', ',')
    assert.deepEqual(
      fields.map(f => f.index),
      [0, 1, 2]
    )
  })

  it('should handle empty fields', () => {
    const fields = parseCsvLine('a,,c', ',')
    assert.deepEqual(
      fields.map(f => [f.start, f.end]),
      [
        [0, 1],
        [2, 2],
        [3, 4]
      ]
    )
  })

  it('should treat a trailing delimiter as an empty last field', () => {
    const fields = parseCsvLine('a,b,', ',')
    assert.equal(fields.length, 3)
    assert.deepEqual(
      [fields[2].start, fields[2].end],
      [4, 4]
    )
  })

  it('should not split inside quoted fields', () => {
    const fields = parseCsvLine('"a,b",c', ',')
    assert.deepEqual(
      fields.map(f => [f.start, f.end]),
      [
        [0, 5],
        [6, 7]
      ]
    )
  })

  it('should handle escaped double quotes inside quoted fields', () => {
    const fields = parseCsvLine('"a""b","c"', ',')
    assert.deepEqual(
      fields.map(f => [f.start, f.end]),
      [
        [0, 6],
        [7, 10]
      ]
    )
  })

  it('should treat a quote that does not start a field as a literal character', () => {
    const fields = parseCsvLine('a"b,c', ',')
    assert.deepEqual(
      fields.map(f => [f.start, f.end]),
      [
        [0, 3],
        [4, 5]
      ]
    )
  })

  it('should support tab as delimiter', () => {
    const fields = parseCsvLine('a\tb\tc', '\t')
    assert.equal(fields.length, 3)
  })

  it('should support semicolon as delimiter', () => {
    const fields = parseCsvLine('a;b;c', ';')
    assert.equal(fields.length, 3)
  })

  it('should return one field for a line without delimiters', () => {
    const fields = parseCsvLine('hello world', ',')
    assert.deepEqual(
      fields.map(f => [f.start, f.end]),
      [[0, 11]]
    )
  })

  it('should return one empty field for an empty line', () => {
    const fields = parseCsvLine('', ',')
    assert.deepEqual(fields, [{ index: 0, start: 0, end: 0 }])
  })
})

describe('detectDelimiter', () => {
  it('should detect comma', () => {
    assert.equal(detectDelimiter('a,b,c\n1,2,3\n4,5,6'), ',')
  })

  it('should detect semicolon', () => {
    assert.equal(detectDelimiter('a;b;c\n1;2;3\n4;5;6'), ';')
  })

  it('should detect tab', () => {
    assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t')
  })

  it('should detect pipe', () => {
    assert.equal(detectDelimiter('a|b|c\n1|2|3'), '|')
  })

  it('should prefer the delimiter with consistent counts across lines', () => {
    // Both ',' and ';' appear, but only ',' is consistent on every line
    const text = 'a,b,c;x\n1,2,3\n4,5,6'
    assert.equal(detectDelimiter(text), ',')
  })

  it('should ignore delimiters that appear inside quoted fields', () => {
    const text = '"a;b",c,d\n"x;y",1,2'
    assert.equal(detectDelimiter(text), ',')
  })

  it('should default to comma when no candidate appears in every line', () => {
    assert.equal(detectDelimiter('hello\nworld'), ',')
  })

  it('should default to comma for empty input', () => {
    assert.equal(detectDelimiter(''), ',')
  })

  it('should handle CRLF line endings', () => {
    assert.equal(detectDelimiter('a;b;c\r\n1;2;3\r\n'), ';')
  })
})
