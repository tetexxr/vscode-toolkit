import { strict as assert } from 'assert'
import {
  ClipboardHistory,
  formatItem,
  formatAge,
  truncate
} from '../../src/features/clipboard-history-utils'

describe('ClipboardHistory.add', () => {
  it('should store items in most-recent-first order', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('c', 3)
    assert.deepEqual(h.getAll().map(i => i.text), ['c', 'b', 'a'])
  })

  it('should deduplicate by moving the existing item to the front', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('a', 3)
    const all = h.getAll()
    assert.deepEqual(all.map(i => i.text), ['a', 'b'])
    assert.equal(all[0].addedAt, 3)
  })

  it('should enforce the maxItems FIFO cap', () => {
    const h = new ClipboardHistory({ maxItems: 3, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('c', 3)
    h.add('d', 4)
    assert.deepEqual(h.getAll().map(i => i.text), ['d', 'c', 'b'])
  })

  it('should reject empty strings', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 100 })
    assert.equal(h.add(''), false)
    assert.equal(h.size(), 0)
  })

  it('should reject items longer than maxItemLength', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 5 })
    assert.equal(h.add('hello world'), false)
    assert.equal(h.size(), 0)
  })

  it('should accept items exactly at maxItemLength', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 5 })
    assert.equal(h.add('hello'), true)
    assert.equal(h.size(), 1)
  })
})

describe('ClipboardHistory.clear / size / setLimits', () => {
  it('should empty the history when clear() is called', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a')
    h.add('b')
    h.clear()
    assert.equal(h.size(), 0)
    assert.deepEqual(h.getAll(), [])
  })

  it('should trim existing items when setLimits shrinks maxItems', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('c', 3)
    h.setLimits({ maxItems: 2, maxItemLength: 1000 })
    assert.deepEqual(h.getAll().map(i => i.text), ['c', 'b'])
  })

  it('should not retroactively drop items longer than the new maxItemLength', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('hello world')
    h.setLimits({ maxItems: 10, maxItemLength: 5 })
    assert.equal(h.size(), 1)
    // But further adds of new long items are rejected.
    assert.equal(h.add('foobar'), false)
  })
})

describe('truncate', () => {
  it('should return the input unchanged when shorter than the limit', () => {
    assert.equal(truncate('hello', 10), 'hello')
  })

  it('should append an ellipsis when truncating', () => {
    assert.equal(truncate('abcdefghij', 5), 'abcde…')
  })
})

describe('formatAge', () => {
  it('should report "just now" for under 5 seconds', () => {
    assert.equal(formatAge(0), 'just now')
    assert.equal(formatAge(4000), 'just now')
  })

  it('should format seconds, minutes, hours and days', () => {
    assert.equal(formatAge(10 * 1000), '10s ago')
    assert.equal(formatAge(2 * 60 * 1000), '2m ago')
    assert.equal(formatAge(3 * 60 * 60 * 1000), '3h ago')
    assert.equal(formatAge(2 * 24 * 60 * 60 * 1000), '2d ago')
  })

  it('should handle negative deltas as "just now"', () => {
    assert.equal(formatAge(-1000), 'just now')
  })
})

