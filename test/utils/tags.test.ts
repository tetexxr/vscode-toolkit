import { strict as assert } from 'assert'
import {
  getTagAtOffset,
  isSelfClosingAt,
  findMatchingClosingTag,
  findMatchingOpeningTag,
  findNearestUnmatchedClosingTag,
  findNearestUnmatchedOpeningTag,
  matchTagNameAt,
  SELF_CLOSING_TAGS
} from '../../src/utils/tags'

describe('getTagAtOffset', () => {
  it('should detect an opening tag when cursor is on the tag name', () => {
    const text = '<div>'
    const result = getTagAtOffset(text, 3) // cursor on "v"
    assert.deepEqual(result, {
      isClosing: false,
      tagNameStart: 1,
      tagNameEnd: 4,
      tagName: 'div'
    })
  })

  it('should detect a closing tag when cursor is on the tag name', () => {
    const text = '</div>'
    const result = getTagAtOffset(text, 4) // cursor on "v"
    assert.deepEqual(result, {
      isClosing: true,
      tagNameStart: 2,
      tagNameEnd: 5,
      tagName: 'div'
    })
  })

  it('should detect the tag when cursor is at the end of the tag name', () => {
    const text = '<span class="x">'
    const result = getTagAtOffset(text, 5) // cursor right after "span"
    assert.deepEqual(result, {
      isClosing: false,
      tagNameStart: 1,
      tagNameEnd: 5,
      tagName: 'span'
    })
  })

  it('should return undefined when cursor is outside any tag', () => {
    const text = '<div>hello</div>'
    const result = getTagAtOffset(text, 7) // cursor on "l" in "hello"
    assert.equal(result, undefined)
  })

  it('should return undefined when cursor is past the closing >', () => {
    const text = '<div> text'
    const result = getTagAtOffset(text, 6) // cursor on "t" after the tag
    assert.equal(result, undefined)
  })

  it('should return undefined for an empty string', () => {
    assert.equal(getTagAtOffset('', 0), undefined)
  })
})

describe('isSelfClosingAt', () => {
  it('should return true for a self-closing tag', () => {
    const text = '<br />'
    assert.equal(isSelfClosingAt(text, 3), true) // after "br"
  })

  it('should return false for a normal opening tag', () => {
    const text = '<div>'
    assert.equal(isSelfClosingAt(text, 4), false) // after "div"
  })

  it('should return true for a self-closing tag without space', () => {
    const text = '<img/>'
    assert.equal(isSelfClosingAt(text, 4), true) // after "img"
  })

  it('should return false when another tag starts before closing >', () => {
    const text = '<div<span>'
    assert.equal(isSelfClosingAt(text, 4), false) // after "div"
  })

  it('should return true for self-closing with attributes', () => {
    const text = '<input type="text" />'
    assert.equal(isSelfClosingAt(text, 6), true) // after "input"
  })
})

describe('findMatchingClosingTag', () => {
  it('should find the closing tag for a simple pair', () => {
    const text = '<div>hello</div>'
    const result = findMatchingClosingTag(text, 5, 'div') // search after ">"
    assert.deepEqual(result, { start: 12, end: 15 })
  })

  it('should skip nested tags of the same name', () => {
    const text = '<div><div>inner</div></div>'
    const result = findMatchingClosingTag(text, 5, 'div') // search after first ">"
    assert.deepEqual(result, { start: 23, end: 26 })
  })

  it('should handle self-closing nested tags', () => {
    //           0123456789012345678901234
    const text = '<div><br />content</div>'
    const result = findMatchingClosingTag(text, 5, 'div')
    // </div> starts at index 18, tag name "div" is at 20..23
    assert.deepEqual(result, { start: 20, end: 23 })
  })

  it('should return undefined when no closing tag exists', () => {
    const text = '<div>hello'
    const result = findMatchingClosingTag(text, 5, 'div')
    assert.equal(result, undefined)
  })

  it('should match case-insensitively', () => {
    const text = '<DIV>hello</div>'
    const result = findMatchingClosingTag(text, 5, 'DIV')
    assert.deepEqual(result, { start: 12, end: 15 })
  })

  it('should handle comments that do not contain same-name tags', () => {
    //           0         1         2         3
    //           0123456789012345678901234567890123456
    const text = '<div><!-- comment --></div>'
    const result = findMatchingClosingTag(text, 5, 'div')
    assert.deepEqual(result, { start: 23, end: 26 })
  })

  it('should handle deeply nested structures', () => {
    const text = '<ul><li><ul><li>deep</li></ul></li></ul>'
    const result = findMatchingClosingTag(text, 4, 'ul')
    assert.deepEqual(result, { start: 37, end: 39 })
  })
})

