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
} from '../../src/features/toggle-quotes-utils'

describe('findStringAt', () => {
  it('finds a single-quoted string', () => {
    const line = "const s = 'hello'"
    const r = findStringAt(line, 13)
    assert.deepEqual(r, { start: 10, end: 16, quote: "'" })
  })

  it('finds a double-quoted string', () => {
    const line = 'const s = "hello"'
    const r = findStringAt(line, 13)
    assert.deepEqual(r, { start: 10, end: 16, quote: '"' })
  })

  it('finds a backtick string', () => {
    const line = 'const s = `hello`'
    const r = findStringAt(line, 13)
    assert.deepEqual(r, { start: 10, end: 16, quote: '`' })
  })

  it('returns null when the cursor is outside any string', () => {
    const line = "const s = 'hello'"
    assert.equal(findStringAt(line, 0), null)
    assert.equal(findStringAt(line, 9), null)
  })

  it('considers cursor on the opening quote as inside the string', () => {
    const line = "const s = 'hello'"
    const r = findStringAt(line, 10)
    assert.ok(r)
    assert.equal(r!.start, 10)
  })

  it('considers cursor on the closing quote as inside the string', () => {
    const line = "const s = 'hello'"
    const r = findStringAt(line, 16)
    assert.ok(r)
    assert.equal(r!.end, 16)
  })

  it('handles escaped quotes inside the string', () => {
    const line = "const s = 'it\\'s great'"
    const r = findStringAt(line, 15)
    assert.deepEqual(r, { start: 10, end: 22, quote: "'" })
  })

  it('ignores unterminated strings', () => {
    const line = "const s = 'oops"
    assert.equal(findStringAt(line, 13), null)
  })

  it('picks the matching string when there are multiple on a line', () => {
    // 'a = ' = positions 0..3 ; first quote at 4 ; second string starts at quote 15.
    const line = "a = 'one'; b = 'two';"
    assert.equal(findStringAt(line, 6)!.start, 4)
    assert.equal(findStringAt(line, 17)!.start, 15)
  })

  it('handles nested-looking quotes via escapes', () => {
    const line = 'const s = "a \\"b\\" c"'
    const r = findStringAt(line, 15)
    assert.ok(r)
    assert.equal(r!.quote, '"')
    assert.equal(r!.start, 10)
    assert.equal(r!.end, 20)
  })
})

describe('findAllStrings', () => {
  it('returns all top-level strings on the line', () => {
    const line = "a = 'one' + \"two\" + `three`"
    const all = findAllStrings(line)
    assert.equal(all.length, 3)
    assert.equal(all[0].quote, "'")
    assert.equal(all[1].quote, '"')
    assert.equal(all[2].quote, '`')
  })

  it('does not recurse into strings (the inner quotes are content)', () => {
    const line = 'const s = "has \'inside\' quotes"'
    const all = findAllStrings(line)
    assert.equal(all.length, 1)
    assert.equal(all[0].quote, '"')
  })

  it('returns empty for a line without strings', () => {
    assert.deepEqual(findAllStrings('const x = 42;'), [])
  })
})

describe('nextQuote', () => {
  it("cycles ' → \" → ` → '", () => {
    assert.equal(nextQuote("'"), '"')
    assert.equal(nextQuote('"'), '`')
    assert.equal(nextQuote('`'), "'")
  })
})

