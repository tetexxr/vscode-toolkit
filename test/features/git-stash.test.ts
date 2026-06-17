import { strict as assert } from 'assert'
import { parseStashList } from '../../src/utils/git'

const SEP = '\x1f'

describe('parseStashList', () => {
  it('should return an empty array for empty output', () => {
    assert.deepEqual(parseStashList(''), [])
  })

  it('should parse a single stash line', () => {
    const line = `stash@{0}${SEP}WIP on main: 1a2b3c4 add feature${SEP}2 hours ago`
    assert.deepEqual(parseStashList(line), [
      { ref: 'stash@{0}', message: 'WIP on main: 1a2b3c4 add feature', relativeDate: '2 hours ago' }
    ])
  })

  it('should parse multiple stashes preserving order', () => {
    const output = [
      `stash@{0}${SEP}On main: latest${SEP}5 minutes ago`,
      `stash@{1}${SEP}WIP on dev: older${SEP}3 days ago`
    ].join('\n')
    const parsed = parseStashList(output)
    assert.equal(parsed.length, 2)
    assert.equal(parsed[0].ref, 'stash@{0}')
    assert.equal(parsed[1].ref, 'stash@{1}')
    assert.equal(parsed[1].relativeDate, '3 days ago')
  })

  it('should tolerate missing trailing fields', () => {
    assert.deepEqual(parseStashList(`stash@{0}${SEP}only a message`), [
      { ref: 'stash@{0}', message: 'only a message', relativeDate: '' }
    ])
  })
})
