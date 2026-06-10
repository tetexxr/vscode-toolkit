import { strict as assert } from 'assert'
import {
  BookmarkStore,
  adjustLineNumber,
  formatBookmark
} from '../../src/features/bookmarks-utils'

const URI = 'file:///workspace/src/foo.ts'
const OTHER = 'file:///workspace/src/bar.ts'

describe('BookmarkStore.toggle', () => {
  it('should add a new bookmark', () => {
    const store = new BookmarkStore()
    const result = store.toggle(URI, 5)
    assert.equal(result.added, true)
    assert.deepEqual(store.getForUri(URI), [{ line: 5 }])
  })

  it('should remove a bookmark when toggled twice', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5)
    const result = store.toggle(URI, 5)
    assert.equal(result.added, false)
    assert.deepEqual(store.getForUri(URI), [])
  })

  it('should keep bookmarks sorted by line', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 10)
    store.toggle(URI, 2)
    store.toggle(URI, 5)
    assert.deepEqual(store.getForUri(URI).map(b => b.line), [2, 5, 10])
  })

  it('should keep URIs separate', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    store.toggle(OTHER, 1)
    assert.equal(store.getAll().length, 2)
    assert.equal(store.getForUri(URI).length, 1)
    assert.equal(store.getForUri(OTHER).length, 1)
  })

  it('should store the label when provided', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 3, 'entry point')
    assert.equal(store.find(URI, 3)?.label, 'entry point')
  })
})

describe('BookmarkStore.setLabel', () => {
  it('should update an existing bookmark label', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    assert.equal(store.setLabel(URI, 1, 'hello'), true)
    assert.equal(store.find(URI, 1)?.label, 'hello')
  })

  it('should remove the label when an empty string is passed', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1, 'before')
    store.setLabel(URI, 1, '')
    assert.equal(store.find(URI, 1)?.label, undefined)
  })

  it('should return false when the bookmark does not exist', () => {
    const store = new BookmarkStore()
    assert.equal(store.setLabel(URI, 7, 'x'), false)
  })
})

describe('BookmarkStore.clearForUri / clearAll', () => {
  it('should remove only bookmarks of one URI when clearForUri is called', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    store.toggle(URI, 2)
    store.toggle(OTHER, 1)
    const removed = store.clearForUri(URI)
    assert.equal(removed, 2)
    assert.equal(store.getForUri(URI).length, 0)
    assert.equal(store.getForUri(OTHER).length, 1)
  })

  it('should empty the store when clearAll is called', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 1)
    store.toggle(OTHER, 2)
    const removed = store.clearAll()
    assert.equal(removed, 2)
    assert.equal(store.getAll().length, 0)
  })
})

describe('BookmarkStore.load / serialize', () => {
  it('should round-trip through JSON', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 3, 'foo')
    store.toggle(URI, 7)
    const data = store.serialize()
    const next = new BookmarkStore()
    next.load(data)
    assert.deepEqual(next.serialize(), data)
  })

  it('should reject malformed input', () => {
    const store = new BookmarkStore()
    store.load({ [URI]: [{ line: 1 }, { line: -1 }, { line: 'a' as unknown as number }, { line: 5, label: 'ok' }] })
    const all = store.getForUri(URI)
    assert.deepEqual(all, [{ line: 1 }, { line: 5, label: 'ok' }])
  })
})

describe('adjustLineNumber', () => {
  it('should keep bookmarks above the change unchanged', () => {
    assert.equal(adjustLineNumber(3, 10, 12, 5), 3)
  })

  it('should shift bookmarks below the change by delta', () => {
    assert.equal(adjustLineNumber(20, 10, 12, 5), 25)
    assert.equal(adjustLineNumber(20, 10, 15, -3), 17)
  })

  it('should keep bookmarks at the start line of the change', () => {
    assert.equal(adjustLineNumber(10, 10, 12, 5), 10)
  })

  it('should return null when the line is inside a pure deletion', () => {
    assert.equal(adjustLineNumber(11, 10, 12, -2), null)
  })

  it('should collapse bookmarks inside a replacement to the start line', () => {
    assert.equal(adjustLineNumber(11, 10, 12, 0), 10)
    assert.equal(adjustLineNumber(11, 10, 12, 2), 10)
  })
})

