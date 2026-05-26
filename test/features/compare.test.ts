import { strict as assert } from 'assert'
import { parseGitBranchList, relativizeToRepo, buildDiffTitle } from '../../src/features/compare-utils'

describe('parseGitBranchList', () => {
  it('should parse a typical for-each-ref output', () => {
    const output = ['feature/login', 'main', 'release/1.0', ''].join('\n')
    assert.deepEqual(parseGitBranchList(output), ['feature/login', 'main', 'release/1.0'])
  })

  it('should strip whitespace and ignore blank lines', () => {
    const output = '  main  \n\nfeature/foo\n   \nbugfix/bar'
    assert.deepEqual(parseGitBranchList(output), ['main', 'feature/foo', 'bugfix/bar'])
  })

  it('should handle CRLF line endings', () => {
    assert.deepEqual(parseGitBranchList('a\r\nb\r\n'), ['a', 'b'])
  })

  it('should return an empty array for empty output', () => {
    assert.deepEqual(parseGitBranchList(''), [])
    assert.deepEqual(parseGitBranchList('\n\n\n'), [])
  })
})

describe('relativizeToRepo', () => {
  it('should return the path relative to the repo root with forward slashes', () => {
    const out = relativizeToRepo('/repo', '/repo/src/foo/bar.ts')
    assert.equal(out, 'src/foo/bar.ts')
  })

  it('should handle files at the repo root', () => {
    assert.equal(relativizeToRepo('/repo', '/repo/README.md'), 'README.md')
  })
})

describe('buildDiffTitle', () => {
  it('should format the title with the branch name in parentheses', () => {
    assert.equal(buildDiffTitle('foo.ts', 'main'), 'foo.ts (main) ↔ foo.ts')
  })

  it('should preserve branch names that contain slashes', () => {
    assert.equal(buildDiffTitle('foo.ts', 'feature/login'), 'foo.ts (feature/login) ↔ foo.ts')
  })
})
