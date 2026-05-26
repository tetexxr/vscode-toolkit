import { strict as assert } from 'assert'
import {
  parseTodos,
  groupByTag,
  groupByFile,
  formatItemLabel,
  formatItemDescription,
  type TodoItem
} from '../../src/features/todo-tree-utils'

const URI = 'file:///workspace/src/foo.ts'

const DEFAULTS = {
  tags: ['TODO', 'FIXME', 'HACK', 'NOTE'],
  caseSensitive: false
}

describe('parseTodos — comment styles', () => {
  it('detects // line comments', () => {
    const items = parseTodos('// TODO: refactor this\n', URI, DEFAULTS)
    assert.equal(items.length, 1)
    assert.equal(items[0].tag, 'TODO')
    assert.equal(items[0].message, 'refactor this')
    assert.equal(items[0].line, 0)
  })

  it('detects # comments (Python, shell, YAML)', () => {
    const items = parseTodos('# FIXME race condition\n', URI, DEFAULTS)
    assert.equal(items.length, 1)
    assert.equal(items[0].tag, 'FIXME')
    assert.equal(items[0].message, 'race condition')
  })

  it('detects /* block opening */', () => {
    const items = parseTodos('/* HACK: assume sorted */', URI, DEFAULTS)
    assert.equal(items.length, 1)
    assert.equal(items[0].tag, 'HACK')
    assert.equal(items[0].message, 'assume sorted')
  })

  it('detects HTML/Razor comments', () => {
    const items = parseTodos('<!-- NOTE: regenerate after migration -->', URI, DEFAULTS)
    assert.equal(items.length, 1)
    assert.equal(items[0].tag, 'NOTE')
    assert.equal(items[0].message, 'regenerate after migration')
  })

  it('detects block continuation lines starting with *', () => {
    const items = parseTodos(' * TODO: continuation line\n', URI, DEFAULTS)
    assert.equal(items.length, 1)
    assert.equal(items[0].tag, 'TODO')
  })

  it('detects SQL -- comments', () => {
    const items = parseTodos('-- TODO: revisit this query', URI, DEFAULTS)
    assert.equal(items.length, 1)
  })

  it('does not match tags inside a word (TODOLIST, foo_TODO_bar)', () => {
    const items = parseTodos('// TODOLIST: not a todo\n', URI, DEFAULTS)
    assert.equal(items.length, 0)
  })

  it('is case-insensitive by default and normalizes the tag to uppercase', () => {
    const items = parseTodos('// todo: lowercase here\n// Fixme: mixed case', URI, DEFAULTS)
    assert.equal(items.length, 2)
    assert.equal(items[0].tag, 'TODO')
    assert.equal(items[1].tag, 'FIXME')
  })

  it('respects caseSensitive when enabled', () => {
    const items = parseTodos('// todo: not matched\n// TODO: matched', URI, {
      tags: ['TODO'],
      caseSensitive: true
    })
    assert.equal(items.length, 1)
    assert.equal(items[0].message, 'matched')
  })

  it('captures the correct 0-based line number', () => {
    const items = parseTodos('a\nb\n// TODO three\nc', URI, DEFAULTS)
    assert.equal(items[0].line, 2)
  })

  it('handles CRLF line endings', () => {
    const items = parseTodos('a\r\n// TODO crlf\r\n', URI, DEFAULTS)
    assert.equal(items.length, 1)
    assert.equal(items[0].line, 1)
  })

  it('accepts a tag without a colon', () => {
    const items = parseTodos('// TODO no colon', URI, DEFAULTS)
    assert.equal(items.length, 1)
    assert.equal(items[0].message, 'no colon')
  })

  it('strips trailing */ for inline block comments', () => {
    const items = parseTodos('/* TODO: keep the message clean */', URI, DEFAULTS)
    assert.equal(items[0].message, 'keep the message clean')
  })

  it('strips trailing --> for HTML/Razor comments', () => {
    const items = parseTodos('<!-- TODO: html tail -->', URI, DEFAULTS)
    assert.equal(items[0].message, 'html tail')
  })

  it('returns an empty array when the tag list is empty', () => {
    const items = parseTodos('// TODO: nope', URI, { tags: [], caseSensitive: false })
    assert.equal(items.length, 0)
  })
})

describe('groupByTag', () => {
  const items: TodoItem[] = [
    { tag: 'TODO', message: 'a', line: 0, uri: 'file:///a.ts' },
    { tag: 'FIXME', message: 'b', line: 1, uri: 'file:///a.ts' },
    { tag: 'TODO', message: 'c', line: 0, uri: 'file:///b.ts' }
  ]

  it('groups items under their tag', () => {
    const groups = groupByTag(items)
    assert.equal(groups.length, 2)
    const todo = groups.find(g => g.tag === 'TODO')!
    const fixme = groups.find(g => g.tag === 'FIXME')!
    assert.equal(todo.items.length, 2)
    assert.equal(fixme.items.length, 1)
  })

  it('sorts groups alphabetically and items by (uri, line)', () => {
    const groups = groupByTag(items)
    assert.deepEqual(groups.map(g => g.tag), ['FIXME', 'TODO'])
    const todo = groups.find(g => g.tag === 'TODO')!
    assert.deepEqual(todo.items.map(i => i.uri), ['file:///a.ts', 'file:///b.ts'])
  })
})

describe('groupByFile', () => {
  const items: TodoItem[] = [
    { tag: 'TODO', message: 'a', line: 5, uri: 'file:///b.ts' },
    { tag: 'TODO', message: 'b', line: 1, uri: 'file:///a.ts' },
    { tag: 'TODO', message: 'c', line: 0, uri: 'file:///a.ts' }
  ]

  it('groups items by URI sorted naturally and sorts items by line', () => {
    const groups = groupByFile(items)
    assert.deepEqual(groups.map(g => g.uri), ['file:///a.ts', 'file:///b.ts'])
    assert.deepEqual(groups[0].items.map(i => i.line), [0, 1])
  })
})

describe('formatItemLabel / formatItemDescription', () => {
  it('uses the message as the label', () => {
    assert.equal(formatItemLabel({ tag: 'TODO', message: 'fix this', line: 0, uri: URI }), 'fix this')
  })

  it('falls back to (no description) when message is empty', () => {
    assert.equal(formatItemLabel({ tag: 'TODO', message: '', line: 0, uri: URI }), '(no description)')
  })

  it('formats description as relativePath:1-based line', () => {
    assert.equal(
      formatItemDescription({ tag: 'TODO', message: 'x', line: 4, uri: URI }, 'src/foo.ts'),
      'src/foo.ts:5'
    )
  })
})