describe('BookmarkStore.adjustForChange', () => {
  it('should shift bookmarks below an insertion by the number of new lines', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 10)
    store.adjustForChange(URI, { range: { start: { line: 2 }, end: { line: 2 } }, text: '\n\n\n' })
    assert.equal(store.find(URI, 13)?.line, 13)
  })

  it('should remove bookmarks deleted by the change', () => {
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

  it('should deduplicate bookmarks that collapse to the same line', () => {
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
  it('should use the label when present', () => {
    const f = formatBookmark(URI, { line: 4, label: 'auth flow' }, 'src/foo.ts', 'function login() {')
    assert.equal(f.label, 'auth flow')
    assert.equal(f.description, 'src/foo.ts:5')
    assert.equal(f.detail, 'function login() {')
  })

  it('should fall back to the line text when no label is set', () => {
    const f = formatBookmark(URI, { line: 4 }, 'src/foo.ts', '  function login() {')
    assert.equal(f.label, 'function login() {')
    assert.equal(f.detail, undefined)
  })

  it('should fall back to a "Line N" string when nothing else is available', () => {
    const f = formatBookmark(URI, { line: 7 }, 'src/foo.ts', undefined)
    assert.equal(f.label, 'Line 8')
  })
})

describe('BookmarkStore.renamePath', () => {
  it('should move bookmarks to the new uri on a file rename', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5, 'mark')
    const moved = store.renamePath(URI, 'file:///workspace/src/renamed.ts')
    assert.equal(moved, 1)
    assert.deepEqual(store.getForUri(URI), [])
    assert.deepEqual(store.getForUri('file:///workspace/src/renamed.ts'), [{ line: 5, label: 'mark' }])
  })

  it('should move bookmarks of every file under a renamed folder', () => {
    const store = new BookmarkStore()
    store.toggle('file:///workspace/src/a.ts', 1)
    store.toggle('file:///workspace/src/nested/b.ts', 2)
    store.toggle('file:///workspace/other/c.ts', 3)
    const moved = store.renamePath('file:///workspace/src', 'file:///workspace/lib')
    assert.equal(moved, 2)
    assert.deepEqual(store.getForUri('file:///workspace/lib/a.ts'), [{ line: 1 }])
    assert.deepEqual(store.getForUri('file:///workspace/lib/nested/b.ts'), [{ line: 2 }])
    assert.deepEqual(store.getForUri('file:///workspace/other/c.ts'), [{ line: 3 }])
  })

  it('should not move uris that only share a textual prefix', () => {
    const store = new BookmarkStore()
    store.toggle('file:///workspace/src/app.ts', 1)
    store.toggle('file:///workspace/src/app2.ts', 2)
    store.renamePath('file:///workspace/src/app.ts', 'file:///workspace/src/main.ts')
    assert.deepEqual(store.getForUri('file:///workspace/src/app2.ts'), [{ line: 2 }])
    assert.deepEqual(store.getForUri('file:///workspace/src/main.ts'), [{ line: 1 }])
  })

  it('should merge with existing bookmarks at the target keeping one per line', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5, 'old')
    store.toggle(OTHER, 5, 'target')
    store.toggle(OTHER, 9)
    store.renamePath(URI, OTHER)
    const lines = store.getForUri(OTHER).map(b => b.line)
    assert.deepEqual(lines, [5, 9])
  })

  it('should return 0 when nothing matches', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5)
    assert.equal(store.renamePath('file:///workspace/none.ts', 'file:///workspace/new.ts'), 0)
    assert.deepEqual(store.getForUri(URI), [{ line: 5 }])
  })
})

describe('BookmarkStore.deletePath', () => {
  it('should remove bookmarks of a deleted file', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5)
    store.toggle(URI, 9)
    const removed = store.deletePath(URI)
    assert.equal(removed, 2)
    assert.deepEqual(store.getForUri(URI), [])
  })

  it('should remove bookmarks of every file under a deleted folder', () => {
    const store = new BookmarkStore()
    store.toggle('file:///workspace/src/a.ts', 1)
    store.toggle('file:///workspace/src/nested/b.ts', 2)
    store.toggle('file:///workspace/other/c.ts', 3)
    const removed = store.deletePath('file:///workspace/src')
    assert.equal(removed, 2)
    assert.deepEqual(store.getAll().map(e => e.uri), ['file:///workspace/other/c.ts'])
  })

  it('should not remove uris that only share a textual prefix', () => {
    const store = new BookmarkStore()
    store.toggle('file:///workspace/src/app.ts', 1)
    store.toggle('file:///workspace/src/app2.ts', 2)
    store.deletePath('file:///workspace/src/app.ts')
    assert.deepEqual(store.getForUri('file:///workspace/src/app2.ts'), [{ line: 2 }])
  })

  it('should return 0 when nothing matches', () => {
    const store = new BookmarkStore()
    store.toggle(URI, 5)
    assert.equal(store.deletePath('file:///workspace/none.ts'), 0)
  })
})
