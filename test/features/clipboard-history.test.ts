import { strict as assert } from 'assert'
import {
  ClipboardHistory,
  formatItem,
  formatAge,
  truncate
} from '../../src/features/clipboard-history-utils'

describe('ClipboardHistory.add', () => {
  it('stores items in most-recent-first order', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('c', 3)
    assert.deepEqual(h.getAll().map(i => i.text), ['c', 'b', 'a'])
  })

  it('deduplicates by moving the existing item to the front', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('a', 3)
    const all = h.getAll()
    assert.deepEqual(all.map(i => i.text), ['a', 'b'])
    assert.equal(all[0].addedAt, 3)
  })

  it('enforces the maxItems FIFO cap', () => {
    const h = new ClipboardHistory({ maxItems: 3, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('c', 3)
    h.add('d', 4)
    assert.deepEqual(h.getAll().map(i => i.text), ['d', 'c', 'b'])
  })

  it('rejects empty strings', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 100 })
    assert.equal(h.add(''), false)
    assert.equal(h.size(), 0)
  })

  it('rejects items longer than maxItemLength', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 5 })
    assert.equal(h.add('hello world'), false)
    assert.equal(h.size(), 0)
  })

  it('accepts items exactly at maxItemLength', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 5 })
    assert.equal(h.add('hello'), true)
    assert.equal(h.size(), 1)
  })
})

describe('ClipboardHistory.clear / size / setLimits', () => {
  it('clear() empties the history', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a')
    h.add('b')
    h.clear()
    assert.equal(h.size(), 0)
    assert.deepEqual(h.getAll(), [])
  })

  it('setLimits trims existing items when maxItems shrinks', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('a', 1)
    h.add('b', 2)
    h.add('c', 3)
    h.setLimits({ maxItems: 2, maxItemLength: 1000 })
    assert.deepEqual(h.getAll().map(i => i.text), ['c', 'b'])
  })

  it('setLimits does not retroactively drop items longer than the new maxItemLength', () => {
    const h = new ClipboardHistory({ maxItems: 10, maxItemLength: 1000 })
    h.add('hello world')
    h.setLimits({ maxItems: 10, maxItemLength: 5 })
    assert.equal(h.size(), 1)
    // But further adds of new long items are rejected.
    assert.equal(h.add('foobar'), false)
  })
})

describe('truncate', () => {
  it('returns the input unchanged when shorter than the limit', () => {
    assert.equal(truncate('hello', 10), 'hello')
  })

  it('appends an ellipsis when truncating', () => {
    assert.equal(truncate('abcdefghij', 5), 'abcde…')
  })
})

describe('formatAge', () => {
  it('reports "just now" for under 5 seconds', () => {
    assert.equal(formatAge(0), 'just now')
    assert.equal(formatAge(4000), 'just now')
  })

  it('formats seconds / minutes / hours / days', () => {
    assert.equal(formatAge(10 * 1000), '10s ago')
    assert.equal(formatAge(2 * 60 * 1000), '2m ago')
    assert.equal(formatAge(3 * 60 * 60 * 1000), '3h ago')
    assert.equal(formatAge(2 * 24 * 60 * 60 * 1000), '2d ago')
  })

  it('handles negative deltas as "just now"', () => {
    assert.equal(formatAge(-1000), 'just now')
  })
})

describe('formatItem', () => {
  it('uses the first line of the text as the label', () => {
    const f = formatItem({ text: 'first line\nsecond line', addedAt: 0 }, 0)
    assert.equal(f.label, 'first line')
    assert.equal(f.description, '2 lines · just now')
  })

  it('truncates long labels with an ellipsis', () => {
    const long = 'x'.repeat(100)
    const f = formatItem({ text: long, addedAt: 0 }, 0)
    assert.equal(f.label.length, 81) // 80 chars + the … glyph
    assert.ok(f.label.endsWith('…'))
  })

  it('singularizes the line count for one-line entries', () => {
    const f = formatItem({ text: 'one liner', addedAt: 0 }, 0)
    assert.match(f.description, /^1 line · /)
  })

  it('shows a detail preview capped at 200 chars', () => {
    const long = 'y'.repeat(500)
    const f = formatItem({ text: long, addedAt: 0 }, 0)
    assert.ok(f.detail.length <= 201)
  })
})