describe('formatItem', () => {
  it('should use the first line of the text as the label', () => {
    const f = formatItem({ text: 'first line\nsecond line', addedAt: 0 }, 0)
    assert.equal(f.label, 'first line')
    assert.equal(f.description, '2 lines · just now')
  })

  it('should truncate long labels with an ellipsis', () => {
    const long = 'x'.repeat(100)
    const f = formatItem({ text: long, addedAt: 0 }, 0)
    assert.equal(f.label.length, 81) // 80 chars + the … glyph
    assert.ok(f.label.endsWith('…'))
  })

  it('should singularize the line count for one-line entries', () => {
    const f = formatItem({ text: 'one liner', addedAt: 0 }, 0)
    assert.match(f.description, /^1 line · /)
  })

  it('should omit detail when the entry fits in a single short line', () => {
    const f = formatItem({ text: 'hello', addedAt: 0 }, 0)
    assert.equal(f.detail, undefined)
  })

  it('should show the rest of the first line as continuation when truncated', () => {
    const text = 'a'.repeat(80) + 'rest'
    const f = formatItem({ text, addedAt: 0 }, 0)
    assert.equal(f.label, 'a'.repeat(80) + '…')
    assert.equal(f.detail, '…rest')
  })

  it('should prefix other lines with the newline glyph and join them with spaces', () => {
    const f = formatItem({ text: 'line 1\nline 2\nline 3', addedAt: 0 }, 0)
    assert.equal(f.label, 'line 1')
    assert.equal(f.detail, '↵ line 2 ↵ line 3')
  })

  it('should combine first-line continuation and following lines', () => {
    const text = 'x'.repeat(80) + 'tail\nsecond line'
    const f = formatItem({ text, addedAt: 0 }, 0)
    assert.equal(f.label, 'x'.repeat(80) + '…')
    assert.equal(f.detail, '…tail ↵ second line')
  })

  it('should cap the detail preview at 200 chars + ellipsis', () => {
    const long = 'y'.repeat(500)
    const f = formatItem({ text: long, addedAt: 0 }, 0)
    assert.ok(f.detail!.length <= 201)
    assert.ok(f.detail!.endsWith('…'))
  })
})

describe('ClipboardHistory — pinning', () => {
  const LIMITS = { maxItems: 3, maxItemLength: 100 }

  it('should toggle the pinned state and report it', () => {
    const h = new ClipboardHistory(LIMITS)
    h.add('a')
    assert.equal(h.togglePin('a'), true)
    assert.equal(h.togglePin('a'), false)
    assert.equal(h.togglePin('missing'), null)
  })

  it('should not evict pinned entries when the cap is exceeded', () => {
    const h = new ClipboardHistory(LIMITS)
    h.add('keep me')
    h.togglePin('keep me')
    h.add('b')
    h.add('c')
    h.add('d')
    h.add('e') // exceeds maxItems for unpinned: 'b' falls, 'keep me' stays
    const texts = h.getAll().map(i => i.text)
    assert.ok(texts.includes('keep me'))
    assert.ok(!texts.includes('b'))
    assert.equal(h.getAll().filter(i => !i.pinned).length, 3)
  })

  it('should keep the pin when a pinned entry is re-copied', () => {
    const h = new ClipboardHistory(LIMITS)
    h.add('token')
    h.togglePin('token')
    h.add('other')
    h.add('token') // dedupe moves it to front
    const item = h.getAll().find(i => i.text === 'token')!
    assert.equal(item.pinned, true)
    assert.equal(h.getAll()[0].text, 'token')
  })

  it('should keep pinned entries on a soft clear and drop them on a full clear', () => {
    const h = new ClipboardHistory(LIMITS)
    h.add('pinned one')
    h.togglePin('pinned one')
    h.add('loose one')
    h.clear(true)
    assert.deepEqual(h.getAll().map(i => i.text), ['pinned one'])
    h.clear()
    assert.equal(h.size(), 0)
  })

  it('should count pinned entries', () => {
    const h = new ClipboardHistory(LIMITS)
    h.add('a')
    h.add('b')
    h.togglePin('a')
    assert.equal(h.pinnedCount(), 1)
  })

  it('should re-evict after unpinning when over the cap', () => {
    const h = new ClipboardHistory({ maxItems: 1, maxItemLength: 100 })
    h.add('a')
    h.togglePin('a')
    h.add('b') // 1 unpinned (b) + 1 pinned (a)
    h.togglePin('a') // unpin → 2 unpinned with cap 1 → oldest goes
    assert.deepEqual(h.getAll().map(i => i.text), ['b'])
  })

  it('should not evict pinned entries when limits shrink', () => {
    const h = new ClipboardHistory(LIMITS)
    h.add('a')
    h.togglePin('a')
    h.add('b')
    h.add('c')
    h.setLimits({ maxItems: 1, maxItemLength: 100 })
    const texts = h.getAll().map(i => i.text)
    assert.ok(texts.includes('a'))
    assert.equal(h.getAll().filter(i => !i.pinned).length, 1)
  })
})
