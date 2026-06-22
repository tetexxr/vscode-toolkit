import { strict as assert } from 'assert'
import {
  parseGitBranchList,
  relativizeToRepo,
  buildDiffTitle,
  parseNameStatusZ,
  buildMultiDiffTitle,
  parseCommitLog
} from '../../../src/features/git/compare-utils'

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

describe('parseNameStatusZ', () => {
  it('should parse a modified file', () => {
    const out = 'M\0src/app.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'modified', oldPath: 'src/app.ts', newPath: 'src/app.ts' }
    ])
  })

  it('should resolve added files to the right side only', () => {
    const out = 'A\0src/new.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'added', oldPath: null, newPath: 'src/new.ts' }
    ])
  })

  it('should resolve deleted files to the left side only', () => {
    const out = 'D\0src/gone.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'deleted', oldPath: 'src/gone.ts', newPath: null }
    ])
  })

  it('should parse renames with both old and new paths', () => {
    const out = 'R100\0src/old.ts\0src/new.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'renamed', oldPath: 'src/old.ts', newPath: 'src/new.ts' }
    ])
  })

  it('should parse copies with both source and destination paths', () => {
    const out = 'C75\0src/a.ts\0src/b.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'copied', oldPath: 'src/a.ts', newPath: 'src/b.ts' }
    ])
  })

  it('should treat type changes as a modification of the same path', () => {
    const out = 'T\0src/link.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'type-changed', oldPath: 'src/link.ts', newPath: 'src/link.ts' }
    ])
  })

  it('should parse multiple mixed entries in one stream', () => {
    const out = 'M\0a.ts\0A\0b.ts\0R100\0c.ts\0d.ts\0D\0e.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'modified', oldPath: 'a.ts', newPath: 'a.ts' },
      { status: 'added', oldPath: null, newPath: 'b.ts' },
      { status: 'renamed', oldPath: 'c.ts', newPath: 'd.ts' },
      { status: 'deleted', oldPath: 'e.ts', newPath: null }
    ])
  })

  it('should preserve paths containing spaces', () => {
    const out = 'M\0src/my folder/a b.ts\0'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'modified', oldPath: 'src/my folder/a b.ts', newPath: 'src/my folder/a b.ts' }
    ])
  })

  it('should return an empty array for empty output', () => {
    assert.deepEqual(parseNameStatusZ(''), [])
    assert.deepEqual(parseNameStatusZ('\0\0'), [])
  })

  it('should ignore a trailing status with no path', () => {
    const out = 'M\0a.ts\0M'
    assert.deepEqual(parseNameStatusZ(out), [
      { status: 'modified', oldPath: 'a.ts', newPath: 'a.ts' }
    ])
  })
})

describe('buildMultiDiffTitle', () => {
  it('should use the singular noun for a single file', () => {
    assert.equal(buildMultiDiffTitle('src', 'main', 1), 'src ↔ main · 1 file')
  })

  it('should use the plural noun for multiple files', () => {
    assert.equal(buildMultiDiffTitle('src', 'main', 3), 'src ↔ main · 3 files')
  })

  it('should use the plural noun for zero files', () => {
    assert.equal(buildMultiDiffTitle('project', 'develop', 0), 'project ↔ develop · 0 files')
  })

  it('should preserve branch names with slashes', () => {
    assert.equal(buildMultiDiffTitle('app', 'feature/x', 2), 'app ↔ feature/x · 2 files')
  })

  it('should accept a short commit hash as the ref label', () => {
    assert.equal(buildMultiDiffTitle('src', 'a1b2c3d4', 5), 'src ↔ a1b2c3d4 · 5 files')
  })
})

describe('parseCommitLog', () => {
  const US = '\x1f'
  const RS = '\x1e'
  const entry = (fields: string[]) => fields.join(US) + RS

  it('should parse a single commit record', () => {
    const out = entry(['abc123full', 'abc123', 'Fix the bug', 'Ada', '3 days ago'])
    assert.deepEqual(parseCommitLog(out), [
      { hash: 'abc123full', short: 'abc123', subject: 'Fix the bug', author: 'Ada', relativeDate: '3 days ago' }
    ])
  })

  it('should parse multiple records, newest first', () => {
    const out =
      entry(['h1', 's1', 'first', 'A', 'now']) + entry(['h2', 's2', 'second', 'B', 'yesterday'])
    assert.deepEqual(parseCommitLog(out), [
      { hash: 'h1', short: 's1', subject: 'first', author: 'A', relativeDate: 'now' },
      { hash: 'h2', short: 's2', subject: 'second', author: 'B', relativeDate: 'yesterday' }
    ])
  })

  it('should preserve subjects that contain spaces and punctuation', () => {
    const out = entry(['h', 's', 'feat: add thing (#42), fast', 'Grace Hopper', '2 hours ago'])
    assert.deepEqual(parseCommitLog(out), [
      { hash: 'h', short: 's', subject: 'feat: add thing (#42), fast', author: 'Grace Hopper', relativeDate: '2 hours ago' }
    ])
  })

  it('should tolerate the newline git inserts between records', () => {
    const out = entry(['h1', 's1', 'first', 'A', 'now']) + '\n' + entry(['h2', 's2', 'second', 'B', 'then'])
    assert.deepEqual(parseCommitLog(out), [
      { hash: 'h1', short: 's1', subject: 'first', author: 'A', relativeDate: 'now' },
      { hash: 'h2', short: 's2', subject: 'second', author: 'B', relativeDate: 'then' }
    ])
  })

  it('should return an empty array for empty output', () => {
    assert.deepEqual(parseCommitLog(''), [])
    assert.deepEqual(parseCommitLog('\n'), [])
  })
})
