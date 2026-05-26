import { strict as assert } from 'assert'
import { parseGitBranchList, relativizeToRepo, buildDiffTitle } from '../../src/features/compare-utils'

describe('parseGitBranchList', () => {
  it('parses a typical for-each-ref output', () => {
    const output = ['feature/login', 'main', 'release/1.0', ''].join('\n')
    assert.deepEqual(parseGitBranchList(output), ['feature/login', 'main', 'release/1.0'])
  })

  it('strips whitespace and ignores blank lines', () => {
    const output = '  main  \n\nfeature/foo\n   \nbugfix/bar'
    assert.deepEqual(parseGitBranchList(output), ['main', 'feature/foo', 'bugfix/bar'])
  })

  it('handles CRLF line endings', () => {
    assert.deepEqual(parseGitBranchList('a\r\nb\r\n'), ['a', 'b'])
  })

  it('returns an empty array for empty output', () => {
    assert.deepEqual(parseGitBranchList(''), [])
    assert.deepEqual(parseGitBranchList('\n\n\n'), [])
  })
})

describe('relativizeToRepo', () => {
  it('returns the path relative to the repo root with forward slashes', () => {
    const out = relativizeToRepo('/repo', '/repo/src/foo/bar.ts')
    assert.equal(out, 'src/foo/bar.ts')
  })

  it('handles the file at the repo root', () => {
    assert.equal(relativizeToRepo('/repo', '/repo/README.md'), 'README.md')
  })
})

describe('buildDiffTitle', () => {
  it('formats the title with the branch name in parentheses', () => {
    assert.equal(buildDiffTitle('foo.ts', 'main'), 'foo.ts (main) ↔ foo.ts')
  })

  it('preserves branch names that contain slashes', () => {
    assert.equal(buildDiffTitle('foo.ts', 'feature/login'), 'foo.ts (feature/login) ↔ foo.ts')
  })
})