describe('findMatchingOpeningTag', () => {
  it('should find the opening tag for a simple pair', () => {
    const text = '<div>hello</div>'
    const result = findMatchingOpeningTag(text, 10, 'div') // search before "</div>"
    assert.deepEqual(result, { start: 1, end: 4 })
  })

  it('should skip nested tags of the same name', () => {
    const text = '<div><div>inner</div></div>'
    const result = findMatchingOpeningTag(text, 21, 'div') // before outer "</div>"
    assert.deepEqual(result, { start: 1, end: 4 })
  })

  it('should handle self-closing tags when scanning backward', () => {
    const text = '<div><br />content</div>'
    const result = findMatchingOpeningTag(text, 18, 'div')
    assert.deepEqual(result, { start: 1, end: 4 })
  })

  it('should return undefined when no opening tag exists', () => {
    const text = 'hello</div>'
    const result = findMatchingOpeningTag(text, 5, 'div')
    assert.equal(result, undefined)
  })

  it('should match case-insensitively', () => {
    const text = '<DIV>hello</div>'
    const result = findMatchingOpeningTag(text, 10, 'div')
    assert.deepEqual(result, { start: 1, end: 4 })
  })
})

describe('SELF_CLOSING_TAGS', () => {
  it('should contain standard HTML void elements', () => {
    assert.equal(SELF_CLOSING_TAGS.has('br'), true)
    assert.equal(SELF_CLOSING_TAGS.has('img'), true)
    assert.equal(SELF_CLOSING_TAGS.has('input'), true)
    assert.equal(SELF_CLOSING_TAGS.has('hr'), true)
    assert.equal(SELF_CLOSING_TAGS.has('meta'), true)
    assert.equal(SELF_CLOSING_TAGS.has('link'), true)
  })

  it('should not contain non-void elements', () => {
    assert.equal(SELF_CLOSING_TAGS.has('div'), false)
    assert.equal(SELF_CLOSING_TAGS.has('span'), false)
    assert.equal(SELF_CLOSING_TAGS.has('p'), false)
  })
})

describe('matchTagNameAt', () => {
  it('should match a tag name at the exact offset', () => {
    assert.equal(matchTagNameAt('<div>', 1), 'div')
  })

  it('should not match at an offset where no tag name starts', () => {
    assert.equal(matchTagNameAt('<div>', 4), undefined)
    assert.equal(matchTagNameAt('< div>', 1), undefined)
  })

  it('should stop at > and / characters', () => {
    assert.equal(matchTagNameAt('<div/>', 1), 'div')
    assert.equal(matchTagNameAt('<div class="x">', 1), 'div')
  })
})

describe('findNearestUnmatchedClosingTag', () => {
  it('should find the closing tag of the edited opening tag', () => {
    const text = '<divx>hello</div>'
    const result = findNearestUnmatchedClosingTag(text, 6)
    assert.deepEqual(result, { start: 13, end: 16 })
  })

  it('should skip balanced nested pairs', () => {
    const text = '<outer><inner></inner></old>'
    const result = findNearestUnmatchedClosingTag(text, 7)
    assert.equal(text.slice(result!.start, result!.end), 'old')
  })

  it('should ignore self-closing and void tags while balancing', () => {
    const text = '<a><br><img src="x"/></b>'
    const result = findNearestUnmatchedClosingTag(text, 3)
    assert.equal(text.slice(result!.start, result!.end), 'b')
  })

  it('should return undefined when no closing tag exists', () => {
    assert.equal(findNearestUnmatchedClosingTag('<div>text', 5), undefined)
  })
})

describe('findNearestUnmatchedOpeningTag', () => {
  // Callers pass the offset of the closing tag's own '<' so the edited tag
  // is excluded from the backward scan.
  it('should find the opening tag of the edited closing tag', () => {
    const text = '<div>hello</divx>'
    const result = findNearestUnmatchedOpeningTag(text, text.indexOf('</'))
    assert.deepEqual(result, { start: 1, end: 4 })
  })

  it('should skip balanced nested pairs scanning backward', () => {
    const text = '<old><inner></inner></x>'
    const result = findNearestUnmatchedOpeningTag(text, text.indexOf('</x>'))
    assert.equal(text.slice(result!.start, result!.end), 'old')
  })

  it('should return undefined when no opening tag exists', () => {
    assert.equal(findNearestUnmatchedOpeningTag('text</div>', 4), undefined)
  })
})

describe('getTagAtOffset — bounded scan', () => {
  it('should give up after the bounded backward scan in tag-less text', () => {
    const text = 'a'.repeat(10000)
    assert.equal(getTagAtOffset(text, 10000), undefined)
  })

  it('should still find a tag within the scan window', () => {
    const text = 'x'.repeat(5000) + '<div'
    const result = getTagAtOffset(text, text.length)
    assert.equal(result?.tagName, 'div')
  })
})