describe('convertQuote', () => {
  it("converts single to double, escaping double quotes", () => {
    assert.equal(convertQuote('hello "world"', "'", '"'), 'hello \\"world\\"')
  })

  it('converts double to single, unescaping previously-escaped doubles', () => {
    assert.equal(convertQuote('hello \\"world\\"', '"', "'"), 'hello "world"')
  })

  it('unescapes the previous quote and escapes the new quote in one pass', () => {
    assert.equal(convertQuote("it\\'s \"great\"", "'", '"'), 'it\'s \\"great\\"')
  })

  it('preserves other escape sequences (\\n, \\t, \\\\)', () => {
    assert.equal(convertQuote('a\\nb\\tc\\\\d', "'", '"'), 'a\\nb\\tc\\\\d')
  })

  it('returns input unchanged when from === to', () => {
    assert.equal(convertQuote('hello', '"', '"'), 'hello')
  })

  it('escapes ${...} when converting TO backtick', () => {
    assert.equal(convertQuote('value ${foo}', "'", '`'), 'value \\${foo}')
  })

  it('does not double-escape ${ that was already escaped', () => {
    assert.equal(convertQuote('value \\${foo}', "'", '`'), 'value \\${foo}')
  })

  it('escapes a backtick character itself when converting to backtick', () => {
    assert.equal(convertQuote('he said `hi`', "'", '`'), 'he said \\`hi\\`')
  })

  it('throws when converting from backtick with an interpolation', () => {
    assert.throws(() => convertQuote('value ${foo}', '`', '"'), TemplateInterpolationError)
  })

  it('does not throw if the ${...} is escaped in the backtick source', () => {
    assert.equal(convertQuote('value \\${foo}', '`', '"'), 'value ${foo}')
  })

  it('handles empty content', () => {
    assert.equal(convertQuote('', "'", '"'), '')
  })

  it('preserves a single trailing backslash as-is', () => {
    assert.equal(convertQuote('a\\', "'", '"'), 'a\\')
  })

  it('handles content that is only the new quote character', () => {
    assert.equal(convertQuote('"', "'", '"'), '\\"')
  })
})

describe('getNextAllowedQuote', () => {
  it('cycles within the allowed list', () => {
    assert.equal(getNextAllowedQuote("'", ["'", '"', '`']), '"')
    assert.equal(getNextAllowedQuote('"', ["'", '"', '`']), '`')
    assert.equal(getNextAllowedQuote('`', ["'", '"', '`']), "'")
  })

  it('wraps around for a two-element list (binary toggle)', () => {
    assert.equal(getNextAllowedQuote("'", ["'", '"']), '"')
    assert.equal(getNextAllowedQuote('"', ["'", '"']), "'")
  })

  it('returns null when the list has fewer than two quotes', () => {
    assert.equal(getNextAllowedQuote('"', ['"']), null)
    assert.equal(getNextAllowedQuote('"', []), null)
  })

  it('returns null when the current quote is not in the allowed list', () => {
    // A backtick string in a language whose list is ["'", "\""]
    assert.equal(getNextAllowedQuote('`', ["'", '"']), null)
  })
})

describe('normalizeAllowedQuotes', () => {
  it('filters out unknown characters', () => {
    assert.deepEqual(normalizeAllowedQuotes(['"', 'x', "'"]), ['"', "'"])
  })

  it('drops duplicates while preserving order', () => {
    assert.deepEqual(normalizeAllowedQuotes(['"', "'", '"', '`', "'"]), ['"', "'", '`'])
  })

  it('returns empty array for undefined input', () => {
    assert.deepEqual(normalizeAllowedQuotes(undefined), [])
  })

  it('returns empty array for empty input', () => {
    assert.deepEqual(normalizeAllowedQuotes([]), [])
  })
})

describe('hasUnescapedInterpolation', () => {
  it('detects ${ in raw content', () => {
    assert.equal(hasUnescapedInterpolation('hi ${name}'), true)
  })

  it('does not detect when escaped', () => {
    assert.equal(hasUnescapedInterpolation('hi \\${name}'), false)
  })

  it('does not flag a lone $ without {', () => {
    assert.equal(hasUnescapedInterpolation('cost: $5'), false)
  })

  it('returns false for empty content', () => {
    assert.equal(hasUnescapedInterpolation(''), false)
  })

  it('respects double backslash before $', () => {
    // \\${name} → literal backslash + ${name}, which IS an interpolation
    assert.equal(hasUnescapedInterpolation('a\\\\${b}'), true)
  })
})
