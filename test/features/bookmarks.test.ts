import { strict as assert } from 'assert'
import {
  BookmarkStore,
  adjustLineNumber,
  formatBookmark
} from '../../src/features/bookmarks-utils'

const URI = 'file:///workspace/src/foo.ts'
const OTHER = 'file:///workspace/src/bar.ts'

describe('BookmarkStore.toggle', () => {
  it('adds a new bookmark', () => {
    const store = new BookmarkStore()
    const result = store.toggle(URI, 5)
    assert.equal(result.added, true)
    assert.deepEqual(store.getForUri(URI), [{ line: 5 }])
  })

  it('removes a bookmark when toggled twice', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5)
    const result = store.toggle(URI, 5)
    assert.equal(result.added, false)
    assert.deepEqual(store.getForUri(URI), [])
  })

  it('keeps bookmarks sorted by line', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 10)
    store.toggle(URI, 2)
    store.toggle(URI, 5)
    assert.deepEqual(store.getForUri(URI).map(b => b.line), [2, 5, 10])
  })

  it('keeps URIs separate', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    store.toggle(OTHER, 1)
    assert.equal(store.getAll().length, 2)
    assert.equal(store.getForUri(URI).length, 1)
    assert.equal(store.getForUri(OTHER).length, 1)
  })

  it('stores the label when provided', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 3, 'entry point')
    assert.equal(store.find(URI, 3)?.label, 'entry point')
  })
})

describe('BookmarkStore.setLabel', () => {
  it('updates an existing bookmark label', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    assert.equal(store.setLabel(URI, 1, 'hello'), true)
    assert.equal(store.find(URI, 1)?.label, 'hello')
  })

  it('removes the label when empty string is passed', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1, 'before')
    store.setLabel(URI, 1, '')
    assert.equal(store.find(URI, 1)?.label, undefined)
  })

  it('returns false when the bookmark does not exist', () => {
    const store = new BookmarkStore()
    assert.equal(store.setLabel(URI, 7, 'x'), false)
  })
})

describe('BookmarkStore.clearForUri / clearAll', () => {
  it('clearForUri removes only bookmarks of one URI', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    store.toggle(URI, 2)
    store.toggle(OTHER, 1)
    const removed = store.clearForUri(URI)
    assert.equal(removed, 2)
    assert.equal(store.getForUri(URI).length, 0)
    assert.equal(store.getForUri(OTHER).length, 1)
  })

  it('clearAll empties the store', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    store.toggle(OTHER, 2)
    const removed = store.clearAll()
    assert.equal(removed, 2)
    assert.equal(store.getAll().length, 0)
  })
})

describe('BookmarkStore.load / serialize', () => {
  it('round-trips through JSON', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 3, 'foo')
    store.toggle(URI, 7)
    const data = store.serialize()
    const next = new BookmarkStore()
    next.load(data)
    assert.deepEqual(next.serialize(), data)
  })

  it('rejects malformed input', () => {
    const store = new BookmarkStore()
    store.load({ [URI]: [{ line: 1 }, { line: -1 }, { line: 'a' as unknown as number }, { line: 5, label: 'ok' }] })
    const all = store.getForUri(URI)
    assert.deepEqual(all, [{ line: 1 }, { line: 5, label: 'ok' }])
  })
})

describe('adjustLineNumber', () => {
  it('keeps bookmarks above the change unchanged', () => {
    assert.equal(adjustLineNumber(3, 10, 12, 5), 3)
  })

  it('shifts bookmarks below the change by delta', () => {
    assert.equal(adjustLineNumber(20, 10, 12, 5), 25)
    assert.equal(adjustLineNumber(20, 10, 15, -3), 17)
  })

  it('keeps bookmarks at the start line of the change', () => {
    assert.equal(adjustLineNumber(10, 10, 12, 5), 10)
  })

  it('returns null when the line is inside a pure deletion', () => {
    assert.equal(adjustLineNumber(11, 10, 12, -2), null)
  })

  it('collapses bookmarks inside a replacement to the start line', () => {
    assert.equal(adjustLineNumber(11, 10, 12, 0), 10)
    assert.equal(adjustLineNumber(11, 10, 12, 2), 10)
  })
})

describe('BookmarkStore.adjustForChange', () => {
  it('shifts bookmarks below an insertion by the number of new lines', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 10)
    store.adjustForChange(URI, { range: { start: { line: 2 }, end: { line: 2 } }, text: '\n\n\n' })
    assert.equal(store.find(URI, 13)?.line, 13)
  })

  it('removes bookmarks deleted by the change', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5)
    store.toggle(URI, 6)
    store.toggle(URI, 10)
    const { removed } = store.adjustForChange(URI, {
      range: { start: { line: 3 }, end: { line: 7 } },
      text: ''
    })
    assert.equal(removed, 2)
    assert.equal(store.getForUri(URI).length, 1)
    assert.equal(store.find(URI, 5), undefined)
    // The bookmark previously at line 10 should now be at line 10 - (7-3) = 6
    assert.equal(store.find(URI, 6)?.line, 6)
  })

  it('deduplicates bookmarks that collapse to the same line', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5)
    store.toggle(URI, 6)
    // Replace lines 4..6 (3 lines) with 3 different lines — delta = 0, both bookmarks
    // collapse to line 4. The duplicates are deduplicated to a single entry.
    store.adjustForChange(URI, { range: { start: { line: 4 }, end: { line: 6 } }, text: 'a\nb\nc' })
    assert.equal(store.getForUri(URI).length, 1)
    assert.equal(store.find(URI, 4)?.line, 4)
  })
})

describe('formatBookmark', () => {
  it('uses the label when present', () => {
    const f = formatBookmark(URI, { line: 4, label: 'auth flow' }, 'src/foo.ts', 'function login() {')
    assert.equal(f.label, 'auth flow')
    assert.equal(f.description, 'src/foo.ts:5')
    assert.equal(f.detail, 'function login() {')
  })

  it('falls back to the line text when no label is set', () => {
    const f = formatBookmark(URI, { line: 4 }, 'src/foo.ts', '  function login() {')
    assert.equal(f.label, 'function login() {')
    assert.equal(f.detail, undefined)
  })

  it('falls back to a "Line N" string when nothing else is available', () => {
    const f = formatBookmark(URI, { line: 7 }, 'src/foo.ts', undefined)
    assert.equal(f.label, 'Line 8')
  })
})
