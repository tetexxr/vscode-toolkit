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
} from '../../../../src/features/editing/text/lines-utils'

describe('sortLines', () => {
  it('should sort ascending case-sensitively by default', () => {
    assert.deepEqual(sortLines(['banana', 'Apple', 'cherry']), ['Apple', 'banana', 'cherry'])
  })

  it('should sort descending when descending is true', () => {
    assert.deepEqual(sortLines(['a', 'c', 'b'], { descending: true }), ['c', 'b', 'a'])
  })

  it('should sort case-insensitively when caseSensitive is false', () => {
    const result = sortLines(['banana', 'Apple', 'cherry'], { caseSensitive: false })
    assert.deepEqual(result, ['Apple', 'banana', 'cherry'])
  })

  it('should use natural sort by default so item2 comes before item10', () => {
    assert.deepEqual(sortLines(['item10', 'item2', 'item1']), ['item1', 'item2', 'item10'])
  })

  it('should fall back to lexicographic order when natural sort is off', () => {
    const result = sortLines(['item10', 'item2', 'item1'], { natural: false })
    assert.deepEqual(result, ['item1', 'item10', 'item2'])
  })

  it('should not mutate the input array', () => {
    const input = ['c', 'a', 'b']
    sortLines(input)
    assert.deepEqual(input, ['c', 'a', 'b'])
  })

  it('should return an empty array unchanged when input is empty', () => {
    assert.deepEqual(sortLines([]), [])
  })

  it('should handle a single-element array unchanged', () => {
    assert.deepEqual(sortLines(['only']), ['only'])
  })
})

describe('sortLinesByLength', () => {
  it('should sort shorter to longer by default', () => {
    assert.deepEqual(sortLinesByLength(['banana', 'a', 'cherry']), ['a', 'banana', 'cherry'])
  })

  it('should sort longer to shorter when descending is true', () => {
    assert.deepEqual(sortLinesByLength(['a', 'banana', 'cc'], true), ['banana', 'cc', 'a'])
  })

  it('should preserve original order for equal lengths to remain stable', () => {
    assert.deepEqual(sortLinesByLength(['bb', 'aa', 'c']), ['c', 'bb', 'aa'])
  })
})

describe('sortLinesNumerically', () => {
  it('should sort by the first number on each line', () => {
    const input = ['item 10', 'item 2', 'item 1']
    assert.deepEqual(sortLinesNumerically(input), ['item 1', 'item 2', 'item 10'])
  })

  it('should handle negative and decimal numbers', () => {
    assert.deepEqual(sortLinesNumerically(['x -3', 'y 0.5', 'z -1.5']), ['x -3', 'z -1.5', 'y 0.5'])
  })

  it('should accept both "." and "," as decimal separators', () => {
    assert.deepEqual(sortLinesNumerically(['a 1,5', 'b 0,5', 'c 1.0']), ['b 0,5', 'c 1.0', 'a 1,5'])
  })

  it('should send lines without numbers to the end', () => {
    assert.deepEqual(sortLinesNumerically(['no number', '2 two', 'still none', '1 one']), [
      '1 one',
      '2 two',
      'no number',
      'still none'
    ])
  })

  it('should preserve order for equal values to remain stable', () => {
    assert.deepEqual(sortLinesNumerically(['1 a', '1 b', '1 c']), ['1 a', '1 b', '1 c'])
  })

  it('should sort descending when descending is true', () => {
    assert.deepEqual(sortLinesNumerically(['1', '3', '2'], true), ['3', '2', '1'])
  })
})

describe('reverseLines', () => {
  it('should reverse the line order', () => {
    assert.deepEqual(reverseLines(['a', 'b', 'c']), ['c', 'b', 'a'])
  })

  it('should not mutate the input array', () => {
    const input = ['a', 'b']
    reverseLines(input)
    assert.deepEqual(input, ['a', 'b'])
  })
})

describe('shuffleLines', () => {
  it('should return a permutation of the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const shuffled = shuffleLines(input, seededRandom(42))
    assert.deepEqual([...shuffled].sort(), [...input].sort())
  })

  it('should be deterministic when given the same seeded random', () => {
    const input = ['1', '2', '3', '4', '5']
    const a = shuffleLines(input, seededRandom(123))
    const b = shuffleLines(input, seededRandom(123))
    assert.deepEqual(a, b)
  })

  it('should produce different orders when given different seeds', () => {
    const input = ['1', '2', '3', '4', '5', '6', '7', '8']
    const a = shuffleLines(input, seededRandom(1))
    const b = shuffleLines(input, seededRandom(2))
    assert.notDeepEqual(a, b)
  })

  it('should not mutate the input array', () => {
    const input = ['a', 'b', 'c']
    shuffleLines(input, seededRandom(0))
    assert.deepEqual(input, ['a', 'b', 'c'])
  })
})

describe('removeDuplicateLines', () => {
  it('should keep the first occurrence by default', () => {
    assert.deepEqual(removeDuplicateLines(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c'])
  })

  it('should keep the last occurrence when keepLast is true', () => {
    assert.deepEqual(removeDuplicateLines(['a', 'b', 'a', 'c', 'b'], { keepLast: true }), ['a', 'c', 'b'])
  })

  it('should treat case as significant by default', () => {
    assert.deepEqual(removeDuplicateLines(['Foo', 'foo', 'FOO']), ['Foo', 'foo', 'FOO'])
  })

  it('should ignore case when caseSensitive is false', () => {
    assert.deepEqual(removeDuplicateLines(['Foo', 'foo', 'FOO'], { caseSensitive: false }), ['Foo'])
  })

  it('should return an empty array unchanged when input is empty', () => {
    assert.deepEqual(removeDuplicateLines([]), [])
  })

  it('should compare trimmed content when trim is enabled', () => {
    assert.deepEqual(removeDuplicateLines(['foo', '  foo  ', 'bar'], { trim: true }), ['foo', 'bar'])
  })
})

describe('removeEmptyLines', () => {
  it('should remove blank and whitespace-only lines', () => {
    assert.deepEqual(removeEmptyLines(['a', '', '  ', '\t', 'b']), ['a', 'b'])
  })

  it('should return empty when all lines are blank', () => {
    assert.deepEqual(removeEmptyLines(['', ' ', '\t']), [])
  })
})

describe('trimTrailingWhitespace', () => {
  it('should trim spaces and tabs at the end of each line', () => {
    assert.deepEqual(trimTrailingWhitespace(['foo   ', 'bar\t', 'baz']), ['foo', 'bar', 'baz'])
  })

  it('should preserve leading whitespace', () => {
    assert.deepEqual(trimTrailingWhitespace(['  foo  ']), ['  foo'])
  })

  it('should reduce blank lines to empty strings', () => {
    assert.deepEqual(trimTrailingWhitespace(['   ', 'foo']), ['', 'foo'])
  })
})

describe('seededRandom', () => {
  it('should produce values in the range [0, 1)', () => {
    const rng = seededRandom(7)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`)
    }
  })

  it('should be deterministic for the same seed', () => {
    const a = seededRandom(99)
    const b = seededRandom(99)
    for (let i = 0; i < 10; i++) {
      assert.equal(a(), b())
    }
  })
})
