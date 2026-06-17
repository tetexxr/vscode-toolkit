import { strict as assert } from 'assert'
import {
  extForLanguage,
  nextScratchName,
  parseScratchIndex,
  sortScratchNames
} from '../../src/features/scratch-utils'

describe('extForLanguage', () => {
  it('should map known language ids to their extension', () => {
    assert.equal(extForLanguage('typescript'), 'ts')
    assert.equal(extForLanguage('json'), 'json')
    assert.equal(extForLanguage('shellscript'), 'sh')
  })

  it('should fall back to txt for unknown languages', () => {
    assert.equal(extForLanguage('some-exotic-lang'), 'txt')
  })
})

describe('parseScratchIndex', () => {
  it('should extract the numeric suffix of an auto-generated name', () => {
    assert.equal(parseScratchIndex('scratch-7.ts'), 7)
  })

  it('should return null for names that do not match the pattern', () => {
    assert.equal(parseScratchIndex('notes.md'), null)
    assert.equal(parseScratchIndex('scratch.md'), null)
  })
})

describe('nextScratchName', () => {
  it('should start at 1 when there are no scratches', () => {
    assert.equal(nextScratchName([], 'md'), 'scratch-1.md')
  })

  it('should use one past the highest existing index', () => {
    assert.equal(nextScratchName(['scratch-1.md', 'scratch-3.js'], 'ts'), 'scratch-4.ts')
  })

  it('should ignore renamed files without the pattern', () => {
    assert.equal(nextScratchName(['notes.md', 'scratch-2.sql'], 'json'), 'scratch-3.json')
  })
})

describe('sortScratchNames', () => {
  it('should order auto-generated names by descending index', () => {
    assert.deepEqual(sortScratchNames(['scratch-1.md', 'scratch-3.md', 'scratch-2.md']), [
      'scratch-3.md',
      'scratch-2.md',
      'scratch-1.md'
    ])
  })

  it('should place auto-generated names before renamed ones', () => {
    assert.deepEqual(sortScratchNames(['notes.md', 'scratch-1.md']), ['scratch-1.md', 'notes.md'])
  })

  it('should sort renamed names alphabetically among themselves', () => {
    assert.deepEqual(sortScratchNames(['zeta.md', 'alpha.md']), ['alpha.md', 'zeta.md'])
  })

  it('should not mutate the input array', () => {
    const input = ['scratch-1.md', 'scratch-2.md']
    sortScratchNames(input)
    assert.deepEqual(input, ['scratch-1.md', 'scratch-2.md'])
  })
})
