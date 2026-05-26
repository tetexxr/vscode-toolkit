import { strict as assert } from 'assert'
import {
  sortLines,
  sortLinesByLength,
  sortLinesNumerically,
  reverseLines,
  shuffleLines,
  removeDuplicateLines,
  removeEmptyLines,
  trimTrailingWhitespace,
  seededRandom
} from '../../src/features/lines-utils'

describe('sortLines', () => {
  it('sorts ascending case-sensitive', () => {
    assert.deepEqual(sortLines(['banana', 'Apple', 'cherry']), ['Apple', 'banana', 'cherry'])
  })

  it('sorts descending', () => {
    assert.deepEqual(sortLines(['a', 'c', 'b'], { descending: true }), ['c', 'b', 'a'])
  })

  it('sorts case-insensitively', () => {
    const result = sortLines(['banana', 'Apple', 'cherry'], { caseSensitive: false })
    assert.deepEqual(result, ['Apple', 'banana', 'cherry'])
  })

  it('uses natural sort by default (item2 before item10)', () => {
    assert.deepEqual(sortLines(['item10', 'item2', 'item1']), ['item1', 'item2', 'item10'])
  })

  it('falls back to lexicographic when natural sort is off', () => {
    const result = sortLines(['item10', 'item2', 'item1'], { natural: false })
    assert.deepEqual(result, ['item1', 'item10', 'item2'])
  })

  it('does not mutate input', () => {
    const input = ['c', 'a', 'b']
    sortLines(input)
    assert.deepEqual(input, ['c', 'a', 'b'])
  })

  it('returns empty array unchanged', () => {
    assert.deepEqual(sortLines([]), [])
  })

  it('handles single element', () => {
    assert.deepEqual(sortLines(['only']), ['only'])
  })
})

describe('sortLinesByLength', () => {
  it('sorts shorter to longer', () => {
    assert.deepEqual(sortLinesByLength(['banana', 'a', 'cherry']), ['a', 'banana', 'cherry'])
  })

  it('sorts longer to shorter', () => {
    assert.deepEqual(sortLinesByLength(['a', 'banana', 'cc'], true), ['banana', 'cc', 'a'])
  })

  it('preserves original order for equal lengths (stable)', () => {
    assert.deepEqual(sortLinesByLength(['bb', 'aa', 'c']), ['c', 'bb', 'aa'])
  })
})

describe('sortLinesNumerically', () => {
  it('sorts by first number on each line', () => {
    const input = ['item 10', 'item 2', 'item 1']
    assert.deepEqual(sortLinesNumerically(input), ['item 1', 'item 2', 'item 10'])
  })

  it('handles negative and decimal numbers', () => {
    assert.deepEqual(sortLinesNumerically(['x -3', 'y 0.5', 'z -1.5']), ['x -3', 'z -1.5', 'y 0.5'])
  })

  it('accepts both . and , as decimal separator', () => {
    assert.deepEqual(sortLinesNumerically(['a 1,5', 'b 0,5', 'c 1.0']), ['b 0,5', 'c 1.0', 'a 1,5'])
  })

  it('sends lines without numbers to the end', () => {
    assert.deepEqual(sortLinesNumerically(['no number', '2 two', 'still none', '1 one']), [
      '1 one',
      '2 two',
      'no number',
      'still none'
    ])
  })

  it('preserves order for equal values (stable)', () => {
    assert.deepEqual(sortLinesNumerically(['1 a', '1 b', '1 c']), ['1 a', '1 b', '1 c'])
  })

  it('sorts descending', () => {
    assert.deepEqual(sortLinesNumerically(['1', '3', '2'], true), ['3', '2', '1'])
  })
})

describe('reverseLines', () => {
  it('reverses order', () => {
    assert.deepEqual(reverseLines(['a', 'b', 'c']), ['c', 'b', 'a'])
  })

  it('does not mutate input', () => {
    const input = ['a', 'b']
    reverseLines(input)
    assert.deepEqual(input, ['a', 'b'])
  })
})

describe('shuffleLines', () => {
  it('returns a permutation of the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const shuffled = shuffleLines(input, seededRandom(42))
    assert.deepEqual([...shuffled].sort(), [...input].sort())
  })

  it('is deterministic with a seeded random', () => {
    const input = ['1', '2', '3', '4', '5']
    const a = shuffleLines(input, seededRandom(123))
    const b = shuffleLines(input, seededRandom(123))
    assert.deepEqual(a, b)
  })

  it('produces different orders with different seeds', () => {
    const input = ['1', '2', '3', '4', '5', '6', '7', '8']
    const a = shuffleLines(input, seededRandom(1))
    const b = shuffleLines(input, seededRandom(2))
    assert.notDeepEqual(a, b)
  })

  it('does not mutate input', () => {
    const input = ['a', 'b', 'c']
    shuffleLines(input, seededRandom(0))
    assert.deepEqual(input, ['a', 'b', 'c'])
  })
})

describe('removeDuplicateLines', () => {
  it('keeps the first occurrence by default', () => {
    assert.deepEqual(removeDuplicateLines(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c'])
  })

  it('keeps the last occurrence when keepLast is true', () => {
    assert.deepEqual(removeDuplicateLines(['a', 'b', 'a', 'c', 'b'], { keepLast: true }), ['a', 'c', 'b'])
  })

  it('treats case as significant by default', () => {
    assert.deepEqual(removeDuplicateLines(['Foo', 'foo', 'FOO']), ['Foo', 'foo', 'FOO'])
  })

  it('ignores case when caseSensitive is false', () => {
    assert.deepEqual(removeDuplicateLines(['Foo', 'foo', 'FOO'], { caseSensitive: false }), ['Foo'])
  })

  it('handles empty array', () => {
    assert.deepEqual(removeDuplicateLines([]), [])
  })

  it('compares trimmed content when trim is enabled', () => {
    assert.deepEqual(removeDuplicateLines(['foo', '  foo  ', 'bar'], { trim: true }), ['foo', 'bar'])
  })
})

describe('removeEmptyLines', () => {
  it('removes blank and whitespace-only lines', () => {
    assert.deepEqual(removeEmptyLines(['a', '', '  ', '\t', 'b']), ['a', 'b'])
  })

  it('returns empty when all lines are blank', () => {
    assert.deepEqual(removeEmptyLines(['', ' ', '\t']), [])
  })
})

describe('trimTrailingWhitespace', () => {
  it('trims spaces and tabs at end of each line', () => {
    assert.deepEqual(trimTrailingWhitespace(['foo   ', 'bar\t', 'baz']), ['foo', 'bar', 'baz'])
  })

  it('preserves leading whitespace', () => {
    assert.deepEqual(trimTrailingWhitespace(['  foo  ']), ['  foo'])
  })

  it('preserves blank lines as empty strings', () => {
    assert.deepEqual(trimTrailingWhitespace(['   ', 'foo']), ['', 'foo'])
  })
})

describe('seededRandom', () => {
  it('produces values in [0, 1)', () => {
    const rng = seededRandom(7)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`)
    }
  })

  it('is deterministic for the same seed', () => {
    const a = seededRandom(99)
    const b = seededRandom(99)
    for (let i = 0; i < 10; i++) {
      assert.equal(a(), b())
    }
  })
})
