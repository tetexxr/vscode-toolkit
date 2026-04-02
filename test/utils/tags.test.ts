import { strict as assert } from 'assert'
import {
  getTagAtOffset,
  isSelfClosingAt,
  findMatchingClosingTag,
  findMatchingOpeningTag,
  SELF_CLOSING_TAGS,
} from '../../src/utils/tags'

describe('getTagAtOffset', () => {
  it('should detect an opening tag when cursor is on the tag name', () => {
    const text = '<div>'
    const result = getTagAtOffset(text, 3) // cursor on "v"
    assert.deepEqual(result, {
      isClosing: false,
      tagNameStart: 1,
      tagNameEnd: 4,
      tagName: 'div',
    })
  })

  it('should detect a closing tag when cursor is on the tag name', () => {
    const text = '</div>'
    const result = getTagAtOffset(text, 4) // cursor on "v"
    assert.deepEqual(result, {
      isClosing: true,
      tagNameStart: 2,
      tagNameEnd: 5,
      tagName: 'div',
    })
  })

  it('should detect the tag when cursor is at the end of the tag name', () => {
    const text = '<span class="x">'
    const result = getTagAtOffset(text, 5) // cursor right after "span"
    assert.deepEqual(result, {
      isClosing: false,
      tagNameStart: 1,
      tagNameEnd: 5,
      tagName: 'span',
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
