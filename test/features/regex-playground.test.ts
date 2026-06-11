import { strict as assert } from 'assert'
import {
  compileRegex,
  findAllMatches,
  highlightMatches,
  applyReplace,
  evaluatePattern
} from '../../src/features/regex-playground-utils'

describe('compileRegex', () => {
  it('should return ok for a valid pattern and flags', () => {
    const r = compileRegex('\\d+', 'g')
    assert.equal(r.ok, true)
    assert.ok((r as { ok: true; re: RegExp }).re instanceof RegExp)
  })

  it('should reject an empty pattern', () => {
    const r = compileRegex('', 'g')
    assert.equal(r.ok, false)
    assert.match((r as { ok: false; error: string }).error, /empty/i)
  })

  it('should reject unknown flags', () => {
    const r = compileRegex('a', 'gx')
    assert.equal(r.ok, false)
    assert.match((r as { ok: false; error: string }).error, /Unknown flag/)
  })

  it('should accept the d (indices) and v (unicodeSets) flags', () => {
    assert.equal(compileRegex('a', 'd').ok, true)
    assert.equal(compileRegex('a', 'v').ok, true)
  })

  it('should reject the invalid u+v flag combination via RegExp', () => {
    const r = compileRegex('a', 'uv')
    assert.equal(r.ok, false)
  })

  it('should reject duplicate flags', () => {
    const r = compileRegex('a', 'gg')
    assert.equal(r.ok, false)
    assert.match((r as { ok: false; error: string }).error, /Duplicate/)
  })

  it('should forward JS SyntaxError on invalid pattern', () => {
    const r = compileRegex('[unclosed', 'g')
    assert.equal(r.ok, false)
  })
})

describe('findAllMatches', () => {
  it('should return all matches with the global flag', () => {
    const re = new RegExp('\\d+', 'g')
    // "a1 b22 c333" — positions: a=0, 1=1, space=2, b=3, 22=[4,6), space=6, c=7, 333=[8,11)
    const matches = findAllMatches(re, 'a1 b22 c333')
    assert.deepEqual(
      matches.map(m => m.full),
      ['1', '22', '333']
    )
    assert.equal(matches[1].index, 4)
    assert.equal(matches[1].end, 6)
  })

  it('should return only the first match without the global flag', () => {
    const re = new RegExp('\\d+')
    const matches = findAllMatches(re, 'a1 b22 c333')
    assert.equal(matches.length, 1)
    assert.equal(matches[0].full, '1')
  })

  it('should capture positional groups', () => {
    const re = new RegExp('(\\w+) (\\d+)', 'g')
    const matches = findAllMatches(re, 'foo 1 bar 22')
    assert.deepEqual(matches[0].groups, ['foo', '1'])
    assert.deepEqual(matches[1].groups, ['bar', '22'])
  })

  it('should capture named groups', () => {
    const re = new RegExp('(?<name>\\w+):(?<value>\\d+)', 'g')
    const matches = findAllMatches(re, 'a:1 b:2')
    assert.deepEqual(matches[0].namedGroups, { name: 'a', value: '1' })
  })

  it('should handle a regex matching an empty string without infinite looping', () => {
    const re = new RegExp('a*', 'g')
    const matches = findAllMatches(re, 'bbb')
    assert.ok(matches.length < 100)
  })
})

describe('highlightMatches', () => {
  it('should wrap matches in <mark> spans with alternating classes', () => {
    const re = new RegExp('\\d+', 'g')
    const input = 'a1 b22 c333'
    const matches = findAllMatches(re, input)
    const html = highlightMatches(input, matches)
    assert.equal(
      html,
      'a<mark class="match m-0">1</mark> b<mark class="match m-1">22</mark> c<mark class="match m-0">333</mark>'
    )
  })

  it('should escape HTML in unmatched text and in matches', () => {
    const re = new RegExp('<\\w+>', 'g')
    const input = 'before <b> after'
    const matches = findAllMatches(re, input)
    const html = highlightMatches(input, matches)
    assert.equal(html, 'before <mark class="match m-0">&lt;b&gt;</mark> after')
  })

  it('should return escaped plain text when there are no matches', () => {
    assert.equal(highlightMatches('a <b> c', []), 'a &lt;b&gt; c')
  })
})

describe('applyReplace', () => {
  it('should support backreferences in the replacement text', () => {
    const re = new RegExp('(\\w+) (\\d+)', 'g')
    assert.equal(applyReplace(re, 'foo 1\nbar 22', '$2-$1'), '1-foo\n22-bar')
  })

  it('should replace only the first occurrence without the global flag', () => {
    const re = new RegExp('a')
    assert.equal(applyReplace(re, 'aaa', 'b'), 'baa')
  })
})


describe('evaluatePattern', () => {
  it('should return matches, highlight, and replace result for a valid pattern', () => {
    const r = evaluatePattern('(\\d+)', 'g', 'a 12 b 34', '[$1]')
    assert.equal(r.error, null)
    assert.equal(r.matches.length, 2)
    assert.equal(r.matches[0].full, '12')
    assert.ok(r.highlightedHtml.includes('<mark'))
    assert.equal(r.replaceResult, 'a [12] b [34]')
  })

  it('should return a compile error for an invalid pattern', () => {
    const r = evaluatePattern('(', 'g', 'abc', '')
    assert.ok(r.error)
    assert.equal(r.matches.length, 0)
    assert.equal(r.highlightedHtml, '')
    assert.equal(r.replaceResult, '')
  })

  it('should apply replace without the global flag only once', () => {
    const r = evaluatePattern('a', '', 'aaa', 'b')
    assert.equal(r.error, null)
    assert.equal(r.replaceResult, 'baa')
  })

  it('should return the input unchanged in replace when nothing matches', () => {
    const r = evaluatePattern('xyz', 'g', 'abc', 'q')
    assert.equal(r.error, null)
    assert.equal(r.matches.length, 0)
    assert.equal(r.replaceResult, 'abc')
  })
})
