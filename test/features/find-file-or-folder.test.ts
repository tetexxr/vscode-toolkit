import { strict as assert } from 'assert'
import { scoreItem, matchesFilter, parseTerms } from '../../src/utils/search'
import { removeFromRecent } from '../../src/features/find-file-or-folder-utils'

describe('find-file-or-folder', () => {
  describe('scoreItem', () => {
    it('should give 2 points for prefix match on a segment', () => {
      const segments = ['src', 'utils', 'braces.ts']
      assert.equal(scoreItem(segments, ['bra']), 2)
    })

    it('should give 1 point for substring (non-prefix) match', () => {
      const segments = ['src', 'utils', 'braces.ts']
      assert.equal(scoreItem(segments, ['race']), 1)
    })

    it('should give 0 points for no match', () => {
      const segments = ['src', 'utils', 'braces.ts']
      assert.equal(scoreItem(segments, ['xyz']), 0)
    })

    it('should sum scores across multiple terms', () => {
      const segments = ['src', 'utils', 'braces.ts']
      // 'src' prefix = 2, 'bra' prefix = 2
      assert.equal(scoreItem(segments, ['src', 'bra']), 4)
    })

    it('should pick the best score per term across segments', () => {
      const segments = ['src', 'services', 'search.ts']
      // 's' matches 'src' (prefix=2) → breaks early with best=2
      assert.equal(scoreItem(segments, ['s']), 2)
    })

    it('should handle empty terms', () => {
      const segments = ['src', 'utils']
      assert.equal(scoreItem(segments, []), 0)
    })

    it('should rank prefix match higher than substring match', () => {
      const score1 = scoreItem(['braces.ts'], ['bra'])
      const score2 = scoreItem(['add-braces.ts'], ['bra'])
      assert.ok(score1 > score2, 'prefix match should score higher')
    })
  })

  describe('matchesFilter', () => {
    const path = 'src/utils/braces.ts'

    it('should match when all include terms are present', () => {
      assert.equal(matchesFilter(path, ['utils', 'braces'], []), true)
    })

    it('should match regardless of term order', () => {
      assert.equal(matchesFilter(path, ['braces', 'src'], []), true)
    })

    it('should not match when an include term is missing', () => {
      assert.equal(matchesFilter(path, ['utils', 'xyz'], []), false)
    })

    it('should exclude when an exclude term matches', () => {
      assert.equal(matchesFilter(path, ['utils'], ['braces']), false)
    })

    it('should not exclude when the exclude term does not match', () => {
      assert.equal(matchesFilter(path, ['utils'], ['xyz']), true)
    })

    it('should handle multiple exclude terms', () => {
      assert.equal(matchesFilter(path, ['src'], ['test', 'spec']), true)
      assert.equal(matchesFilter(path, ['src'], ['utils', 'spec']), false)
    })

    it('should work with empty include (matches everything)', () => {
      assert.equal(matchesFilter(path, [], []), true)
    })

    it('should work with only exclude terms', () => {
      assert.equal(matchesFilter(path, [], ['test']), true)
      assert.equal(matchesFilter(path, [], ['utils']), false)
    })
  })

  describe('parseTerms', () => {
    it('should split include terms by spaces', () => {
      const { include, exclude } = parseTerms('utils braces')
      assert.deepEqual(include, ['utils', 'braces'])
      assert.deepEqual(exclude, [])
    })

    it('should parse negative terms with dash prefix', () => {
      const { include, exclude } = parseTerms('utils -test')
      assert.deepEqual(include, ['utils'])
      assert.deepEqual(exclude, ['test'])
    })

    it('should handle multiple negative terms', () => {
      const { include, exclude } = parseTerms('src -test -spec')
      assert.deepEqual(include, ['src'])
      assert.deepEqual(exclude, ['test', 'spec'])
    })

    it('should ignore bare dash', () => {
      const { include, exclude } = parseTerms('utils -')
      assert.deepEqual(include, ['utils'])
      assert.deepEqual(exclude, [])
    })

    it('should trim whitespace', () => {
      const { include, exclude } = parseTerms('  utils   braces  ')
      assert.deepEqual(include, ['utils', 'braces'])
      assert.deepEqual(exclude, [])
    })

    it('should lowercase all terms', () => {
      const { include, exclude } = parseTerms('Utils -Test')
      assert.deepEqual(include, ['utils'])
      assert.deepEqual(exclude, ['test'])
    })
  })

  describe('removeFromRecent', () => {
    it('should return a new array without the given path', () => {
      const recent = ['/a/x.ts', '/a/y.ts', '/a/z.ts']
      assert.deepEqual(removeFromRecent(recent, '/a/y.ts'), ['/a/x.ts', '/a/z.ts'])
    })

    it('should return null when the path is not in the list', () => {
      const recent = ['/a/x.ts', '/a/y.ts']
      assert.equal(removeFromRecent(recent, '/a/missing.ts'), null)
    })

    it('should return null for an empty list', () => {
      assert.equal(removeFromRecent([], '/a/x.ts'), null)
    })

    it('should not mutate the input array', () => {
      const recent = ['/a/x.ts', '/a/y.ts']
      removeFromRecent(recent, '/a/x.ts')
      assert.deepEqual(recent, ['/a/x.ts', '/a/y.ts'])
    })

    it('should match the exact fsPath, not a substring', () => {
      const recent = ['/a/y.ts']
      assert.equal(removeFromRecent(recent, '/a/y'), null)
      assert.equal(removeFromRecent(recent, 'y.ts'), null)
    })

    it('should remove every occurrence if duplicates exist', () => {
      const recent = ['/a/x.ts', '/a/y.ts', '/a/x.ts']
      assert.deepEqual(removeFromRecent(recent, '/a/x.ts'), ['/a/y.ts'])
    })
  })
})
