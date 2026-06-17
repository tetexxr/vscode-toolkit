import { strict as assert } from 'assert'
import {
  findTableBlocks,
  formatMarkdownTables,
  formatTable,
  isSeparatorRow,
  splitRow,
  tableBlockAtLine
} from '../../../../src/features/editing/convert/markdown-table-utils'

describe('splitRow', () => {
  it('should split a row with surrounding pipes', () => {
    assert.deepEqual(splitRow('| a | b | c |'), ['a', 'b', 'c'])
  })

  it('should split a row without surrounding pipes', () => {
    assert.deepEqual(splitRow('a | b'), ['a', 'b'])
  })

  it('should honor escaped pipes', () => {
    assert.deepEqual(splitRow('| a \\| b | c |'), ['a \\| b', 'c'])
  })

  it('should not split on pipes inside inline code', () => {
    assert.deepEqual(splitRow('| `a|b` | c |'), ['`a|b`', 'c'])
  })

  it('should keep empty cells', () => {
    assert.deepEqual(splitRow('| a |  | c |'), ['a', '', 'c'])
  })
})

describe('isSeparatorRow', () => {
  it('should accept dashes with optional alignment colons', () => {
    assert.equal(isSeparatorRow(['---', ':--', '--:', ':-:']), true)
  })

  it('should reject content rows', () => {
    assert.equal(isSeparatorRow(['---', 'data']), false)
    assert.equal(isSeparatorRow(['']), false)
  })
})

describe('formatTable', () => {
  it('should align columns to the widest cell', () => {
    const result = formatTable(['| Name | Age |', '|---|---|', '| Alice | 30 |', '| Bob | 9 |'])
    assert.deepEqual(result, [
      '| Name  | Age |',
      '| ----- | --- |',
      '| Alice | 30  |',
      '| Bob   | 9   |'
    ])
  })

  it('should preserve and apply alignment markers (header included, like Prettier)', () => {
    const result = formatTable(['| L | C | R |', '|:--|:-:|--:|', '| a | b | c |', '| aa | bb | cc |'])
    assert.deepEqual(result, [
      '| L   |  C  |   R |',
      '| :-- | :-: | --: |',
      '| a   |  b  |   c |',
      '| aa  | bb  |  cc |'
    ])
  })

  it('should pad rows with missing cells', () => {
    const result = formatTable(['| a | b |', '|---|---|', '| only |'])
    assert.deepEqual(result, ['| a    | b   |', '| ---- | --- |', '| only |     |'])
  })

  it('should preserve leading indentation', () => {
    const result = formatTable(['  | a | b |', '  |---|---|', '  | 1 | 2 |'])
    assert.ok(result.every(line => line.startsWith('  | ')))
  })

  it('should handle rows without surrounding pipes', () => {
    const result = formatTable(['Name | Age', '--- | ---', 'Alice | 30'])
    assert.deepEqual(result, ['| Name  | Age |', '| ----- | --- |', '| Alice | 30  |'])
  })
})

describe('findTableBlocks / tableBlockAtLine', () => {
  const DOC = [
    '# Title',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    'text with | pipe but no table',
    '',
    '| x |',
    '|---|',
    '| y |'
  ]

  it('should find every table block', () => {
    assert.deepEqual(findTableBlocks(DOC), [
      { start: 2, end: 4 },
      { start: 8, end: 10 }
    ])
  })

  it('should not treat a lone pipe line as a table', () => {
    assert.equal(tableBlockAtLine(DOC, 6), null)
  })

  it('should locate the block containing a line', () => {
    assert.deepEqual(tableBlockAtLine(DOC, 3), { start: 2, end: 4 })
    assert.deepEqual(tableBlockAtLine(DOC, 10), { start: 8, end: 10 })
    assert.equal(tableBlockAtLine(DOC, 0), null)
  })

  it('should end the block at the first non-table line', () => {
    const lines = ['| a |', '|---|', '| 1 |', 'plain text']
    assert.deepEqual(findTableBlocks(lines), [{ start: 0, end: 2 }])
  })
})

describe('formatMarkdownTables', () => {
  it('should format every table and leave prose untouched', () => {
    const input = ['Intro', '', '| a | b |', '|---|---|', '| long | 2 |', '', 'Outro'].join('\n')
    const expected = ['Intro', '', '| a    | b   |', '| ---- | --- |', '| long | 2   |', '', 'Outro'].join('\n')
    assert.equal(formatMarkdownTables(input), expected)
  })

  it('should preserve CRLF line endings', () => {
    const input = '| a |\r\n|---|\r\n| 1 |'
    const output = formatMarkdownTables(input)
    assert.ok(output.includes('\r\n'))
    assert.ok(!/[^\r]\n/.test(output))
  })

  it('should return text without tables unchanged', () => {
    const input = 'no tables\nhere | either'
    assert.equal(formatMarkdownTables(input), input)
  })
})

describe('formatTable — compact mode', () => {
  it('should strip alignment padding down to single spaces', () => {
    const result = formatTable(['| Name  | Age |', '| ----- | --- |', '| Alice | 30  |'], 'compact')
    assert.deepEqual(result, ['| Name | Age |', '| --- | --- |', '| Alice | 30 |'])
  })

  it('should keep minimal alignment markers in the separator', () => {
    const result = formatTable(['| L   |  C  |   R |', '| :-- | :-: | --: |', '| a   |  b  |   c |'], 'compact')
    assert.deepEqual(result, ['| L | C | R |', '| :-- | :-: | --: |', '| a | b | c |'])
  })

  it('should preserve indentation and pad missing cells', () => {
    const result = formatTable(['  | a    | b   |', '  | ---- | --- |', '  | only |     |'], 'compact')
    assert.deepEqual(result, ['  | a | b |', '  | --- | --- |', '  | only |  |'])
  })

  it('should be the inverse of align (round-trip stable)', () => {
    const aligned = ['| Name  | Age |', '| ----- | --- |', '| Alice | 30  |']
    const compacted = formatTable(aligned, 'compact')
    assert.deepEqual(formatTable(compacted, 'align'), aligned)
  })

  it('should format every table in compact mode via formatMarkdownTables', () => {
    const input = '| a    | b   |\n| ---- | --- |\n| long | 2   |'
    assert.equal(formatMarkdownTables(input, 'compact'), '| a | b |\n| --- | --- |\n| long | 2 |')
  })
})
