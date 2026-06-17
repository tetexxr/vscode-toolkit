import { strict as assert } from 'assert'
import {
  findStringAt,
  findAllStrings,
  nextQuote,
  convertQuote,
  hasUnescapedInterpolation,
  TemplateInterpolationError,
  getNextAllowedQuote,
  normalizeAllowedQuotes
} from '../../../../src/features/editing/text/toggle-quotes-utils'

describe('findStringAt', () => {
  it('should find a single-quoted string', () => {
    const line = "const s = 'hello'"
    const r = findStringAt(line, 13)
    assert.deepEqual(r, { start: 10, end: 16, quote: "'" })
  })

  it('should find a double-quoted string', () => {
    const line = 'const s = "hello"'
    const r = findStringAt(line, 13)
    assert.deepEqual(r, { start: 10, end: 16, quote: '"' })
  })

  it('should find a backtick string', () => {
    const line = 'const s = `hello`'
    const r = findStringAt(line, 13)
    assert.deepEqual(r, { start: 10, end: 16, quote: '`' })
  })

  it('should return null when the cursor is outside any string', () => {
    const line = "const s = 'hello'"
    assert.equal(findStringAt(line, 0), null)
    assert.equal(findStringAt(line, 9), null)
  })

  it('should treat the opening quote as inside the string', () => {
    const line = "const s = 'hello'"
    const r = findStringAt(line, 10)
    assert.ok(r)
    assert.equal(r!.start, 10)
  })

  it('should treat the closing quote as inside the string', () => {
    const line = "const s = 'hello'"
    const r = findStringAt(line, 16)
    assert.ok(r)
    assert.equal(r!.end, 16)
  })

  it('should handle escaped quotes inside the string', () => {
    const line = "const s = 'it\\'s great'"
    const r = findStringAt(line, 15)
    assert.deepEqual(r, { start: 10, end: 22, quote: "'" })
  })

  it('should ignore unterminated strings', () => {
    const line = "const s = 'oops"
    assert.equal(findStringAt(line, 13), null)
  })

  it('should pick the matching string when there are multiple on a line', () => {
    // 'a = ' = positions 0..3 ; first quote at 4 ; second string starts at quote 15.
    const line = "a = 'one'; b = 'two';"
    assert.equal(findStringAt(line, 6)!.start, 4)
    assert.equal(findStringAt(line, 17)!.start, 15)
  })

  it('should handle nested-looking quotes when they are escapes', () => {
    const line = 'const s = "a \\"b\\" c"'
    const r = findStringAt(line, 15)
    assert.ok(r)
    assert.equal(r!.quote, '"')
    assert.equal(r!.start, 10)
    assert.equal(r!.end, 20)
  })
})

describe('findAllStrings', () => {
  it('should return every top-level string on the line', () => {
    const line = "a = 'one' + \"two\" + `three`"
    const all = findAllStrings(line)
    assert.equal(all.length, 3)
    assert.equal(all[0].quote, "'")
    assert.equal(all[1].quote, '"')
    assert.equal(all[2].quote, '`')
  })

  it('should not recurse into strings (inner quotes are treated as content)', () => {
    const line = 'const s = "has \'inside\' quotes"'
    const all = findAllStrings(line)
    assert.equal(all.length, 1)
    assert.equal(all[0].quote, '"')
  })

  it('should return an empty array when the line has no strings', () => {
    assert.deepEqual(findAllStrings('const x = 42;'), [])
  })
})

describe('nextQuote', () => {
  it("should cycle ' → \" → ` → '", () => {
    assert.equal(nextQuote("'"), '"')
    assert.equal(nextQuote('"'), '`')
    assert.equal(nextQuote('`'), "'")
  })
})

describe('convertQuote', () => {
  it('should convert single to double, escaping double quotes', () => {
    assert.equal(convertQuote('hello "world"', "'", '"'), 'hello \\"world\\"')
  })

  it('should convert double to single, unescaping previously-escaped doubles', () => {
    assert.equal(convertQuote('hello \\"world\\"', '"', "'"), 'hello "world"')
  })

  it('should unescape the previous quote and escape the new quote in one pass', () => {
    assert.equal(convertQuote("it\\'s \"great\"", "'", '"'), 'it\'s \\"great\\"')
  })

  it('should preserve other escape sequences (\\n, \\t, \\\\)', () => {
    assert.equal(convertQuote('a\\nb\\tc\\\\d', "'", '"'), 'a\\nb\\tc\\\\d')
  })

  it('should return the input unchanged when from === to', () => {
    assert.equal(convertQuote('hello', '"', '"'), 'hello')
  })

  it('should escape ${...} when converting to backtick', () => {
    assert.equal(convertQuote('value ${foo}', "'", '`'), 'value \\${foo}')
  })

  it('should not double-escape ${ that was already escaped', () => {
    assert.equal(convertQuote('value \\${foo}', "'", '`'), 'value \\${foo}')
  })

  it('should escape backtick characters when converting to backtick', () => {
    assert.equal(convertQuote('he said `hi`', "'", '`'), 'he said \\`hi\\`')
  })

  it('should throw when converting from backtick with an interpolation', () => {
    assert.throws(() => convertQuote('value ${foo}', '`', '"'), TemplateInterpolationError)
  })

  it('should not throw when the ${...} is escaped in the backtick source', () => {
    assert.equal(convertQuote('value \\${foo}', '`', '"'), 'value ${foo}')
  })

  it('should handle empty content', () => {
    assert.equal(convertQuote('', "'", '"'), '')
  })

  it('should preserve a single trailing backslash as-is', () => {
    assert.equal(convertQuote('a\\', "'", '"'), 'a\\')
  })

  it('should escape content that is only the new quote character', () => {
    assert.equal(convertQuote('"', "'", '"'), '\\"')
  })
})

describe('getNextAllowedQuote', () => {
  it('should cycle within the allowed list', () => {
    assert.equal(getNextAllowedQuote("'", ["'", '"', '`']), '"')
    assert.equal(getNextAllowedQuote('"', ["'", '"', '`']), '`')
    assert.equal(getNextAllowedQuote('`', ["'", '"', '`']), "'")
  })

  it('should wrap around for a two-element list (binary toggle)', () => {
    assert.equal(getNextAllowedQuote("'", ["'", '"']), '"')
    assert.equal(getNextAllowedQuote('"', ["'", '"']), "'")
  })

  it('should return null when the list has fewer than two quotes', () => {
    assert.equal(getNextAllowedQuote('"', ['"']), null)
    assert.equal(getNextAllowedQuote('"', []), null)
  })

  it('should return null when the current quote is not in the allowed list', () => {
    // A backtick string in a language whose list is ["'", "\""]
    assert.equal(getNextAllowedQuote('`', ["'", '"']), null)
  })
})

describe('normalizeAllowedQuotes', () => {
  it('should filter out unknown characters', () => {
    assert.deepEqual(normalizeAllowedQuotes(['"', 'x', "'"]), ['"', "'"])
  })

  it('should drop duplicates while preserving order', () => {
    assert.deepEqual(normalizeAllowedQuotes(['"', "'", '"', '`', "'"]), ['"', "'", '`'])
  })

  it('should return an empty array for undefined input', () => {
    assert.deepEqual(normalizeAllowedQuotes(undefined), [])
  })

  it('should return an empty array for empty input', () => {
    assert.deepEqual(normalizeAllowedQuotes([]), [])
  })
})

describe('hasUnescapedInterpolation', () => {
  it('should detect ${ in raw content', () => {
    assert.equal(hasUnescapedInterpolation('hi ${name}'), true)
  })

  it('should not detect ${ when escaped', () => {
    assert.equal(hasUnescapedInterpolation('hi \\${name}'), false)
  })

  it('should not flag a lone $ without {', () => {
    assert.equal(hasUnescapedInterpolation('cost: $5'), false)
  })

  it('should return false for empty content', () => {
    assert.equal(hasUnescapedInterpolation(''), false)
  })

  it('should respect a double backslash before $', () => {
    // \\${name} → literal backslash + ${name}, which IS an interpolation
    assert.equal(hasUnescapedInterpolation('a\\\\${b}'), true)
  })
})
